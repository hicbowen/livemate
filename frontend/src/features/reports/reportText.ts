import type {
  AnchorAnalyticsRow,
  AnchorPeriodReport,
  AnalyticsResult,
  OperationsReport,
} from '../../../bindings/github.com/hicbowen/livemate/internal/domain/models.js'
import { arrayOrEmpty, formatDate, formatMetric, formatPercent, formatYuan } from '../../api'

function unknown(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined ? '暂无数据' : formatMetric(value, digits)
}

function hours(value: number | null | undefined): string {
  return value === null || value === undefined ? '暂无数据' : `${formatMetric(value / 60, 1)} 小时`
}

function change(value: number | null | undefined): string {
  if (value === null || value === undefined) return '暂无上一周期可比数据'
  if (value === 0) return '持平'
  return `${value > 0 ? '增长' : '下降'} ${formatPercent(Math.abs(value))}`
}

function overviewLines(analytics: AnalyticsResult): string[] {
  const summary = analytics.comparison.current
  return [
    `- 开播主播：${unknown(summary.active_anchor_count, 0)} 位`,
    `- 直播场次：${unknown(summary.session_count, 0)} 场`,
    `- 直播时长：${hours(summary.duration_minutes)}`,
    `- 场观：${unknown(summary.views, 0)}`,
    `- 新增粉丝：${summary.followers_gained === null || summary.followers_gained === undefined ? '暂无数据' : `${formatMetric(summary.followers_gained, 0)} 人`}`,
    `- 流水：${formatYuan(summary.revenue_cents)}`,
  ]
}

function comparisonLines(analytics: AnalyticsResult): string[] {
  return [
    `- 流水：${change(analytics.comparison.revenue_change_rate)}`,
    `- 新增粉丝：${change(analytics.comparison.followers_change_rate)}`,
    `- 平均在线：${change(analytics.comparison.avg_online_change_rate)}`,
    `- 平均停留：${change(analytics.comparison.avg_stay_change_rate)}`,
  ]
}

function anchorChangeLines(analytics: AnalyticsResult): string[] {
  const anchors = arrayOrEmpty(analytics.anchors)
  const comparable = anchors.filter((anchor) => anchor.revenue_change_rate !== null && anchor.revenue_change_rate !== undefined)
  const rising = [...comparable].sort((left, right) => (right.revenue_change_rate ?? -Infinity) - (left.revenue_change_rate ?? -Infinity)).slice(0, 3)
  const falling = [...comparable].sort((left, right) => (left.revenue_change_rate ?? Infinity) - (right.revenue_change_rate ?? Infinity)).slice(0, 3)
  const lines: string[] = []
  lines.push('上涨较明显：')
  if (rising.length === 0) lines.push('- 暂无可比数据')
  rising.forEach((anchor) => lines.push(`- ${anchor.nickname}：流水${change(anchor.revenue_change_rate)}`))
  lines.push('下降较明显：')
  if (falling.length === 0) lines.push('- 暂无可比数据')
  falling.forEach((anchor) => lines.push(`- ${anchor.nickname}：流水${change(anchor.revenue_change_rate)}`))
  return lines
}

function insightLines(analytics: AnalyticsResult): string[] {
  const insights = arrayOrEmpty(analytics.insights)
  return insights.length === 0 ? ['- 本周期暂无达到规则阈值的重点变化。'] : insights.map((insight) => `- ${insight.nickname}：${insight.detail}`)
}

function issueSummaryLines(summary: OperationsReport['issue_summary']): string[] {
  return [
    `- 新增问题：${summary.new_count} 项`,
    `- 仍待处理：${summary.pending_count} 项`,
    `- 重点问题：${summary.important_count} 项`,
    `- 紧急问题：${summary.urgent_count} 项`,
    `- 本期解决：${summary.resolved_count} 项`,
  ]
}

function planSummaryLines(summary: OperationsReport['plan_summary']): string[] {
  return [
    `- 新增方案：${summary.new_count} 项`,
    `- 执行中：${summary.in_progress_count} 项`,
    `- 待跟进：${summary.pending_followup_count} 项`,
    `- 已验证有效：${summary.validated_count} 项`,
    `- 无效：${summary.invalid_count} 项`,
    `- 已终止：${summary.terminated_count} 项`,
  ]
}

