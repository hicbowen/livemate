import { AppCard } from 'react-desktop-shell'

import type { AnalyticsComparison, AnalyticsSummary as AnalyticsSummaryModel } from '../../../bindings/github.com/hicbowen/livemate/internal/domain/models.js'
import { formatMetric, formatPercent, formatYuan } from '../../api'

function displayChange(rate: number | null | undefined, hasPreviousData: boolean) {
  if (rate === null || rate === undefined) {
    return <span className="analytics-change is-muted">{hasPreviousData ? '暂无可比数据' : '暂无上一周期数据'}</span>
  }
  const positive = rate >= 0
  return <span className={`analytics-change ${positive ? 'is-positive' : 'is-negative'}`}>{positive ? '↑' : '↓'} {formatPercent(Math.abs(rate))} 较上一周期</span>
}

function signedMetric(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `${value >= 0 ? '+' : ''}${formatMetric(value, digits)}`
}

function cardValue(value: string, unit?: string) {
  return <strong>{value}{value !== '—' && unit && <small>{unit}</small>}</strong>
}

function MetricCard({ label, value, unit, note, change }: { label: string; value: string; unit?: string; note: string; change?: React.ReactNode }) {
  return <AppCard appearance="outlined" padding="compact" className="analytics-metric-card">
    <span>{label}</span>
    {cardValue(value, unit)}
    <p>{change ?? note}</p>
  </AppCard>
}

export function AnalyticsSummary({ comparison }: { comparison: AnalyticsComparison }) {
  const current: AnalyticsSummaryModel = comparison.current
  const hasPreviousData = comparison.previous.session_count > 0
  const durationHours = current.duration_minutes === null || current.duration_minutes === undefined ? null : current.duration_minutes / 60
  return <section className="analytics-summary-grid" aria-label="核心指标">
    <MetricCard label="开播主播" value={formatMetric(current.active_anchor_count, 0)} note="当前在册主播口径" />
    <MetricCard label="直播场次" value={formatMetric(current.session_count, 0)} note={current.session_count ? '范围内有直播记录' : '范围内暂无记录'} />
    <MetricCard label="直播时长" value={durationHours === null ? '—' : formatMetric(durationHours, 1)} unit="小时" note="已知时长求和" change={displayChange(comparison.duration_change_rate, hasPreviousData)} />
    <MetricCard label="场观" value={formatMetric(current.views, 0)} note="未知场观不会计为零" change={displayChange(comparison.views_change_rate, hasPreviousData)} />
    <MetricCard label="新增粉丝" value={signedMetric(current.followers_gained)} unit="人" note="已知涨粉求和" change={displayChange(comparison.followers_change_rate, hasPreviousData)} />
    <MetricCard label="流水" value={formatYuan(current.revenue_cents)} note="已知流水求和" change={displayChange(comparison.revenue_change_rate, hasPreviousData)} />
  </section>
}
