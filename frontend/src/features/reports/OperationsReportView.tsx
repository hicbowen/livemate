import type { AnchorAnalyticsRow, AnalyticsInsight, OperationsReport } from '../../../bindings/github.com/hicbowen/livemate/internal/domain/models.js'
import { arrayOrEmpty, formatMetric, formatPercent, formatYuan } from '../../api'

function unknown(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined ? '暂无数据' : formatMetric(value, digits)
}

function change(value: number | null | undefined): string {
  if (value === null || value === undefined) return '暂无上一周期可比数据'
  if (value === 0) return '持平'
  return `${value > 0 ? '↑' : '↓'} ${formatPercent(Math.abs(value))}`
}

function periodStats(report: OperationsReport) {
  const summary = report.analytics.comparison.current
  return [
    ['开播主播', `${summary.active_anchor_count} 位`],
    ['直播场次', `${summary.session_count} 场`],
    ['总时长', summary.duration_minutes === null || summary.duration_minutes === undefined ? '暂无数据' : `${formatMetric(summary.duration_minutes / 60, 1)} 小时`],
    ['场观', unknown(summary.views, 0)],
    ['新增粉丝', summary.followers_gained === null || summary.followers_gained === undefined ? '暂无数据' : `${formatMetric(summary.followers_gained, 0)} 人`],
    ['流水', formatYuan(summary.revenue_cents)],
  ]
}

function AnchorChangeList({ title, rows, onOpenAnchor }: { title: string; rows: AnchorAnalyticsRow[]; onOpenAnchor: (id: number) => void }) {
  return <div className="report-subsection"><h3>{title}</h3>{rows.length === 0 ? <p className="report-muted">暂无上一周期可比数据。</p> : <div className="report-anchor-change-list">{rows.map((row) => <button type="button" key={row.anchor_id} onClick={() => onOpenAnchor(row.anchor_id)}><span><strong>{row.nickname}</strong><small>{row.stage} · {row.platform}</small></span><em className={(row.revenue_change_rate ?? 0) >= 0 ? 'is-positive' : 'is-negative'}>{change(row.revenue_change_rate)}</em></button>)}</div>}</div>
}

function InsightList({ insights, onOpenAnchor }: { insights: AnalyticsInsight[]; onOpenAnchor: (id: number) => void }) {
  return <div className="report-record-list">{insights.length === 0 ? <p className="report-muted">本周期暂无达到规则阈值的重点变化。</p> : insights.map((insight) => <button type="button" key={insight.id} onClick={() => onOpenAnchor(insight.anchor_id)}><strong>{insight.nickname} · {insight.title}</strong><span>{insight.detail}</span></button>)}</div>
}

export function OperationsReportView({ report, onOpenAnchor }: { report: OperationsReport; onOpenAnchor: (id: number) => void }) {
  const anchors = arrayOrEmpty(report.analytics.anchors)
  const rising = anchors.filter((row) => (row.revenue_change_rate ?? 0) > 0).sort((left, right) => (right.revenue_change_rate ?? 0) - (left.revenue_change_rate ?? 0)).slice(0, 3)
  const falling = anchors.filter((row) => (row.revenue_change_rate ?? 0) < 0).sort((left, right) => (left.revenue_change_rate ?? 0) - (right.revenue_change_rate ?? 0)).slice(0, 3)
  const comparison = report.analytics.comparison
  return <article className="report-document">
    <header className="report-document-header"><span>播伴 · 运营周期报告</span><h1>{report.start_date} ～ {report.end_date}</h1><p>本报告基于统一 Analytics 统计与运营闭环记录生成，不包含没有数据支撑的因果判断。</p></header>
    {comparison.current.session_count === 0 && <div className="report-no-data">本周期暂无直播数据，下面的运营事项统计仍按已有记录展示。</div>}
    <section className="report-document-section"><h2>整体情况</h2><div className="report-document-stats">{periodStats(report).map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></section>
    <section className="report-document-section"><h2>与上一周期对比</h2><div className="report-comparison-list"><div><span>流水</span><strong>{change(comparison.revenue_change_rate)}</strong></div><div><span>新增粉丝</span><strong>{change(comparison.followers_change_rate)}</strong></div><div><span>平均在线</span><strong>{change(comparison.avg_online_change_rate)}</strong></div><div><span>平均停留</span><strong>{change(comparison.avg_stay_change_rate)}</strong></div></div></section>
    <section className="report-document-section"><h2>主播变化</h2><div className="report-two-columns"><AnchorChangeList title="上涨较明显" rows={rising} onOpenAnchor={onOpenAnchor} /><AnchorChangeList title="下降较明显" rows={falling} onOpenAnchor={onOpenAnchor} /></div></section>
    <section className="report-document-section"><h2>问题与方案</h2><div className="report-two-columns"><div className="report-summary-block"><h3>问题情况</h3><p>新增 {report.issue_summary.new_count} 项 · 仍待处理 {report.issue_summary.pending_count} 项</p><p>重点 {report.issue_summary.important_count} 项 · 紧急 {report.issue_summary.urgent_count} 项</p><p>本期解决 {report.issue_summary.resolved_count} 项</p></div><div className="report-summary-block"><h3>改进方案</h3><p>新增 {report.plan_summary.new_count} 项 · 执行中 {report.plan_summary.in_progress_count} 项</p><p>待跟进 {report.plan_summary.pending_followup_count} 项</p><p>有效 {report.plan_summary.validated_count} 项 · 无效 {report.plan_summary.invalid_count} 项 · 终止 {report.plan_summary.terminated_count} 项</p></div></div></section>
    <section className="report-document-section"><h2>阶段目标</h2><div className="report-summary-block"><p>进行中 {report.goal_summary.in_progress_count} 项 · 本期完成 {report.goal_summary.completed_count} 项</p><p>即将到期 {report.goal_summary.due_soon_count} 项 · 已逾期 {report.goal_summary.overdue_count} 项</p></div></section>
    <section className="report-document-section"><h2>重点变化</h2><InsightList insights={arrayOrEmpty(report.analytics.insights)} onOpenAnchor={onOpenAnchor} /></section>
  </article>
}