function goalSummaryLines(summary: OperationsReport['goal_summary']): string[] {
  return [
    `- 进行中：${summary.in_progress_count} 项`,
    `- 本期完成：${summary.completed_count} 项`,
    `- 即将到期：${summary.due_soon_count} 项`,
    `- 已逾期：${summary.overdue_count} 项`,
  ]
}

export function buildOperationsReportText(report: OperationsReport): string {
  return [
    `${report.start_date} 至 ${report.end_date} 运营周期报告`,
    '',
    '一、整体数据',
    ...overviewLines(report.analytics),
    '',
    '二、与上一周期对比',
    ...comparisonLines(report.analytics),
    '',
    '三、主播变化',
    ...anchorChangeLines(report.analytics),
    '',
    '四、问题情况',
    ...issueSummaryLines(report.issue_summary),
    '',
    '五、改进方案',
    ...planSummaryLines(report.plan_summary),
    '',
    '六、阶段目标',
    ...goalSummaryLines(report.goal_summary),
    '',
    '七、重点变化',
    ...insightLines(report.analytics),
  ].join('\n')
}

function rowMetricLines(row: AnchorAnalyticsRow): string[] {
  return [
    `- 直播场次：${row.session_count} 场`,
    `- 直播时长：${hours(row.duration_minutes)}`,
    `- 场观：${unknown(row.views, 0)}`,
    `- 平均在线：${unknown(row.avg_online)}`,
    `- 平均停留：${row.avg_stay_seconds === null || row.avg_stay_seconds === undefined ? '暂无数据' : `${formatMetric(row.avg_stay_seconds, 1)} 秒`}`,
    `- 新增粉丝：${row.followers_gained === null || row.followers_gained === undefined ? '暂无数据' : `${formatMetric(row.followers_gained, 0)} 人`}`,
    `- 流水：${formatYuan(row.revenue_cents)}`,
  ]
}

function issueListLines(title: string, items: AnchorPeriodReport['pending_issues']): string[] {
  const rows = arrayOrEmpty(items)
  return [title, ...(rows.length === 0 ? ['- 暂无记录'] : rows.slice(0, 8).map((item) => `- ${item.title}（${item.status}，${item.priority}）`))]
}

function planListLines(title: string, items: AnchorPeriodReport['active_plans']): string[] {
  const rows = arrayOrEmpty(items)
  return [title, ...(rows.length === 0 ? ['- 暂无记录'] : rows.slice(0, 8).map((item) => `- ${item.title}（${item.status}）`))]
}

export function buildAnchorReportText(report: AnchorPeriodReport): string {
  const row = arrayOrEmpty(report.analytics.anchors)[0]
  return [
    `${report.anchor.nickname} · ${report.start_date} 至 ${report.end_date} 阶段报告`,
    '',
    '一、主播资料',
    `- 昵称：${report.anchor.nickname}`,
    `- 平台：${report.anchor.platform}`,
    `- 阶段：${report.anchor.stage}`,
    `- 赛道：${report.anchor.category || '未填写'}`,
    '',
    '二、周期核心数据',
    ...(row ? rowMetricLines(row) : ['- 本周期暂无直播记录。']),
    '',
    '三、上一周期对比',
    ...comparisonLines(report.analytics),
    '',
    '四、问题',
    ...issueListLines('当前待处理：', report.pending_issues),
    ...issueListLines('本周期新增：', report.new_issues),
    ...issueListLines('本周期解决：', report.resolved_issues),
    '',
    '五、改进方案',
    ...planListLines('执行中：', report.active_plans),
    ...planListLines('本周期完成或终止：', report.completed_plans),
    `关键跟进：${arrayOrEmpty(report.followups).length} 条`,
    '',
    '六、阶段目标',
    `- 当前周期相关目标：${arrayOrEmpty(report.goals).length} 项`,
    `- 进行中：${report.goal_summary.in_progress_count} 项`,
    `- 本期完成：${report.goal_summary.completed_count} 项`,
    `- 即将到期：${report.goal_summary.due_soon_count} 项`,
    `- 已逾期：${report.goal_summary.overdue_count} 项`,
    '',
    '七、重要事件',
    ...(arrayOrEmpty(report.events).length === 0 ? ['- 暂无记录'] : arrayOrEmpty(report.events).slice(0, 8).map((event) => `- ${formatDate(event.event_date)}：${event.title}`)),
  ].join('\n')
}

export function buildReportText(report: OperationsReport | AnchorPeriodReport): string {
  return 'anchor' in report ? buildAnchorReportText(report) : buildOperationsReportText(report)
}
