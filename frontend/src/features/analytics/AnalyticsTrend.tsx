import { lazy, Suspense } from 'react'
import { AppCard, AppCardHeader, AppSelect } from 'react-desktop-shell'
import dayjs from 'dayjs'

import type { AnalyticsTrendPoint } from '../../../bindings/github.com/hicbowen/livemate/internal/domain/models.js'
import type { TrendLinePoint, TrendLineSeries } from '../../components/charts/TrendLineChart'
import { arrayOrEmpty, formatMetric, formatYuan } from '../../api'

const TrendLineChart = lazy(() => import('../../components/charts/TrendLineChart').then(({ TrendLineChart: chart }) => ({ default: chart })))

export type TrendMetricKey = 'revenue_cents' | 'followers_gained' | 'views' | 'avg_online' | 'avg_stay_seconds' | 'duration_minutes'

const metricOptions = [
  { value: 'revenue_cents', label: '流水' },
  { value: 'followers_gained', label: '新增粉丝' },
  { value: 'views', label: '场观' },
  { value: 'avg_online', label: '平均在线' },
  { value: 'avg_stay_seconds', label: '平均停留' },
  { value: 'duration_minutes', label: '直播时长' },
]

function metricValue(point: AnalyticsTrendPoint | undefined, metric: TrendMetricKey): number | null {
  const value = point?.[metric]
  return value === null || value === undefined ? null : value
}

function metricLabel(metric: TrendMetricKey): string {
  return metricOptions.find((option) => option.value === metric)?.label ?? '流水'
}

function formatTrendValue(value: number | null | undefined, metric: TrendMetricKey): string {
  if (value === null || value === undefined) return '—'
  if (metric === 'revenue_cents') return formatYuan(value)
  if (metric === 'duration_minutes') return `${formatMetric(value, 0)} 分钟`
  if (metric === 'avg_stay_seconds') return `${formatMetric(value, 1)} 秒`
  return formatMetric(value, metric === 'avg_online' ? 1 : 0)
}

function dateRange(startDate: string, endDate: string): string[] {
  const start = dayjs(startDate)
  const end = dayjs(endDate)
  if (!start.isValid() || !end.isValid() || start.isAfter(end)) return []
  return Array.from({ length: end.diff(start, 'day') + 1 }, (_, index) => start.add(index, 'day').format('YYYY-MM-DD'))
}

function alignedPoints(points: AnalyticsTrendPoint[], dates: string[], labels: string[], metric: TrendMetricKey): TrendLinePoint[] {
  const byDate = new Map(points.map((point) => [point.date, point]))
  return dates.map((date, index) => ({
    label: labels[index] ?? `第${index + 1}天`,
    date,
    value: metricValue(byDate.get(date), metric),
  }))
}

function latestValue(points: AnalyticsTrendPoint[], metric: TrendMetricKey): number | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const value = metricValue(points[index], metric)
    if (value !== null) return value
  }
  return null
}

interface AnalyticsTrendProps {
  trend: AnalyticsTrendPoint[] | null | undefined
  previousTrend: AnalyticsTrendPoint[] | null | undefined
  currentStartDate: string
  currentEndDate: string
  previousStartDate: string
  previousEndDate: string
  metric: TrendMetricKey
  onMetricChange: (metric: TrendMetricKey) => void
}

export function AnalyticsTrend({ trend, previousTrend, currentStartDate, currentEndDate, previousStartDate, previousEndDate, metric, onMetricChange }: AnalyticsTrendProps) {
  const current = arrayOrEmpty(trend)
  const previous = arrayOrEmpty(previousTrend)
  const currentDates = dateRange(currentStartDate, currentEndDate)
  const previousDates = dateRange(previousStartDate, previousEndDate)
  const labels = currentDates.map((date) => dayjs(date).format('MM-DD'))
  const currentPoints = alignedPoints(current, currentDates, labels, metric)
  const previousPoints = alignedPoints(previous, previousDates, labels, metric)
  const currentValues = currentPoints.map((point) => point.value).filter((value): value is number => value !== null)
  const previousValues = previousPoints.map((point) => point.value).filter((value): value is number => value !== null)
  const hasValues = currentValues.length > 0 || previousValues.length > 0
  const series: TrendLineSeries[] = [
    { key: 'current', name: '本周期', color: '#0f766e', points: currentPoints },
    ...(previousValues.length > 0 ? [{ key: 'previous', name: '上一周期', color: '#94a3b8', dashed: true, points: previousPoints }] : []),
  ]

  return <AppCard appearance="outlined" padding="regular" className="analytics-panel analytics-trend-panel">
    <AppCardHeader title="趋势分析" description="当前周期与等长上一周期的每日聚合；缺失指标保持为空。" action={<AppSelect aria-label="趋势指标" options={metricOptions} value={metric} onChange={(event) => onMetricChange(event.currentTarget.value as TrendMetricKey)} />} />
    {!hasValues ? <div className="analytics-chart-empty">当前周期暂无“{metricLabel(metric)}”数据。</div> : <div className="analytics-chart-wrap">
      <div className="analytics-chart-heading"><span>{metricLabel(metric)}</span><small>本周期 {formatTrendValue(latestValue(current, metric), metric)}{previousValues.length > 0 && ` · 上周期 ${formatTrendValue(latestValue(previous, metric), metric)}`}</small></div>
      <Suspense fallback={<div className="analytics-chart-loading">正在加载图表…</div>}><TrendLineChart ariaLabel={`${metricLabel(metric)}趋势图`} series={series} formatValue={(value) => formatTrendValue(value, metric)} /></Suspense>
      <div className="analytics-chart-periods"><span>本周期：{currentStartDate} ～ {currentEndDate}</span>{previousValues.length > 0 && <span>上一周期：{previousStartDate} ～ {previousEndDate}</span>}</div>
    </div>}
  </AppCard>
}
