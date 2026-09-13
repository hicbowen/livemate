import type { AnchorPeriodReport, AnalyticsInsight, AnchorIssue, ImprovementPlan } from '../../../bindings/github.com/hicbowen/livemate/internal/domain/models.js'
import { arrayOrEmpty, formatDate, formatMetric, formatPercent, formatYuan } from '../../api'

function unknown(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined ? '暂无数据' : formatMetric(value, digits)
}

function change(value: number | null | undefined): string {
  if (value === null || value === undefined) return '暂无上一周期可比数据'
  if (value === 0) return '持平'
  return `${value > 0 ? '↑' : '↓'} ${formatPercent(Math.abs(value))}`
}

function IssueList({ title, items, onOpen }: { title: string; items: AnchorIssue[]; onOpen: (id: number) => void }) {
  return <div className="report-subsection"><h3>{title}</h3>{items.length === 0 ? <p className="report-muted">暂无记录。</p> : <div className="report-record-list">{items.slice(0, 8).map((item) => <button type="button" key={item.id} onClick={() => onOpen(item.id)}><strong>{item.title}</strong><span>{item.status} · {item.priority} · {item.category}</span></button>)}</div>}</div>
}

function PlanList({ title, items, onOpen }: { title: string; items: ImprovementPlan[]; onOpen: (id: number) => void }) {
  return <div className="report-subsection"><h3>{title}</h3>{items.length === 0 ? <p className="report-muted">暂无记录。</p> : <div className="report-record-list">{items.slice(0, 8).map((item) => <button type="button" key={item.id} onClick={() => onOpen(item.id)}><strong>{item.title}</strong><span>{item.status}{item.metric_name ? ` · ${item.metric_name}` : ''}</span></button>)}</div>}</div>
}

