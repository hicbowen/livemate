import { useEffect, useMemo, useState } from 'react'
import { AppButton, AppCard, AppPage, AppSelect } from 'react-desktop-shell'
import { ArrowClockwiseRegular } from '@fluentui/react-icons'
import dayjs from 'dayjs'

import type {
  AnchorFilter,
  AnchorListItem,
  AnalyticsQuery,
  AnalyticsResult,
} from '../../../bindings/github.com/hicbowen/livemate/internal/domain/models.js'
import { arrayOrEmpty, errorMessage, Service } from '../../api'
import { AnalyticsInsights } from './AnalyticsInsights'
import { AnalyticsSummary } from './AnalyticsSummary'
import { AnalyticsTrend, type TrendMetricKey } from './AnalyticsTrend'
import { AnchorComparisonTable } from './AnchorComparisonTable'
import './analytics.css'

type RangePreset = '7' | '14' | '30' | 'custom'

const anchorListRequest: AnchorFilter = {
  query: '', stage: '', status: '', attention_level: '', tag: '', page: 1, page_size: 200, sort_by: 'nickname', sort_desc: false,
}

const rangeOptions: { value: RangePreset; label: string }[] = [
  { value: '7', label: '近 7 天' },
  { value: '14', label: '近 14 天' },
  { value: '30', label: '近 30 天' },
  { value: 'custom', label: '自定义' },
]

function localDate(): string {
  return dayjs().format('YYYY-MM-DD')
}

function rangeStart(endDate: string, days: number): string {
  return dayjs(endDate).subtract(days - 1, 'day').format('YYYY-MM-DD')
}

function valuesFromAnchors(anchors: AnchorListItem[], field: 'stage' | 'platform' | 'category'): string[] {
  return Array.from(new Set(anchors.map((anchor) => anchor[field]).filter(Boolean))).sort((left, right) => left.localeCompare(right, 'zh-CN'))
}

function filterOptions(values: string[]) {
  return [{ value: '', label: '全部' }, ...values.map((value) => ({ value, label: value }))]
}

function ErrorNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="notice notice-error analytics-error" role="alert"><span>{message}</span><AppButton size="compact" appearance="subtle" onClick={onRetry}>重新加载</AppButton></div>
}

function LoadingState() {
  return <div className="loading-state analytics-loading"><ArrowClockwiseRegular className="loading-icon" aria-hidden="true" fontSize={16} />正在分析数据…</div>
}

