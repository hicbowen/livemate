import { AppCard, AppCardHeader, AppSelect } from 'react-desktop-shell'

import type { AnalyticsTrendPoint } from '../../../bindings/github.com/hicbowen/livemate/internal/domain/models.js'
import { arrayOrEmpty, formatMetric, formatYuan } from '../../api'

export type TrendMetricKey = 'revenue_cents' | 'followers_gained' | 'views' | 'avg_online' | 'avg_stay_seconds' | 'duration_minutes'

const metricOptions = [
  { value: 'revenue_cents', label: '流水' },
  { value: 'followers_gained', label: '新增粉丝' },
  { value: 'views', label: '场观' },
  { value: 'avg_online', label: '平均在线' },
  { value: 'avg_stay_seconds', label: '平均停留' },
  { value: 'duration_minutes', label: '直播时长' },
]

function metricValue(point: AnalyticsTrendPoint, metric: TrendMetricKey): number | null {
  const value = point[metric]
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

function values(points: AnalyticsTrendPoint[], metric: TrendMetricKey): number[] {
  return points.map((point) => metricValue(point, metric)).filter((value): value is number => value !== null)
}

function coordinate(index: number, count: number, value: number, min: number, max: number): string {
  const width = 760
  const height = 170
  const left = 18
  const right = 10
  const top = 12
  const bottom = 22
  const x = count <= 1 ? (width - left - right) / 2 + left : left + (index / (count - 1)) * (width - left - right)
  const y = top + (1 - (value - min) / (max - min || 1)) * (height - top - bottom)
  return `${x},${y}`
}

function lineSegments(points: AnalyticsTrendPoint[], metric: TrendMetricKey, min: number, max: number): string[] {
  const segments: string[][] = []
  let current: string[] = []
  points.forEach((point, index) => {
    const value = metricValue(point, metric)
    if (value === null) {
      if (current.length > 0) segments.push(current)
      current = []
      return
    }
    current.push(coordinate(index, points.length, value, min, max))
  })
  if (current.length > 0) segments.push(current)
  return segments.map((segment) => segment.join(' '))
}

function latestValue(points: AnalyticsTrendPoint[], metric: TrendMetricKey): number | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const value = metricValue(points[index], metric)
    if (value !== null) return value
  }
  return null
}

export function AnalyticsTrend({ trend, previousTrend, metric, onMetricChange }: { trend: AnalyticsTrendPoint[] | null | undefined; previousTrend: AnalyticsTrendPoint[] | null | undefined; metric: TrendMetricKey; onMetricChange: (metric: TrendMetricKey) => void }) {
  const current = arrayOrEmpty(trend)
  const previous = arrayOrEmpty(previousTrend)
  const currentValues = values(current, metric)
  const previousValues = values(previous, metric)
  const allValues = [...currentValues, ...previousValues]
  const hasValues = allValues.length > 0
  let min = hasValues ? Math.min(...allValues) : 0
  let max = hasValues ? Math.max(...allValues) : 1
  if (min === max) {
    const padding = min === 0 ? 1 : Math.abs(min) * 0.12
    min -= padding
    max += padding
  }
  const currentSegments = lineSegments(current, metric, min, max)
  const previousSegments = lineSegments(previous, metric, min, max)

  return <AppCard appearance="outlined" padding="regular" className="analytics-panel analytics-trend-panel">
    <AppCardHeader title="趋势分析" description="当前周期与等长上一周期的每日聚合；缺失指标保持为空。" action={<AppSelect aria-label="趋势指标" options={metricOptions} value={metric} onChange={(event) => onMetricChange(event.currentTarget.value as TrendMetricKey)} />} />
    {!hasValues ? <div className="analytics-chart-empty">当前周期暂无“{metricLabel(metric)}”数据。</div> : <div className="analytics-chart-wrap">
      <div className="analytics-chart-heading"><span>{metricLabel(metric)}</span><small>本周期 {formatTrendValue(latestValue(current, metric), metric)}{previousValues.length > 0 && ` · 上周期 ${formatTrendValue(latestValue(previous, metric), metric)}`}</small></div>
      <svg className="analytics-chart" viewBox="0 0 760 170" role="img" aria-label={`${metricLabel(metric)}趋势图`} preserveAspectRatio="none">
        {[0, 1, 2, 3].map((line) => <line key={line} x1="18" x2="750" y1={12 + line * 45} y2={12 + line * 45} className="analytics-chart-gridline" />)}
        {previousSegments.map((segment, index) => <polyline key={`previous-${index}`} points={segment} className="analytics-chart-line is-previous" fill="none" />)}
        {currentSegments.map((segment, index) => <polyline key={`current-${index}`} points={segment} className="analytics-chart-line" fill="none" />)}
        {current.map((point, index) => {
          const value = metricValue(point, metric)
          return value === null ? null : <circle key={`${point.date}-${index}`} cx={coordinate(index, current.length, value, min, max).split(',')[0]} cy={coordinate(index, current.length, value, min, max).split(',')[1]} r="3.2" className="analytics-chart-point" />
        })}
      </svg>
      <div className="analytics-chart-axis"><span>{current[0]?.date ?? '—'}</span><span>{current[current.length - 1]?.date ?? '—'}</span></div>
      <div className="analytics-chart-legend"><span><i className="analytics-legend-dot is-current" />本周期</span>{previousValues.length > 0 && <span><i className="analytics-legend-dot is-previous" />上一周期（{previous[0]?.date ?? '—'} ～ {previous[previous.length - 1]?.date ?? '—'}）</span>}</div>
    </div>}
  </AppCard>
}