export function AnchorReportView({ report, onOpenAnchor }: { report: AnchorPeriodReport; onOpenAnchor: (id: number, tab?: 'issues' | 'plans' | 'goals', targetId?: number) => void }) {
  const row = arrayOrEmpty(report.analytics.anchors)[0]
  const comparison = report.analytics.comparison
  const insights = arrayOrEmpty(report.analytics.insights) as AnalyticsInsight[]
  return <article className="report-document">
    <header className="report-document-header"><span>播伴 · 主播阶段报告</span><h1>{report.anchor.nickname}</h1><p>{report.start_date} ～ {report.end_date} · {report.anchor.platform}{report.anchor.category ? ` · ${report.anchor.category}` : ''}</p></header>
    <section className="report-document-section"><h2>主播资料</h2><div className="report-profile-grid"><div><span>昵称</span><strong>{report.anchor.nickname}</strong></div><div><span>平台</span><strong>{report.anchor.platform}</strong></div><div><span>阶段</span><strong>{report.anchor.stage}</strong></div><div><span>赛道</span><strong>{report.anchor.category || '未填写'}</strong></div></div></section>
    <section className="report-document-section"><h2>周期核心数据</h2>{row ? <div className="report-document-stats">{[['直播场次', `${row.session_count} 场`], ['直播时长', row.duration_minutes === null || row.duration_minutes === undefined ? '暂无数据' : `${formatMetric(row.duration_minutes / 60, 1)} 小时`], ['场观', unknown(row.views, 0)], ['平均在线', unknown(row.avg_online)], ['新增粉丝', row.followers_gained === null || row.followers_gained === undefined ? '暂无数据' : `${formatMetric(row.followers_gained, 0)} 人`], ['流水', formatYuan(row.revenue_cents)]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div> : <p className="report-muted">本周期暂无直播记录。</p>}</section>
    <section className="report-document-section"><h2>上一周期对比</h2><div className="report-comparison-list"><div><span>流水</span><strong>{change(comparison.revenue_change_rate)}</strong></div><div><span>新增粉丝</span><strong>{change(comparison.followers_change_rate)}</strong></div><div><span>平均在线</span><strong>{change(comparison.avg_online_change_rate)}</strong></div><div><span>平均停留</span><strong>{change(comparison.avg_stay_change_rate)}</strong></div></div></section>
    <section className="report-document-section"><h2>趋势</h2>{arrayOrEmpty(report.analytics.trend).length === 0 ? <p className="report-muted">本周期暂无趋势数据。</p> : <div className="report-trend-table-wrap"><table className="report-trend-table"><thead><tr><th>日期</th><th>场次</th><th>流水</th><th>平均在线</th><th>新增粉丝</th></tr></thead><tbody>{arrayOrEmpty(report.analytics.trend).map((point) => <tr key={point.date}><td>{formatDate(point.date)}</td><td>{point.session_count}</td><td>{formatYuan(point.revenue_cents)}</td><td>{unknown(point.avg_online)}</td><td>{point.followers_gained === null || point.followers_gained === undefined ? '暂无数据' : formatMetric(point.followers_gained, 0)}</td></tr>)}</tbody></table></div>}</section>
    <section className="report-document-section"><h2>问题</h2><div className="report-two-columns"><IssueList title="当前待处理" items={arrayOrEmpty(report.pending_issues)} onOpen={(id) => onOpenAnchor(report.anchor.id, 'issues', id)} /><IssueList title="本周期新增" items={arrayOrEmpty(report.new_issues)} onOpen={(id) => onOpenAnchor(report.anchor.id, 'issues', id)} /><IssueList title="本周期解决" items={arrayOrEmpty(report.resolved_issues)} onOpen={(id) => onOpenAnchor(report.anchor.id, 'issues', id)} /></div></section>
    <section className="report-document-section"><h2>改进方案与跟进</h2><div className="report-two-columns"><PlanList title="执行中" items={arrayOrEmpty(report.active_plans)} onOpen={(id) => onOpenAnchor(report.anchor.id, 'plans', id)} /><PlanList title="本周期完成或终止" items={arrayOrEmpty(report.completed_plans)} onOpen={(id) => onOpenAnchor(report.anchor.id, 'plans', id)} /></div><p className="report-muted">本周期关键跟进：{arrayOrEmpty(report.followups).length} 条</p>{arrayOrEmpty(report.followups).length > 0 && <div className="report-followup-list">{arrayOrEmpty(report.followups).slice(0, 8).map((followup) => <div key={followup.id}><span>{formatDate(followup.followup_date)}</span><strong>{followup.execution_status}</strong><small>{followup.effect}{followup.next_action ? ` · 下一步：${followup.next_action}` : ''}</small></div>)}</div>}</section>
    <section className="report-document-section"><h2>阶段目标</h2><div className="report-summary-block"><p>当前周期相关目标 {arrayOrEmpty(report.goals).length} 项 · 进行中 {report.goal_summary.in_progress_count} 项</p><p>本期完成 {report.goal_summary.completed_count} 项 · 即将到期 {report.goal_summary.due_soon_count} 项 · 已逾期 {report.goal_summary.overdue_count} 项</p></div>{arrayOrEmpty(report.goals).length > 0 && <div className="report-record-list">{arrayOrEmpty(report.goals).slice(0, 8).map((goal) => <button type="button" key={goal.id} onClick={() => onOpenAnchor(report.anchor.id, 'goals', goal.id)}><strong>{goal.title}</strong><span>{formatDate(goal.start_date)} ～ {formatDate(goal.end_date)} · {goal.status}</span></button>)}</div>}</section>
    <section className="report-document-section"><h2>重要事件</h2>{arrayOrEmpty(report.events).length === 0 ? <p className="report-muted">暂无记录。</p> : <div className="report-event-list">{arrayOrEmpty(report.events).slice(0, 8).map((event) => <div key={event.id}><strong>{event.title}</strong><span>{formatDate(event.event_date)} · {event.event_type}</span>{event.content && <p>{event.content}</p>}</div>)}</div>}</section>
    <section className="report-document-section"><h2>重点变化</h2>{insights.length === 0 ? <p className="report-muted">本周期暂无达到规则阈值的重点变化。</p> : <div className="report-record-list">{insights.map((insight) => <button type="button" key={insight.id} onClick={() => onOpenAnchor(report.anchor.id)}><strong>{insight.title}</strong><span>{insight.detail}</span></button>)}</div>}</section>
  </article>
}