export function AnalyticsPage({ onOpenAnchor }: { onOpenAnchor: (id: number) => void }) {
  const today = localDate()
  const [range, setRange] = useState<RangePreset>('7')
  const [startDate, setStartDate] = useState(() => rangeStart(today, 7))
  const [endDate, setEndDate] = useState(today)
  const [anchorID, setAnchorID] = useState('')
  const [stage, setStage] = useState('')
  const [platform, setPlatform] = useState('')
  const [category, setCategory] = useState('')
  const [anchors, setAnchors] = useState<AnchorListItem[]>([])
  const [data, setData] = useState<AnalyticsResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadToken, setReloadToken] = useState(0)
  const [trendMetric, setTrendMetric] = useState<TrendMetricKey>('revenue_cents')

  useEffect(() => {
    let alive = true
    Service.ListAnchors(anchorListRequest).then((result) => {
      if (alive) setAnchors(arrayOrEmpty(result.items))
    }).catch(() => undefined)
    return () => { alive = false }
  }, [])

  const query = useMemo<AnalyticsQuery>(() => ({
    start_date: startDate,
    end_date: endDate,
    anchor_ids: anchorID ? [Number(anchorID)] : [],
    stage,
    platform,
    category,
  }), [anchorID, category, endDate, platform, stage, startDate])
  const validRange = Boolean(startDate && endDate && startDate <= endDate)

  useEffect(() => {
    if (!validRange) {
      setData(null)
      setLoading(false)
      setError('自定义时间范围无效：开始日期不能晚于结束日期。')
      return
    }
    let alive = true
    setLoading(true)
    setError('')
    Service.GetAnalytics(query).then((result) => {
      if (alive) setData(result)
    }).catch((reason) => {
      if (alive) setError(errorMessage(reason))
    }).finally(() => {
      if (alive) setLoading(false)
    })
    return () => { alive = false }
  }, [query, reloadToken, validRange])

  const chooseRange = (value: RangePreset) => {
    setRange(value)
    if (value !== 'custom') {
      setEndDate(today)
      setStartDate(rangeStart(today, Number(value)))
    }
  }

  const stageOptions = useMemo(() => filterOptions(valuesFromAnchors(anchors, 'stage')), [anchors])
  const platformOptions = useMemo(() => filterOptions(valuesFromAnchors(anchors, 'platform')), [anchors])
  const categoryOptions = useMemo(() => filterOptions(valuesFromAnchors(anchors, 'category')), [anchors])
  const anchorOptions = useMemo(() => [{ value: '', label: '全部主播' }, ...anchors.map((anchor) => ({ value: String(anchor.id), label: anchor.nickname }))], [anchors])
  const currentSessionCount = data?.comparison.current.session_count ?? 0

  if (loading && !data) {
    return <AppPage title="数据分析" description="从统一 Analytics 层查看整体变化、主播表现和固定规则提醒。"><LoadingState /></AppPage>
  }

  return <AppPage title="数据分析" description={`${startDate} ～ ${endDate} · 统计来自直播场次与主播档案`} actions={<AppButton appearance="subtle" icon={<ArrowClockwiseRegular aria-hidden="true" fontSize={16} />} onClick={() => setReloadToken((value) => value + 1)}>刷新</AppButton>}>
    <AppCard appearance="outlined" padding="regular" className="analytics-filter-card">
      <div className="analytics-filter-heading"><div><strong>分析范围</strong><span>默认近 7 天，可叠加主播、阶段、平台和赛道筛选。</span></div>{loading && data && <span className="analytics-inline-loading">正在分析数据…</span>}</div>
      <div className="analytics-range-buttons" role="group" aria-label="时间范围">
        {rangeOptions.map((option) => <button type="button" key={option.value} className={range === option.value ? 'is-active' : ''} onClick={() => chooseRange(option.value)}>{option.label}</button>)}
      </div>
      {range === 'custom' && <div className="analytics-date-fields"><label>开始日期<input type="date" value={startDate} onChange={(event) => setStartDate(event.currentTarget.value)} /></label><span>至</span><label>结束日期<input type="date" value={endDate} onChange={(event) => setEndDate(event.currentTarget.value)} /></label></div>}
      <div className="analytics-filter-grid">
        <label>主播<AppSelect options={anchorOptions} value={anchorID} onValueChange={(value) => setAnchorID(value ?? '')} /></label>
        <label>阶段<AppSelect options={stageOptions} value={stage} onValueChange={(value) => setStage(value ?? '')} /></label>
        <label>平台<AppSelect options={platformOptions} value={platform} onValueChange={(value) => setPlatform(value ?? '')} /></label>
        <label>赛道<AppSelect options={categoryOptions} value={category} onValueChange={(value) => setCategory(value ?? '')} /></label>
      </div>
    </AppCard>

    {error && <ErrorNotice message={error} onRetry={() => setReloadToken((value) => value + 1)} />}
    {!data ? <AppCard appearance="outlined" padding="regular" className="analytics-state-card"><div className="analytics-empty"><strong>数据分析暂时不可用</strong><span>请重新加载，或检查本地数据库连接。</span></div></AppCard> : <>
      <AnalyticsSummary comparison={data.comparison} />
      {currentSessionCount === 0 ? <AppCard appearance="outlined" padding="regular" className="analytics-state-card"><div className="analytics-empty"><strong>该时间范围暂无直播数据</strong><span>换一个时间范围，或先录入主播直播数据。</span></div></AppCard> : <>
        <div className="analytics-main-grid"><AnalyticsTrend trend={data.trend} previousTrend={data.previous_trend} currentStartDate={data.query.start_date} currentEndDate={data.query.end_date} previousStartDate={data.previous_start} previousEndDate={data.previous_end} metric={trendMetric} onMetricChange={setTrendMetric} /><AnalyticsInsights insights={data.insights} onOpenAnchor={onOpenAnchor} /></div>
        <section className="analytics-anchor-section"><div className="analytics-section-heading"><div><h2>主播表现</h2><p>点击主播进入详情；环比重点只展示流水，表格默认按流水降序。</p></div><span>{arrayOrEmpty(data.anchors).length} 位</span></div><AnchorComparisonTable anchors={data.anchors} onOpenAnchor={onOpenAnchor} /></section>
      </>}
    </>}
  </AppPage>
}
