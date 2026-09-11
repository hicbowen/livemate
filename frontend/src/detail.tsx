import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  AppButton,
  AppCard,
  AppDialog,
  AppEmptyState,
  AppField,
  AppPagination,
  AppPage,
  AppSelect,
  AppStatusBadge,
  AppTextArea,
  AppTextBox,
} from 'react-desktop-shell'
import { AppDataTable, AppDataView, type AppDataTableColumn } from 'react-desktop-shell/data'

import type {
  AnomalyCandidate,
  AnchorDetail,
  AnchorEvent,
  AnchorEventInput,
  AnchorIssue,
  AnchorIssueInput,
  GoalMetricInput,
  ImprovementPlan,
  ImprovementPlanInput,
  LiveSession,
  LiveSessionInput,
  OperationReview,
  OperationReviewInput,
  PlanEffectComparison,
  PlanFollowup,
  PlanFollowupInput,
  PeriodComparison,
  StageGoal,
  StageGoalInput,
  StatusChange,
  TrendPoint,
} from '../bindings/github.com/hicbowen/livemate/internal/domain/models.js'
import {
  arrayOrEmpty,
  errorMessage,
  formatDate,
  formatDateTime,
  formatMetric,
  formatPercent,
  formatYuan,
  optionalInteger,
  optionalNumber,
  Service,
  toBase64,
} from './api'

const issueCategories = ['留存', '互动', '涨粉', '流水', '转化', '开场', '内容', 'PK', '话术', '直播节奏', '开播稳定性', '主播状态', '设备', '违规', '其他']
const priorities = ['普通', '重点', '紧急']
const issueStatuses = ['待处理', '处理中', '观察中', '已解决', '已关闭']
const planStatuses = ['待执行', '执行中', '观察中', '已验证有效', '无效', '已终止']
const executionStatuses = ['未执行', '部分执行', '完整执行', '无法执行']
const effects = ['暂不判断', '有效', '部分有效', '无明显变化', '变差']
const nextActions = ['继续', '调整方案', '结束方案', '新增方案', '继续观察']
const goalStatuses = ['进行中', '已完成', '已取消']
const eventTypes = ['更换直播时间', '调整直播内容', '更换运营', '停播', '恢复开播', '违规', '设备变化', '账号变化', '活动', '合作', '主播个人状态', '其他']

type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

function localDate(value = new Date()): string {
  const shifted = new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
  return shifted.toISOString().slice(0, 10)
}

const today = () => localDate()

function options(values: string[], includeEmpty = false) {
  const items = values.map((value) => ({ value, label: value }))
  return includeEmpty ? [{ value: '', label: '全部' }, ...items] : items
}

function badgeTone(value: string): BadgeTone {
  if (value === '紧急' || value === '已终止' || value === '无效' || value === '变差') return 'danger'
  if (value === '重点' || value === '处理中' || value === '观察中' || value === '短暂停播') return 'warning'
  if (value === '已解决' || value === '已关闭' || value === '已验证有效' || value === '完整执行' || value === '有效' || value === '正常开播' || value === '已完成') return 'success'
  if (value === '执行中' || value === '部分执行' || value === '进行中' || value === '部分有效') return 'info'
  return 'neutral'
}

function Badge({ children }: { children: string }) {
  return <AppStatusBadge status={badgeTone(children)} appearance="subtle" size="small" marker="dot">{children}</AppStatusBadge>
}

function Empty({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <AppEmptyState size="small" visual="simple" title={title} description={description} action={action} />
}

function Dialog({ open, title, description, onClose, children, actions, width = 680 }: { open: boolean; title: string; description?: string; onClose: () => void; children: ReactNode; actions: ReactNode; width?: number }) {
  return <AppDialog open={open} onOpenChange={(next) => { if (!next) onClose() }} title={title} description={description} width={width} closeOnOverlayClick={false} actions={actions}>{children}</AppDialog>
}

function FormError({ message }: { message: string }) {
  return message ? <div className="notice notice-error" role="alert">{message}</div> : null
}

function textNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value)
}

function inputDateTime(value: string | null | undefined): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (!Number.isNaN(parsed.getTime())) {
    const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000)
    return local.toISOString().slice(0, 16)
  }
  return value.replace(' ', 'T').slice(0, 16)
}

function inputDate(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : ''
}

function centsFromYuan(value: string): number | null {
  const yuan = optionalNumber(value)
  return yuan === null ? null : Math.round(yuan * 100)
}

type SessionDraft = {
  session_date: string
  started_at: string
  ended_at: string
  duration_minutes: string
  duration_override: boolean
  views: string
  peak_online: string
  avg_online: string
  avg_stay_seconds: string
  likes: string
  comments: string
  comment_users: string
  shares: string
  followers_before: string
  followers_after: string
  followers_gained: string
  revenue_yuan: string
  payer_count: string
  gift_user_count: string
  pk_count: string
  pk_win_count: string
  pk_revenue_yuan: string
  operator_name: string
  is_abnormal: boolean
  abnormal_note: string
  source: string
  notes: string
}

function emptySessionDraft(): SessionDraft {
  return {
    session_date: today(), started_at: '', ended_at: '', duration_minutes: '', duration_override: false,
    views: '', peak_online: '', avg_online: '', avg_stay_seconds: '', likes: '', comments: '', comment_users: '', shares: '',
    followers_before: '', followers_after: '', followers_gained: '', revenue_yuan: '', payer_count: '', gift_user_count: '',
    pk_count: '', pk_win_count: '', pk_revenue_yuan: '', operator_name: '', is_abnormal: false, abnormal_note: '', source: '手工录入', notes: '',
  }
}

function sessionToDraft(session: LiveSession | null): SessionDraft {
  if (!session) return emptySessionDraft()
  return {
    session_date: inputDate(session.session_date), started_at: inputDateTime(session.started_at), ended_at: inputDateTime(session.ended_at),
    duration_minutes: textNumber(session.duration_minutes), duration_override: session.duration_override,
    views: textNumber(session.views), peak_online: textNumber(session.peak_online), avg_online: textNumber(session.avg_online), avg_stay_seconds: textNumber(session.avg_stay_seconds),
    likes: textNumber(session.likes), comments: textNumber(session.comments), comment_users: textNumber(session.comment_users), shares: textNumber(session.shares),
    followers_before: textNumber(session.followers_before), followers_after: textNumber(session.followers_after), followers_gained: textNumber(session.followers_gained),
    revenue_yuan: session.revenue_cents === null || session.revenue_cents === undefined ? '' : (session.revenue_cents / 100).toFixed(2),
    payer_count: textNumber(session.payer_count), gift_user_count: textNumber(session.gift_user_count), pk_count: textNumber(session.pk_count), pk_win_count: textNumber(session.pk_win_count),
    pk_revenue_yuan: session.pk_revenue_cents === null || session.pk_revenue_cents === undefined ? '' : (session.pk_revenue_cents / 100).toFixed(2),
    operator_name: session.operator_name, is_abnormal: session.is_abnormal, abnormal_note: session.abnormal_note, source: session.source, notes: session.notes,
  }
}

function copiedSessionToDraft(session: LiveSession): SessionDraft {
  return {
    ...sessionToDraft(session),
    session_date: today(),
    started_at: '',
    ended_at: '',
    duration_minutes: '',
    duration_override: false,
    views: '',
    avg_online: '',
    avg_stay_seconds: '',
    followers_before: '',
    followers_after: '',
    followers_gained: '',
    revenue_yuan: '',
    is_abnormal: false,
    abnormal_note: '',
    notes: '',
  }
}

function sessionDraftToInput(anchorId: number, draft: SessionDraft): LiveSessionInput {
  return {
    anchor_id: anchorId,
    session_date: draft.session_date,
    started_at: draft.started_at || null,
    ended_at: draft.ended_at || null,
    duration_minutes: optionalInteger(draft.duration_minutes),
    duration_override: draft.duration_override,
    views: optionalInteger(draft.views),
    peak_online: optionalInteger(draft.peak_online),
    avg_online: optionalInteger(draft.avg_online),
    avg_stay_seconds: optionalInteger(draft.avg_stay_seconds),
    likes: optionalInteger(draft.likes),
    comments: optionalInteger(draft.comments),
    comment_users: optionalInteger(draft.comment_users),
    shares: optionalInteger(draft.shares),
    followers_before: optionalInteger(draft.followers_before),
    followers_after: optionalInteger(draft.followers_after),
    followers_gained: optionalInteger(draft.followers_gained),
    revenue_cents: centsFromYuan(draft.revenue_yuan),
    payer_count: optionalInteger(draft.payer_count),
    gift_user_count: optionalInteger(draft.gift_user_count),
    pk_count: optionalInteger(draft.pk_count),
    pk_win_count: optionalInteger(draft.pk_win_count),
    pk_revenue_cents: centsFromYuan(draft.pk_revenue_yuan),
    operator_name: draft.operator_name,
    is_abnormal: draft.is_abnormal,
    abnormal_note: draft.abnormal_note,
    source: draft.source,
    notes: draft.notes,
  }
}

function NumberField({ label, value, onChange, description }: { label: string; value: string; onChange: (value: string) => void; description?: string }) {
  return <AppField label={label} description={description}><AppTextBox type="number" min="0" step="any" value={value} onChange={(event) => onChange(event.target.value)} /></AppField>
}

function SessionFormDialog({ open, anchorId, initial, copyOf, onClose, onSaved }: { open: boolean; anchorId: number; initial: LiveSession | null; copyOf: LiveSession | null; onClose: () => void; onSaved: (continueEntry?: boolean) => void }) {
  const [draft, setDraft] = useState<SessionDraft>(emptySessionDraft)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [continueEntry, setContinueEntry] = useState(false)
  useEffect(() => { setDraft(copyOf ? copiedSessionToDraft(copyOf) : sessionToDraft(initial)); setError('') }, [copyOf, initial, open])
  const update = <K extends keyof SessionDraft>(key: K, value: SessionDraft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const save = (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    const keepOpen = continueEntry && !initial
    setContinueEntry(false)
    const request = initial ? Service.UpdateSession(initial.id, sessionDraftToInput(anchorId, draft)) : Service.CreateSession(sessionDraftToInput(anchorId, draft))
    request.then(() => onSaved(keepOpen)).catch((reason) => setError(errorMessage(reason))).finally(() => setSaving(false))
  }
  return <Dialog open={open} title={initial ? '编辑直播记录' : copyOf ? '复制上一场直播' : '新增直播记录'} description={copyOf ? '已带入上一场的低频字段，请核对后再保存；日期和本场高频数据已清空。' : '先填本场高频数据；未知指标留空，播伴不会把未知当成 0。'} onClose={onClose} width={820} actions={<><AppButton appearance="subtle" onClick={onClose}>取消</AppButton>{!initial && <AppButton appearance="standard" type="submit" form="session-form" onClick={() => setContinueEntry(true)} loading={saving}>保存并继续</AppButton>}<AppButton appearance="primary" type="submit" form="session-form" onClick={() => setContinueEntry(false)} loading={saving}>{initial ? '保存记录' : '保存并关闭'}</AppButton></>}>
    <form id="session-form" className="form-grid" onSubmit={save}>
      <FormError message={error} />
      <AppField label="直播日期" required><AppTextBox type="date" value={draft.session_date} onChange={(event) => update('session_date', event.target.value)} autoFocus /></AppField>
      <NumberField label="直播时长（分钟）" value={draft.duration_minutes} onChange={(value) => update('duration_minutes', value)} />
      <NumberField label="场观" value={draft.views} onChange={(value) => update('views', value)} />
      <NumberField label="平均在线" value={draft.avg_online} onChange={(value) => update('avg_online', value)} />
      <NumberField label="平均停留（秒）" value={draft.avg_stay_seconds} onChange={(value) => update('avg_stay_seconds', value)} />
      <NumberField label="新增粉丝" value={draft.followers_gained} onChange={(value) => update('followers_gained', value)} description="前后粉丝都填写时以差值为准。" />
      <NumberField label="流水（元）" value={draft.revenue_yuan} onChange={(value) => update('revenue_yuan', value)} />
      <details className="form-span-2 session-more"><summary>更多数据</summary><div className="form-grid session-more-grid">
        <AppField label="数据来源"><AppTextBox value={draft.source} onChange={(event) => update('source', event.target.value)} placeholder="手工录入 / 平台后台" /></AppField>
        <AppField label="开播时间"><AppTextBox type="datetime-local" value={draft.started_at} onChange={(event) => update('started_at', event.target.value)} /></AppField>
        <AppField label="下播时间"><AppTextBox type="datetime-local" value={draft.ended_at} onChange={(event) => update('ended_at', event.target.value)} /></AppField>
        <div className="form-span-2 form-check-row"><label><input type="checkbox" checked={draft.duration_override} onChange={(event) => update('duration_override', event.target.checked)} /> 手工覆盖直播时长</label><span className="form-help">有开播/下播时间时默认自动计算。</span></div>
        <NumberField label="开播前粉丝" value={draft.followers_before} onChange={(value) => update('followers_before', value)} description="填写前后值后自动计算新增粉丝。" />
        <NumberField label="下播后粉丝" value={draft.followers_after} onChange={(value) => update('followers_after', value)} />
        <NumberField label="最高在线" value={draft.peak_online} onChange={(value) => update('peak_online', value)} />
        <NumberField label="点赞" value={draft.likes} onChange={(value) => update('likes', value)} />
        <NumberField label="评论" value={draft.comments} onChange={(value) => update('comments', value)} />
        <NumberField label="评论用户" value={draft.comment_users} onChange={(value) => update('comment_users', value)} />
        <NumberField label="分享" value={draft.shares} onChange={(value) => update('shares', value)} />
        <NumberField label="付费人数" value={draft.payer_count} onChange={(value) => update('payer_count', value)} />
        <NumberField label="礼物用户" value={draft.gift_user_count} onChange={(value) => update('gift_user_count', value)} />
        <NumberField label="PK 场次" value={draft.pk_count} onChange={(value) => update('pk_count', value)} />
        <NumberField label="PK 胜场" value={draft.pk_win_count} onChange={(value) => update('pk_win_count', value)} />
        <NumberField label="PK 流水（元）" value={draft.pk_revenue_yuan} onChange={(value) => update('pk_revenue_yuan', value)} />
        <AppField label="运营负责人"><AppTextBox value={draft.operator_name} onChange={(event) => update('operator_name', event.target.value)} /></AppField>
        <div className="form-span-2 form-check-row"><label><input type="checkbox" checked={draft.is_abnormal} onChange={(event) => update('is_abnormal', event.target.checked)} /> 标记为异常场次</label></div>
        {draft.is_abnormal && <div className="form-span-2"><AppField label="异常说明"><AppTextArea value={draft.abnormal_note} onChange={(event) => update('abnormal_note', event.target.value)} rows={2} placeholder="发生了什么异常，后续需要注意什么" /></AppField></div>}
        <div className="form-span-2"><AppField label="场次备注"><AppTextArea value={draft.notes} onChange={(event) => update('notes', event.target.value)} rows={3} placeholder="记录本场特殊情况或数据口径" /></AppField></div>
      </div></details>
    </form>
  </Dialog>
}

type ReviewDraft = { review_date: string; live_session_id: number | null; summary: string; strengths: string; observations: string; conclusion: string }

function emptyReviewDraft(): ReviewDraft {
  return { review_date: today(), live_session_id: null, summary: '', strengths: '', observations: '', conclusion: '' }
}

function reviewToDraft(review: OperationReview | null, sessionId: number | null): ReviewDraft {
  return review ? { review_date: inputDate(review.review_date), live_session_id: review.live_session_id, summary: review.summary, strengths: review.strengths, observations: review.observations, conclusion: review.conclusion } : { ...emptyReviewDraft(), live_session_id: sessionId }
}

function ReviewFormDialog({ open, anchorId, sessions, initial, sessionId, onClose, onSaved }: { open: boolean; anchorId: number; sessions: LiveSession[]; initial: OperationReview | null; sessionId: number | null; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<ReviewDraft>(emptyReviewDraft)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { setDraft(reviewToDraft(initial, sessionId)); setError('') }, [initial, sessionId, open])
  const update = <K extends keyof ReviewDraft>(key: K, value: ReviewDraft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const save = (event: FormEvent) => {
    event.preventDefault()
    setSaving(true); setError('')
    const input: OperationReviewInput = { anchor_id: anchorId, live_session_id: draft.live_session_id, review_date: draft.review_date, summary: draft.summary, strengths: draft.strengths, observations: draft.observations, conclusion: draft.conclusion }
    const request = initial ? Service.UpdateReview(initial.id, input) : Service.CreateReview(input)
    request.then(() => onSaved()).catch((reason) => setError(errorMessage(reason))).finally(() => setSaving(false))
  }
  return <Dialog open={open} title={initial ? '编辑复盘' : '新增复盘'} description="把本场观察写清楚，再从复盘中提炼可执行的问题。" onClose={onClose} actions={<><AppButton appearance="subtle" onClick={onClose}>取消</AppButton><AppButton appearance="primary" type="submit" form="review-form" loading={saving}>{initial ? '保存复盘' : '保存复盘'}</AppButton></>}>
    <form id="review-form" className="form-grid" onSubmit={save}>
      <FormError message={error} />
      <AppField label="复盘日期" required><AppTextBox type="date" value={draft.review_date} onChange={(event) => update('review_date', event.target.value)} autoFocus /></AppField>
      <AppField label="关联直播场次"><AppSelect options={[{ value: '', label: '不关联具体场次' }, ...sessions.map((session) => ({ value: String(session.id), label: `${session.session_date} · ${formatMetric(session.avg_online, 0)} 平均在线` }))]} value={draft.live_session_id === null ? '' : String(draft.live_session_id)} onValueChange={(value) => update('live_session_id', value ? Number(value) : null)} /></AppField>
      <div className="form-span-2"><AppField label="本场总结" required><AppTextArea value={draft.summary} onChange={(event) => update('summary', event.target.value)} rows={3} placeholder="这场直播整体发生了什么" /></AppField></div>
      <div className="form-span-2"><AppField label="做得好的地方"><AppTextArea value={draft.strengths} onChange={(event) => update('strengths', event.target.value)} rows={3} placeholder="保留哪些有效动作" /></AppField></div>
      <div className="form-span-2"><AppField label="观察到的问题"><AppTextArea value={draft.observations} onChange={(event) => update('observations', event.target.value)} rows={3} placeholder="基于事实写观察，不急着下结论" /></AppField></div>
      <div className="form-span-2"><AppField label="复盘结论"><AppTextArea value={draft.conclusion} onChange={(event) => update('conclusion', event.target.value)} rows={3} placeholder="下一次准备验证什么" /></AppField></div>
    </form>
  </Dialog>
}

type IssueDraft = { review_id: number | null; title: string; category: string; description: string; evidence: string; cause_hypothesis: string; priority: string; status: string; discovered_at: string }

function emptyIssueDraft(reviewId: number | null): IssueDraft {
  return { review_id: reviewId, title: '', category: '留存', description: '', evidence: '', cause_hypothesis: '', priority: '普通', status: '待处理', discovered_at: today() }
}

function issueToDraft(issue: AnchorIssue | null, reviewId: number | null): IssueDraft {
  return issue ? { review_id: issue.review_id, title: issue.title, category: issue.category, description: issue.description, evidence: issue.evidence, cause_hypothesis: issue.cause_hypothesis, priority: issue.priority, status: issue.status, discovered_at: inputDate(issue.discovered_at) } : emptyIssueDraft(reviewId)
}

function IssueFormDialog({ open, anchorId, reviews, initial, reviewId, onClose, onSaved }: { open: boolean; anchorId: number; reviews: OperationReview[]; initial: AnchorIssue | null; reviewId: number | null; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<IssueDraft>(emptyIssueDraft(reviewId))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { setDraft(issueToDraft(initial, reviewId)); setError('') }, [initial, reviewId, open])
  const update = <K extends keyof IssueDraft>(key: K, value: IssueDraft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const save = (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    const input: AnchorIssueInput = { anchor_id: anchorId, review_id: draft.review_id, title: draft.title, category: draft.category, description: draft.description, evidence: draft.evidence, cause_hypothesis: draft.cause_hypothesis, priority: draft.priority, status: draft.status, discovered_at: draft.discovered_at }
    const request = initial ? Service.UpdateIssue(initial.id, input) : Service.CreateIssue(input)
    request.then(() => onSaved()).catch((reason) => setError(errorMessage(reason))).finally(() => setSaving(false))
  }
  return <Dialog open={open} title={initial ? '编辑问题' : '从复盘建立问题'} description="问题必须能被事实描述，并且可以继续拆成一个或多个改进方案。" onClose={onClose} actions={<><AppButton appearance="subtle" onClick={onClose}>取消</AppButton><AppButton appearance="primary" type="submit" form="issue-form" loading={saving}>{initial ? '保存问题' : '建立问题'}</AppButton></>}>
    <form id="issue-form" className="form-grid" onSubmit={save}>
      <FormError message={error} />
      <div className="form-span-2"><AppField label="问题标题" required><AppTextBox value={draft.title} onChange={(event) => update('title', event.target.value)} placeholder="例如：开场 10 分钟后留存明显下降" autoFocus /></AppField></div>
      <AppField label="问题分类"><AppSelect options={options(issueCategories)} value={draft.category} onValueChange={(value) => update('category', value ?? '其他')} /></AppField>
      <AppField label="优先级"><AppSelect options={options(priorities)} value={draft.priority} onValueChange={(value) => update('priority', value ?? '普通')} /></AppField>
      <AppField label="问题状态"><AppSelect options={options(issueStatuses)} value={draft.status} onValueChange={(value) => update('status', value ?? '待处理')} /></AppField>
      <AppField label="发现日期"><AppTextBox type="date" value={draft.discovered_at} onChange={(event) => update('discovered_at', event.target.value)} /></AppField>
      <AppField label="关联复盘"><AppSelect options={[{ value: '', label: '不关联复盘' }, ...reviews.map((review) => ({ value: String(review.id), label: `${review.review_date} · ${review.summary.slice(0, 22)}` }))]} value={draft.review_id === null ? '' : String(draft.review_id)} onValueChange={(value) => update('review_id', value ? Number(value) : null)} /></AppField>
      <div className="form-span-2"><AppField label="问题描述"><AppTextArea value={draft.description} onChange={(event) => update('description', event.target.value)} rows={3} placeholder="描述问题边界和影响" /></AppField></div>
      <div className="form-span-2"><AppField label="事实证据"><AppTextArea value={draft.evidence} onChange={(event) => update('evidence', event.target.value)} rows={3} placeholder="关联场次、指标、时间段或具体话术" /></AppField></div>
      <div className="form-span-2"><AppField label="原因假设"><AppTextArea value={draft.cause_hypothesis} onChange={(event) => update('cause_hypothesis', event.target.value)} rows={3} placeholder="暂时的原因假设，后续用方案验证" /></AppField></div>
    </form>
  </Dialog>
}

type PlanDraft = { issue_id: number; title: string; objective: string; actions: string; metric_name: string; baseline_value: string; target_value: string; metric_unit: string; start_date: string; expected_end_date: string; priority: string; status: string; result_summary: string }

function emptyPlanDraft(issueId: number): PlanDraft {
  return { issue_id: issueId, title: '', objective: '', actions: '', metric_name: '', baseline_value: '', target_value: '', metric_unit: '', start_date: today(), expected_end_date: '', priority: '普通', status: '待执行', result_summary: '' }
}

function planToDraft(plan: ImprovementPlan | null, issueId: number): PlanDraft {
  return plan ? { issue_id: plan.issue_id, title: plan.title, objective: plan.objective, actions: plan.actions, metric_name: plan.metric_name, baseline_value: textNumber(plan.baseline_value), target_value: textNumber(plan.target_value), metric_unit: plan.metric_unit, start_date: inputDate(plan.start_date), expected_end_date: inputDate(plan.expected_end_date), priority: plan.priority, status: plan.status, result_summary: plan.result_summary } : emptyPlanDraft(issueId)
}

function PlanFormDialog({ open, anchorId, issues, initial, issueId, onClose, onSaved }: { open: boolean; anchorId: number; issues: AnchorIssue[]; initial: ImprovementPlan | null; issueId: number | null; onClose: () => void; onSaved: () => void }) {
  const firstIssueId = issueId ?? issues[0]?.id ?? 0
  const [draft, setDraft] = useState<PlanDraft>(emptyPlanDraft(firstIssueId))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { setDraft(planToDraft(initial, issueId ?? issues[0]?.id ?? 0)); setError('') }, [initial, issueId, issues, open])
  const update = <K extends keyof PlanDraft>(key: K, value: PlanDraft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const save = (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    const input: ImprovementPlanInput = { anchor_id: anchorId, issue_id: draft.issue_id, title: draft.title, objective: draft.objective, actions: draft.actions, metric_name: draft.metric_name, baseline_value: optionalNumber(draft.baseline_value), target_value: optionalNumber(draft.target_value), metric_unit: draft.metric_unit, start_date: draft.start_date, expected_end_date: draft.expected_end_date || null, priority: draft.priority, status: draft.status, result_summary: draft.result_summary }
    const request = initial ? Service.UpdatePlan(initial.id, input) : Service.CreatePlan(input)
    request.then(() => onSaved()).catch((reason) => setError(errorMessage(reason))).finally(() => setSaving(false))
  }
  return <Dialog open={open} title={initial ? '编辑改进方案' : '建立改进方案'} description="一个问题可以拆成多个方案；每个方案都要有动作、指标和下一次验证时间。" onClose={onClose} width={760} actions={<><AppButton appearance="subtle" onClick={onClose}>取消</AppButton><AppButton appearance="primary" type="submit" form="plan-form" loading={saving} disabled={issues.length === 0}>{initial ? '保存方案' : '建立方案'}</AppButton></>}>
    <form id="plan-form" className="form-grid" onSubmit={save}>
      <FormError message={error} />
      {issues.length === 0 ? <div className="form-span-2"><Empty title="请先建立问题" description="改进方案必须归属于一个问题，请从复盘或问题页先建立问题。" /></div> : <>
        <div className="form-span-2"><AppField label="归属问题" required><AppSelect options={issues.map((issue) => ({ value: String(issue.id), label: `${issue.priority} · ${issue.title}` }))} value={String(draft.issue_id)} onValueChange={(value) => update('issue_id', value ? Number(value) : 0)} /></AppField></div>
        <div className="form-span-2"><AppField label="方案标题" required><AppTextBox value={draft.title} onChange={(event) => update('title', event.target.value)} placeholder="例如：重做前 10 分钟开场节奏" autoFocus /></AppField></div>
        <div className="form-span-2"><AppField label="目标"><AppTextArea value={draft.objective} onChange={(event) => update('objective', event.target.value)} rows={2} placeholder="这次方案准备改变什么" /></AppField></div>
        <div className="form-span-2"><AppField label="具体动作"><AppTextArea value={draft.actions} onChange={(event) => update('actions', event.target.value)} rows={4} placeholder="按执行顺序写动作、负责人和注意事项" /></AppField></div>
        <AppField label="观察指标"><AppTextBox value={draft.metric_name} onChange={(event) => update('metric_name', event.target.value)} placeholder="平均停留 / 新增粉丝 / 流水" /></AppField>
        <AppField label="指标单位"><AppTextBox value={draft.metric_unit} onChange={(event) => update('metric_unit', event.target.value)} placeholder="秒 / 人 / 元" /></AppField>
        <NumberField label="基线值" value={draft.baseline_value} onChange={(value) => update('baseline_value', value)} />
        <NumberField label="目标值" value={draft.target_value} onChange={(value) => update('target_value', value)} />
        <AppField label="开始日期"><AppTextBox type="date" value={draft.start_date} onChange={(event) => update('start_date', event.target.value)} /></AppField>
        <AppField label="预计结束"><AppTextBox type="date" value={draft.expected_end_date} onChange={(event) => update('expected_end_date', event.target.value)} /></AppField>
        <AppField label="优先级"><AppSelect options={options(priorities)} value={draft.priority} onValueChange={(value) => update('priority', value ?? '普通')} /></AppField>
        <AppField label="方案状态"><AppSelect options={options(planStatuses)} value={draft.status} onValueChange={(value) => update('status', value ?? '待执行')} /></AppField>
        <div className="form-span-2"><AppField label="结果摘要"><AppTextArea value={draft.result_summary} onChange={(event) => update('result_summary', event.target.value)} rows={3} placeholder="验证完成后再补充结果，不预设结论" /></AppField></div>
      </>}
    </form>
  </Dialog>
}

type FollowupDraft = { live_session_id: number | null; followup_date: string; execution_status: string; execution_note: string; metric_value: string; effect: string; effect_note: string; next_action: string }

function emptyFollowupDraft(): FollowupDraft {
  return { live_session_id: null, followup_date: today(), execution_status: '未执行', execution_note: '', metric_value: '', effect: '暂不判断', effect_note: '', next_action: '继续观察' }
}

function followupToDraft(followup: PlanFollowup | null): FollowupDraft {
  return followup ? { live_session_id: followup.live_session_id, followup_date: inputDate(followup.followup_date), execution_status: followup.execution_status, execution_note: followup.execution_note, metric_value: textNumber(followup.metric_value), effect: followup.effect, effect_note: followup.effect_note, next_action: followup.next_action } : emptyFollowupDraft()
}

function FollowupFormDialog({ open, anchorId, planId, sessions, initial, onClose, onSaved }: { open: boolean; anchorId: number; planId: number; sessions: LiveSession[]; initial: PlanFollowup | null; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<FollowupDraft>(emptyFollowupDraft)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { setDraft(followupToDraft(initial)); setError('') }, [initial, open])
  const update = <K extends keyof FollowupDraft>(key: K, value: FollowupDraft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const save = (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    const input: PlanFollowupInput = { plan_id: planId, anchor_id: anchorId, live_session_id: draft.live_session_id, followup_date: draft.followup_date, execution_status: draft.execution_status, execution_note: draft.execution_note, metric_value: optionalNumber(draft.metric_value), effect: draft.effect, effect_note: draft.effect_note, next_action: draft.next_action }
    const request = initial ? Service.UpdateFollowup(initial.id, input) : Service.AddFollowup(input)
    request.then(() => onSaved()).catch((reason) => setError(errorMessage(reason))).finally(() => setSaving(false))
  }
  return <Dialog open={open} title={initial ? '编辑跟进' : '新增方案跟进'} description="跟进同时记录执行情况、指标变化、效果判断和下一步动作。" onClose={onClose} actions={<><AppButton appearance="subtle" onClick={onClose}>取消</AppButton><AppButton appearance="primary" type="submit" form="followup-form" loading={saving}>{initial ? '保存跟进' : '保存跟进'}</AppButton></>}>
    <form id="followup-form" className="form-grid" onSubmit={save}>
      <FormError message={error} />
      <AppField label="跟进日期" required><AppTextBox type="date" value={draft.followup_date} onChange={(event) => update('followup_date', event.target.value)} autoFocus /></AppField>
      <AppField label="关联直播场次"><AppSelect options={[{ value: '', label: '不关联具体场次' }, ...sessions.map((session) => ({ value: String(session.id), label: `${session.session_date} · ${formatMetric(session.avg_online, 0)} 平均在线` }))]} value={draft.live_session_id === null ? '' : String(draft.live_session_id)} onValueChange={(value) => update('live_session_id', value ? Number(value) : null)} /></AppField>
      <AppField label="执行情况"><AppSelect options={options(executionStatuses)} value={draft.execution_status} onValueChange={(value) => update('execution_status', value ?? '未执行')} /></AppField>
      <AppField label="效果判断"><AppSelect options={options(effects)} value={draft.effect} onValueChange={(value) => update('effect', value ?? '暂不判断')} /></AppField>
      <NumberField label="当前指标值" value={draft.metric_value} onChange={(value) => update('metric_value', value)} />
      <AppField label="下一步动作"><AppSelect options={options(nextActions)} value={draft.next_action} onValueChange={(value) => update('next_action', value ?? '继续观察')} /></AppField>
      <div className="form-span-2"><AppField label="执行记录"><AppTextArea value={draft.execution_note} onChange={(event) => update('execution_note', event.target.value)} rows={3} placeholder="实际执行了哪些动作，和计划有何差异" /></AppField></div>
      <div className="form-span-2"><AppField label="效果说明"><AppTextArea value={draft.effect_note} onChange={(event) => update('effect_note', event.target.value)} rows={3} placeholder="基于哪次直播、哪些指标做判断" /></AppField></div>
    </form>
  </Dialog>
}

type GoalDraft = { title: string; start_date: string; end_date: string; description: string; status: string; metrics: Array<{ metric_name: string; baseline_value: string; target_value: string; metric_unit: string }> }

function emptyGoalDraft(): GoalDraft {
  return { title: '', start_date: today(), end_date: today(), description: '', status: '进行中', metrics: [{ metric_name: '', baseline_value: '', target_value: '', metric_unit: '' }] }
}

function goalToDraft(goal: StageGoal | null): GoalDraft {
  if (!goal) return emptyGoalDraft()
  return { title: goal.title, start_date: inputDate(goal.start_date), end_date: inputDate(goal.end_date), description: goal.description, status: goal.status, metrics: arrayOrEmpty(goal.metrics).length ? arrayOrEmpty(goal.metrics).map((metric) => ({ metric_name: metric.metric_name, baseline_value: textNumber(metric.baseline_value), target_value: textNumber(metric.target_value), metric_unit: metric.metric_unit })) : emptyGoalDraft().metrics }
}

function GoalFormDialog({ open, anchorId, initial, onClose, onSaved }: { open: boolean; anchorId: number; initial: StageGoal | null; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<GoalDraft>(emptyGoalDraft)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { setDraft(goalToDraft(initial)); setError('') }, [initial, open])
  const update = <K extends keyof GoalDraft>(key: K, value: GoalDraft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const updateMetric = (index: number, key: keyof GoalDraft['metrics'][number], value: string) => setDraft((current) => ({ ...current, metrics: current.metrics.map((metric, metricIndex) => metricIndex === index ? { ...metric, [key]: value } : metric) }))
  const save = (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    const metrics: GoalMetricInput[] = draft.metrics.filter((metric) => metric.metric_name.trim()).map((metric) => ({ metric_name: metric.metric_name, baseline_value: optionalNumber(metric.baseline_value), target_value: optionalNumber(metric.target_value), metric_unit: metric.metric_unit }))
    const input: StageGoalInput = { anchor_id: anchorId, title: draft.title, start_date: draft.start_date, end_date: draft.end_date, description: draft.description, status: draft.status, metrics }
    const request = initial ? Service.UpdateGoal(initial.id, input) : Service.CreateGoal(input)
    request.then(() => onSaved()).catch((reason) => setError(errorMessage(reason))).finally(() => setSaving(false))
  }
  return <Dialog open={open} title={initial ? '编辑阶段目标' : '新增阶段目标'} description="阶段目标可以包含多个指标，目标值和基线都允许暂时未知。" onClose={onClose} width={760} actions={<><AppButton appearance="subtle" onClick={onClose}>取消</AppButton><AppButton appearance="primary" type="submit" form="goal-form" loading={saving}>{initial ? '保存目标' : '建立目标'}</AppButton></>}>
    <form id="goal-form" className="form-grid" onSubmit={save}>
      <FormError message={error} />
      <div className="form-span-2"><AppField label="目标标题" required><AppTextBox value={draft.title} onChange={(event) => update('title', event.target.value)} placeholder="例如：培养期完成稳定开播习惯" autoFocus /></AppField></div>
      <AppField label="开始日期" required><AppTextBox type="date" value={draft.start_date} onChange={(event) => update('start_date', event.target.value)} /></AppField>
      <AppField label="结束日期" required><AppTextBox type="date" value={draft.end_date} onChange={(event) => update('end_date', event.target.value)} /></AppField>
      <AppField label="目标状态"><AppSelect options={options(goalStatuses)} value={draft.status} onValueChange={(value) => update('status', value ?? '进行中')} /></AppField>
      <div className="form-span-2"><AppField label="目标说明"><AppTextArea value={draft.description} onChange={(event) => update('description', event.target.value)} rows={3} placeholder="写清阶段目标的背景和验收方式" /></AppField></div>
      <div className="form-span-2 metric-editor"><div className="subheading-row"><strong>目标指标</strong><AppButton size="compact" appearance="subtle" type="button" onClick={() => update('metrics', [...draft.metrics, { metric_name: '', baseline_value: '', target_value: '', metric_unit: '' }])}>+ 添加指标</AppButton></div>{draft.metrics.map((metric, index) => <div className="metric-editor-row" key={index}><AppTextBox value={metric.metric_name} onChange={(event) => updateMetric(index, 'metric_name', event.target.value)} placeholder="指标名称" /><AppTextBox type="number" value={metric.baseline_value} onChange={(event) => updateMetric(index, 'baseline_value', event.target.value)} placeholder="基线" /><AppTextBox type="number" value={metric.target_value} onChange={(event) => updateMetric(index, 'target_value', event.target.value)} placeholder="目标" /><AppTextBox value={metric.metric_unit} onChange={(event) => updateMetric(index, 'metric_unit', event.target.value)} placeholder="单位" />{draft.metrics.length > 1 && <AppButton size="compact" appearance="subtle" type="button" onClick={() => update('metrics', draft.metrics.filter((_, metricIndex) => metricIndex !== index))}>移除</AppButton>}</div>)}</div>
    </form>
  </Dialog>
}

type EventDraft = { event_date: string; event_type: string; title: string; content: string; live_session_id: number | null }

function emptyEventDraft(): EventDraft {
  return { event_date: today(), event_type: '其他', title: '', content: '', live_session_id: null }
}

function eventToDraft(event: AnchorEvent | null): EventDraft {
  return event ? { event_date: inputDate(event.event_date), event_type: event.event_type, title: event.title, content: event.content, live_session_id: event.live_session_id } : emptyEventDraft()
}

function EventFormDialog({ open, anchorId, sessions, initial, onClose, onSaved }: { open: boolean; anchorId: number; sessions: LiveSession[]; initial: AnchorEvent | null; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<EventDraft>(emptyEventDraft)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { setDraft(eventToDraft(initial)); setError('') }, [initial, open])
  const update = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const save = (formEvent: FormEvent) => {
    formEvent.preventDefault(); setSaving(true); setError('')
    const input: AnchorEventInput = { anchor_id: anchorId, event_date: draft.event_date, event_type: draft.event_type, title: draft.title, content: draft.content, live_session_id: draft.live_session_id }
    const request = initial ? Service.UpdateEvent(initial.id, input) : Service.CreateEvent(input)
    request.then(() => onSaved()).catch((reason) => setError(errorMessage(reason))).finally(() => setSaving(false))
  }
  return <Dialog open={open} title={initial ? '编辑运营事件' : '新增运营事件'} description="记录会影响直播表现或运营判断的上下文，之后会出现在主播时间线里。" onClose={onClose} actions={<><AppButton appearance="subtle" onClick={onClose}>取消</AppButton><AppButton appearance="primary" type="submit" form="event-form" loading={saving}>{initial ? '保存事件' : '记录事件'}</AppButton></>}>
    <form id="event-form" className="form-grid" onSubmit={save}>
      <FormError message={error} />
      <AppField label="事件日期" required><AppTextBox type="date" value={draft.event_date} onChange={(event) => update('event_date', event.target.value)} autoFocus /></AppField>
      <AppField label="事件类型"><AppSelect options={options(eventTypes)} value={draft.event_type} onValueChange={(value) => update('event_type', value ?? '其他')} /></AppField>
      <div className="form-span-2"><AppField label="事件标题" required><AppTextBox value={draft.title} onChange={(event) => update('title', event.target.value)} placeholder="例如：本周开始固定 20:00 开播" /></AppField></div>
      <AppField label="关联直播场次"><AppSelect options={[{ value: '', label: '不关联具体场次' }, ...sessions.map((session) => ({ value: String(session.id), label: session.session_date }))]} value={draft.live_session_id === null ? '' : String(draft.live_session_id)} onValueChange={(value) => update('live_session_id', value ? Number(value) : null)} /></AppField>
      <div className="form-span-2"><AppField label="事件说明"><AppTextArea value={draft.content} onChange={(event) => update('content', event.target.value)} rows={4} placeholder="记录变化、背景和对后续运营的影响" /></AppField></div>
    </form>
  </Dialog>
}

function SessionDetailDialog({ session, onClose, onEdit, onCreateReview }: { session: LiveSession; onClose: () => void; onEdit: () => void; onCreateReview: () => void }) {
  return <Dialog open title="直播场次详情" description="查看本场完整原始数据和由此计算的指标。" onClose={onClose} width={820} actions={<><AppButton appearance="subtle" onClick={onClose}>关闭</AppButton><AppButton appearance="standard" onClick={onCreateReview}>建复盘</AppButton><AppButton appearance="primary" onClick={onEdit}>编辑场次</AppButton></>}>
    <dl className="info-list session-detail-list">
      <div><dt>直播日期</dt><dd>{formatDate(session.session_date)}</dd></div><div><dt>开播—下播</dt><dd>{formatDateTime(session.started_at)} — {formatDateTime(session.ended_at)}</dd></div>
      <div><dt>直播时长</dt><dd>{formatMetric(session.duration_minutes, 0)}{session.duration_minutes === null ? '' : ' 分钟'}{session.duration_override ? ' · 手工覆盖' : ''}</dd></div><div><dt>数据来源</dt><dd>{session.source || '未填写'}</dd></div>
      <div><dt>场观</dt><dd>{formatMetric(session.views, 0)}</dd></div><div><dt>最高在线</dt><dd>{formatMetric(session.peak_online, 0)}</dd></div>
      <div><dt>平均在线</dt><dd>{formatMetric(session.avg_online, 0)}</dd></div><div><dt>平均停留</dt><dd>{formatMetric(session.avg_stay_seconds, 0)}{session.avg_stay_seconds === null ? '' : ' 秒'}</dd></div>
      <div><dt>粉丝变化</dt><dd>{formatMetric(session.followers_before, 0)} → {formatMetric(session.followers_after, 0)} · 新增 {formatMetric(session.followers_gained, 0)}</dd></div><div><dt>流水</dt><dd>{formatYuan(session.revenue_cents)}</dd></div>
      <div><dt>点赞 / 评论 / 分享</dt><dd>{formatMetric(session.likes, 0)} / {formatMetric(session.comments, 0)} / {formatMetric(session.shares, 0)}</dd></div><div><dt>评论用户 / 付费人数</dt><dd>{formatMetric(session.comment_users, 0)} / {formatMetric(session.payer_count, 0)}</dd></div>
      <div><dt>礼物用户</dt><dd>{formatMetric(session.gift_user_count, 0)}</dd></div><div><dt>PK</dt><dd>{formatMetric(session.pk_win_count, 0)} 胜 / {formatMetric(session.pk_count, 0)} 场 · {formatYuan(session.pk_revenue_cents)}</dd></div>
      <div><dt>运营负责人</dt><dd>{session.operator_name || '未指定'}</dd></div><div><dt>异常</dt><dd>{session.is_abnormal ? session.abnormal_note || '已标记，未填写说明' : '否'}</dd></div>
    </dl>
    <div className="detail-note-block"><span>计算指标</span><p>流水/小时 {session.metrics.revenue_per_hour === null ? '—' : formatYuan(Math.round(session.metrics.revenue_per_hour * 100))} · 涨粉/小时 {formatMetric(session.metrics.followers_per_hour, 1)} · 千次场观涨粉 {formatMetric(session.metrics.followers_per_1000_views, 1)} · 付费率 {formatPercent(session.metrics.payer_rate)} · 评论用户率 {formatPercent(session.metrics.comment_user_rate)} · PK 胜率 {formatPercent(session.metrics.pk_win_rate)}</p></div>
    <div className="detail-note-block"><span>场次备注</span><p>{session.notes || '暂无备注'}</p></div>
  </Dialog>
}

function IssueDetailDialog({ issue, plans, reviews, sessions, onClose, onEdit, onCreatePlan, onOpenPlan, onOpenReview, onOpenSession }: { issue: AnchorIssue; plans: ImprovementPlan[]; reviews: OperationReview[]; sessions: LiveSession[]; onClose: () => void; onEdit: () => void; onCreatePlan: () => void; onOpenPlan: (planId: number) => void; onOpenReview: (review: OperationReview) => void; onOpenSession: (session: LiveSession) => void }) {
  const relatedPlans = plans.filter((plan) => plan.issue_id === issue.id)
  const relatedReview = issue.review_id === null ? null : reviews.find((review) => review.id === issue.review_id) ?? null
  const relatedSession = relatedReview?.live_session_id === null || relatedReview?.live_session_id === undefined ? null : sessions.find((session) => session.id === relatedReview.live_session_id) ?? null
  return <Dialog open title="问题详情" description="查看问题的事实依据、原因假设和关联改进方案。" onClose={onClose} width={760} actions={<><AppButton appearance="subtle" onClick={onClose}>关闭</AppButton><AppButton appearance="standard" onClick={onEdit}>编辑问题</AppButton><AppButton appearance="primary" onClick={onCreatePlan}>+ 建方案</AppButton></>}>
    <div className="detail-dialog-heading"><div className="issue-title"><span className="priority-mark" data-priority={issue.priority} /><div><h3>{issue.title}</h3><span>{issue.category} · 发现于 {formatDate(issue.discovered_at)}</span></div></div><div className="row-actions"><Badge>{issue.priority}</Badge><Badge>{issue.status}</Badge></div></div>
    <div className="issue-fields detail-dialog-fields"><div><span>问题描述</span><p>{issue.description || '暂无描述'}</p></div><div><span>事实证据</span><p>{issue.evidence || '暂无证据'}</p></div><div><span>原因假设</span><p>{issue.cause_hypothesis || '暂无假设'}</p></div></div>
    <div className="related-records"><div className="subheading-row"><strong>关联上下文</strong><span>{relatedReview || relatedSession ? '可追溯' : '未关联'}</span></div><div className="detail-dialog-links">{relatedReview ? <button className="list-row" onClick={() => onOpenReview(relatedReview)}><span className="plan-mark">↺</span><span className="row-main"><strong>复盘 · {formatDate(relatedReview.review_date)}</strong><small>{relatedReview.summary || '未填写复盘总结'}</small></span><span className="row-arrow">›</span></button> : <p className="muted-copy">未关联复盘记录。</p>}{relatedSession ? <button className="list-row" onClick={() => onOpenSession(relatedSession)}><span className="plan-mark">◉</span><span className="row-main"><strong>直播场次 · {formatDate(relatedSession.session_date)}</strong><small>平均在线 {formatMetric(relatedSession.avg_online, 0)} · 场观 {formatMetric(relatedSession.views, 0)}</small></span><span className="row-arrow">›</span></button> : <p className="muted-copy">关联复盘未绑定具体直播场次。</p>}</div></div>
    <div className="related-records"><div className="subheading-row"><strong>关联方案</strong><span>{relatedPlans.length} 个</span></div>{relatedPlans.length === 0 ? <p className="muted-copy">还没有方案，先把问题拆成一个可执行动作。</p> : <div className="compact-list">{relatedPlans.map((plan) => <button className="list-row" key={plan.id} onClick={() => onOpenPlan(plan.id)}><span className="plan-mark">↗</span><span className="row-main"><strong>{plan.title}</strong><small>{plan.status} · 开始于 {formatDate(plan.start_date)} · 跟进 {plan.followup_count} 次</small></span><span className="row-arrow">›</span></button>)}</div>}</div>
  </Dialog>
}

function MetricValue({ label, value, suffix = '' }: { label: string; value: string; suffix?: string }) {
  return <div className="metric-value"><span>{label}</span><strong>{value}{suffix}</strong></div>
}

function SessionMetrics({ session }: { session: LiveSession }) {
  return <div className="metric-inline-grid"><MetricValue label="平均在线" value={formatMetric(session.avg_online, 0)} /><MetricValue label="平均停留" value={formatMetric(session.avg_stay_seconds, 0)} suffix={session.avg_stay_seconds === null ? '' : ' 秒'} /><MetricValue label="新增粉丝" value={formatMetric(session.followers_gained, 0)} /><MetricValue label="流水" value={formatYuan(session.revenue_cents)} /><MetricValue label="人均付费率" value={formatPercent(session.metrics.payer_rate)} /></div>
}

function AnomalyPanel({ anomalies, onConvert }: { anomalies: AnomalyCandidate[]; onConvert: (candidate: AnomalyCandidate) => Promise<void> }) {
  const [hidden, setHidden] = useState<Record<string, string>>({})
  const [converting, setConverting] = useState('')
  const visible = anomalies.filter((candidate) => !hidden[candidate.id])
  if (visible.length === 0) return null
  const hide = (candidate: AnomalyCandidate, action: string) => setHidden((current) => ({ ...current, [candidate.id]: action }))
  const convert = async (candidate: AnomalyCandidate) => {
    setConverting(candidate.id)
    try {
      await onConvert(candidate)
      hide(candidate, '已转为问题')
    } finally {
      setConverting('')
    }
  }
  return <section className="content-section anomaly-panel"><div className="section-heading"><div><h2>可能异常</h2><p>规则只提示数据变化，不代表已经确认原因。</p></div><span className="section-count warning-count">{visible.length}</span></div><div className="anomaly-list">{visible.map((candidate) => <AppCard key={candidate.id} className="anomaly-row"><div className="anomaly-row-main"><div className="row-title"><strong>{candidate.title}</strong><Badge>提示</Badge></div><p>{candidate.evidence}</p><small>检测于 {formatDate(candidate.detected_at)} · 规则：{candidate.rule}</small></div><div className="row-actions"><AppButton size="compact" appearance="subtle" onClick={() => hide(candidate, '已忽略')}>忽略</AppButton><AppButton size="compact" appearance="subtle" onClick={() => hide(candidate, '继续观察')}>继续观察</AppButton><AppButton size="compact" appearance="primary" loading={converting === candidate.id} onClick={() => void convert(candidate)}>转为问题</AppButton></div></AppCard>)}</div></section>
}

function TrendTable({ trend }: { trend: TrendPoint[] }) {
  const columns = useMemo<AppDataTableColumn<TrendPoint>[]>(() => [
    { accessorKey: 'date', header: '日期', size: 120, cell: ({ row }) => formatDate(row.original.date) },
    { accessorKey: 'duration_minutes', header: '时长', size: 110, cell: ({ row }) => `${formatMetric(row.original.duration_minutes, 0)}${row.original.duration_minutes === null ? '' : ' 分钟'}` },
    { accessorKey: 'avg_online', header: '平均在线', size: 110, cell: ({ row }) => formatMetric(row.original.avg_online, 0) },
    { accessorKey: 'avg_stay_seconds', header: '平均停留', size: 110, cell: ({ row }) => `${formatMetric(row.original.avg_stay_seconds, 0)} 秒` },
    { accessorKey: 'followers_gained', header: '新增粉丝', size: 110, cell: ({ row }) => formatMetric(row.original.followers_gained, 0) },
    { accessorKey: 'revenue_cents', header: '流水', size: 110, cell: ({ row }) => formatYuan(row.original.revenue_cents) },
    { accessorKey: 'event_count', header: '事件', size: 80, cell: ({ row }) => row.original.event_count || '—' },
  ], [])

  return trend.length === 0 ? <Empty title="还没有趋势数据" description="新增直播记录后，这里会按天聚合关键指标。" /> : <AppDataView height="auto"><AppDataTable data={trend} columns={columns} density="compact" stickyHeader pagination={false} getRowId={(point) => point.date} /></AppDataView>
}

type TrendMetricKey = 'avg_online' | 'avg_stay_seconds' | 'duration_minutes' | 'followers_gained' | 'revenue_cents'

const trendMetrics: Array<{ value: TrendMetricKey; label: string }> = [
  { value: 'avg_online', label: '平均在线' },
  { value: 'avg_stay_seconds', label: '平均停留' },
  { value: 'duration_minutes', label: '直播时长' },
  { value: 'followers_gained', label: '新增粉丝' },
  { value: 'revenue_cents', label: '流水' },
]

function trendValue(point: TrendPoint, metric: TrendMetricKey): number | null | undefined {
  return point[metric]
}

function trendValueLabel(value: number, metric: TrendMetricKey): string {
  if (metric === 'revenue_cents') return formatYuan(value)
  const suffix = metric === 'avg_stay_seconds' ? ' 秒' : metric === 'duration_minutes' ? ' 分钟' : metric === 'avg_online' || metric === 'followers_gained' ? ' 人' : ''
  return `${formatMetric(value, 0)}${suffix}`
}

function TrendChart({ trend }: { trend: TrendPoint[] }) {
  const [metric, setMetric] = useState<TrendMetricKey>('avg_online')
  const selectedLabel = trendMetrics.find((item) => item.value === metric)?.label ?? '趋势'
  const points = trend.map((point, index) => ({ point, index, value: trendValue(point, metric) })).filter((item): item is { point: TrendPoint; index: number; value: number } => item.value !== null && item.value !== undefined)
  if (trend.length === 0) return null
  if (points.length < 2) return <div className="trend-chart"><div className="trend-chart-label"><span>{selectedLabel}趋势</span><AppSelect options={trendMetrics} value={metric} onValueChange={(value) => { if (value) setMetric(value as TrendMetricKey) }} /></div><p className="muted-copy">当前范围内至少需要两天有“{selectedLabel}”数据才能绘图。</p></div>
  const max = Math.max(...points.map((item) => item.value), 1)
  const min = Math.min(...points.map((item) => item.value), 0)
  const width = 760
  const height = 130
  const x = (index: number) => trend.length <= 1 ? 0 : (index / (trend.length - 1)) * width
  const y = (value: number) => height - ((value - min) / Math.max(max - min, 1)) * (height - 18) - 8
  const line = points.map((item) => `${x(item.index)},${y(item.value)}`).join(' ')
  return <div className="trend-chart"><div className="trend-chart-label"><span>{selectedLabel}趋势</span><div className="trend-chart-controls"><AppSelect options={trendMetrics} value={metric} onValueChange={(value) => { if (value) setMetric(value as TrendMetricKey) }} /><small>仅连接有数据的日期；橙色点表示当天有运营事件。</small></div></div><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${selectedLabel}趋势图`} preserveAspectRatio="none"><line x1="0" y1={height - 8} x2={width} y2={height - 8} className="chart-axis" /><polyline points={line} className="chart-line" fill="none" />{points.map((item) => <circle key={item.point.date} cx={x(item.index)} cy={y(item.value)} r="3.5" className="chart-point" />)}{trend.map((point, index) => point.event_count > 0 && <circle key={`event-${point.date}`} cx={x(index)} cy={height - 8} r="4.5" className="chart-event-point"><title>{formatDate(point.date)} · {point.event_count} 个运营事件</title></circle>)}</svg><div className="trend-chart-range"><span>{formatDate(trend[0].date)}</span><span>{formatDate(trend[trend.length - 1].date)}</span></div><div className="trend-chart-values">{points.slice(-3).map((item) => <span key={item.point.date}>{formatDate(item.point.date)} {trendValueLabel(item.value, metric)}</span>)}</div></div>
}

function dateAgo(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return localDate(date)
}

function periodMetricValue(metric: NonNullable<PeriodComparison['metrics']>[number], value: number | null): string {
  if (value === null || value === undefined) return '—'
  if (metric.metric_name === 'revenue_per_hour') return `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  return `${formatMetric(value, metric.metric_name === 'avg_stay_seconds' ? 0 : 1)}${metric.unit ? ` ${metric.unit}` : ''}`
}

function PeriodComparisonPanel({ comparison }: { comparison: PeriodComparison }) {
  return <div className="period-comparison"><div className="period-comparison-heading"><div><strong>周期对比</strong><span>最近 {comparison.period_days} 天 vs 前 {comparison.period_days} 天</span></div><small>{formatDate(comparison.previous_start_date)}—{formatDate(comparison.previous_end_date)} · {formatDate(comparison.current_start_date)}—{formatDate(comparison.current_end_date)}</small></div><div className="period-comparison-table"><div className="period-comparison-row period-comparison-header"><span>指标</span><span>上周期</span><span>本周期</span><span>变化</span></div>{arrayOrEmpty(comparison.metrics).map((metric) => <div className="period-comparison-row" key={metric.metric_name}><strong>{metric.label}</strong><span>{periodMetricValue(metric, metric.previous_value)}</span><span>{periodMetricValue(metric, metric.current_value)}</span><span className={metric.change_rate !== null && metric.change_rate >= 0 ? 'metric-positive' : 'metric-negative'}>{metric.change_rate === null ? '—' : `${metric.change_rate >= 0 ? '+' : ''}${formatPercent(metric.change_rate)}`}</span></div>)}</div><p className="muted-copy">对比只描述数据变化；事件、方案和其他上下文仍需结合时间线判断。</p></div>
}

function TrendPanel({ anchorId, initialTrend }: { anchorId: number; initialTrend: TrendPoint[] }) {
  const [range, setRange] = useState<'7' | '14' | '30' | 'custom'>('30')
  const [startDate, setStartDate] = useState(dateAgo(29))
  const [endDate, setEndDate] = useState(today())
  const [trend, setTrend] = useState(initialTrend)
  const [comparison, setComparison] = useState<PeriodComparison | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    setLoading(true); setError('')
    const request = range === 'custom' ? Service.GetAnchorTrendRange(anchorId, startDate, endDate) : Service.GetAnchorTrend(anchorId, Number(range))
    const comparisonRequest = range === '14' ? Service.GetAnchorPeriodComparison(anchorId, endDate, 7) : Promise.resolve(null)
    Promise.all([request, comparisonRequest]).then(([result, period]) => { if (alive) { setTrend(arrayOrEmpty(result)); setComparison(period) } }).catch((reason) => { if (alive) setError(errorMessage(reason)) }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [anchorId, endDate, range, startDate])
  return <section className="content-section"><div className="section-heading"><div><h2>趋势</h2><p>按日期聚合；空值会保持为空，不会伪造连续数据。</p></div><div className="trend-controls"><div className="range-buttons" role="group" aria-label="趋势范围"><button type="button" className={range === '7' ? 'is-active' : ''} onClick={() => setRange('7')}>7 天</button><button type="button" className={range === '14' ? 'is-active' : ''} onClick={() => setRange('14')}>14 天对比</button><button type="button" className={range === '30' ? 'is-active' : ''} onClick={() => setRange('30')}>30 天</button><button type="button" className={range === 'custom' ? 'is-active' : ''} onClick={() => setRange('custom')}>自定义</button></div>{range === 'custom' && <div className="date-range"><AppTextBox type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /><span>至</span><AppTextBox type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></div>}</div></div>{error && <FormError message={error} />}{loading ? <div className="loading-state compact-loading">正在读取趋势…</div> : <><TrendChart trend={trend} />{comparison && <PeriodComparisonPanel comparison={comparison} />}<TrendTable trend={trend} /></>}</section>
}

type TimelineKind = '直播' | '复盘' | '问题' | '方案' | '跟进' | '目标' | '事件' | '状态'
type TimelineItem = { date: string; kind: TimelineKind; title: string; note: string; event?: AnchorEvent }

function Timeline({ detail, onEditEvent, onDeleteEvent }: { detail: AnchorDetail; onEditEvent?: (event: AnchorEvent) => void; onDeleteEvent?: (event: AnchorEvent) => void }) {
  const [filter, setFilter] = useState<'全部' | TimelineKind>('全部')
  const items = useMemo<TimelineItem[]>(() => {
    const planTitles = new Map(arrayOrEmpty(detail.plans).map((plan) => [plan.id, plan.title]))
    const sessions = arrayOrEmpty(detail.sessions).map((session) => ({ date: session.session_date, kind: '直播' as const, title: `直播 · ${formatMetric(session.avg_online, 0)} 平均在线`, note: `${formatYuan(session.revenue_cents)} · ${formatMetric(session.followers_gained, 0)} 新增粉丝` }))
    const reviews = arrayOrEmpty(detail.reviews).map((review) => ({ date: review.review_date, kind: '复盘' as const, title: review.summary || '运营复盘', note: review.conclusion || '暂无结论' }))
    const issues = arrayOrEmpty(detail.issues).map((issue) => ({ date: issue.discovered_at, kind: '问题' as const, title: issue.title, note: `${issue.category} · ${issue.priority} · ${issue.status}` }))
    const plans = arrayOrEmpty(detail.plans).map((plan) => ({ date: plan.start_date, kind: '方案' as const, title: plan.title, note: `${plan.metric_name || '暂无指标'} · ${plan.status}` }))
    const followups = arrayOrEmpty(detail.followups).map((followup) => ({ date: followup.followup_date, kind: '跟进' as const, title: `方案跟进 · ${planTitles.get(followup.plan_id) || '改进方案'}`, note: `${followup.execution_status} · ${followup.effect} · 下一步 ${followup.next_action}` }))
    const goals = arrayOrEmpty(detail.goals).map((goal) => ({ date: goal.start_date, kind: '目标' as const, title: goal.title, note: `${goal.start_date}—${goal.end_date} · ${goal.status}` }))
    const events = arrayOrEmpty(detail.events).map((event) => ({ date: event.event_date, kind: '事件' as const, title: event.title, note: `${event.event_type} · ${event.content}`, event }))
    const statusChanges = arrayOrEmpty(detail.status_changes).map((change: StatusChange) => ({ date: change.changed_at, kind: '状态' as const, title: `${change.entity_type === 'issue' ? '问题' : change.entity_type === 'plan' ? '方案' : '目标'}状态变更`, note: `${change.entity_title || `#${change.entity_id}`} → ${change.status}` }))
    return [...sessions, ...reviews, ...issues, ...plans, ...followups, ...goals, ...events, ...statusChanges].sort((a, b) => b.date.localeCompare(a.date))
  }, [detail])
  const visibleItems = filter === '全部' ? items : items.filter((item) => item.kind === filter)
  return items.length === 0 ? <Empty title="时间线还是空的" description="直播、复盘、问题、方案、跟进、目标和事件会按发生时间汇总在这里。" /> : <div className="timeline-wrap"><div className="timeline-filter"><span>筛选类型</span><AppSelect options={[{ value: '全部', label: '全部' }, ...(['直播', '复盘', '问题', '方案', '跟进', '目标', '事件', '状态'] as TimelineKind[]).map((value) => ({ value, label: value }))]} value={filter} onValueChange={(value) => { if (value) setFilter(value as '全部' | TimelineKind) }} /></div>{visibleItems.length === 0 ? <p className="muted-copy">当前类型暂无记录。</p> : <div className="timeline">{visibleItems.map((item, index) => <div className="timeline-item" key={`${item.kind}-${item.date}-${index}`}><span className="timeline-dot" /><div><div className="timeline-meta"><Badge>{item.kind}</Badge><span>{formatDateTime(item.date)}</span>{item.event && onEditEvent && <div className="timeline-actions"><AppButton size="compact" appearance="subtle" onClick={() => onEditEvent(item.event as AnchorEvent)}>编辑</AppButton>{onDeleteEvent && <AppButton size="compact" appearance="subtle" onClick={() => onDeleteEvent(item.event as AnchorEvent)}>删除</AppButton>}</div>}</div><strong>{item.title}</strong><p>{item.note || '暂无补充说明'}</p></div></div>)}</div>}</div>
}

function PlanFollowups({ plan, sessions, refreshToken, onAdd, onEdit, onRefresh }: { plan: ImprovementPlan; sessions: LiveSession[]; refreshToken: number; onAdd: () => void; onEdit: (followup: PlanFollowup) => void; onRefresh: () => void }) {
  const [followups, setFollowups] = useState<PlanFollowup[]>([])
  const [comparison, setComparison] = useState<PlanEffectComparison | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = () => { setLoading(true); setError(''); Promise.all([Service.ListFollowups(plan.id), Service.GetPlanEffectComparison(plan.id)]).then(([result, effect]) => { setFollowups(arrayOrEmpty(result)); setComparison(effect) }).catch((reason) => setError(errorMessage(reason))).finally(() => setLoading(false)) }
  useEffect(() => { load() }, [plan.id, refreshToken])
  const changeStatus = (status: string) => { Service.ChangePlanStatus(plan.id, status).then(() => { load(); onRefresh() }).catch((reason) => setError(errorMessage(reason))) }
  const remove = (followup: PlanFollowup) => { if (!window.confirm(`确认删除 ${formatDate(followup.followup_date)} 的跟进记录？`)) return; Service.DeleteFollowup(followup.id).then(() => { load(); onRefresh() }).catch((reason) => setError(errorMessage(reason))) }
  const displayMetric = (value: number | null | undefined) => value === null || value === undefined ? '—' : plan.metric_name === 'revenue_cents' ? formatYuan(Math.round(value)) : `${formatMetric(value)}${plan.metric_unit ? ` ${plan.metric_unit}` : ''}`
  return <div className="plan-panel"><div className="plan-panel-header"><div><strong>方案跟进</strong><span>{plan.followup_count} 条记录 · 最近 {formatDate(plan.last_followup_date)}</span></div><div className="plan-panel-actions"><AppSelect options={options(planStatuses)} value={plan.status} onValueChange={(value) => { if (value && value !== plan.status) changeStatus(value) }} /><AppButton size="compact" appearance="primary" onClick={onAdd}>+ 新增跟进</AppButton></div></div>{error && <FormError message={error} />}{loading ? <div className="loading-state compact-loading">正在读取跟进…</div> : <>{comparison && comparison.metric_name && (comparison.before_count > 0 || comparison.after_count > 0 || comparison.current_value !== null) && <div className="plan-effect-comparison"><div className="plan-effect-heading"><div><strong>方案前后效果对比</strong><span>实施前最近 3 场 vs 实施后最早 3 场</span></div><small>变化用于辅助判断，不自动等同于因果。</small></div><div className="plan-effect-grid"><div><span>实施前（{comparison.before_count} 场）</span><strong>{displayMetric(comparison.before_average)}</strong></div><div><span>实施后（{comparison.after_count} 场）</span><strong>{displayMetric(comparison.after_average)}</strong></div><div><span>前后变化</span><strong className={comparison.before_after_change !== null && comparison.before_after_change >= 0 ? 'metric-positive' : 'metric-negative'}>{comparison.before_after_change === null ? '—' : `${comparison.before_after_change >= 0 ? '+' : ''}${formatMetric(comparison.before_after_change)}${comparison.before_after_rate === null ? '' : `（${comparison.before_after_rate >= 0 ? '+' : ''}${formatPercent(comparison.before_after_rate)}）`}`}</strong></div><div><span>最近跟进值</span><strong>{displayMetric(comparison.current_value)}</strong></div></div></div>}{followups.length === 0 ? <Empty title="还没有跟进记录" description="完成一次动作后，回来记录执行情况和下一步。" action={<AppButton size="compact" appearance="primary" onClick={onAdd}>记录第一次跟进</AppButton>} /> : <div className="followup-list">{followups.map((followup) => <div className="followup-row" key={followup.id}><div className="followup-date">{formatDate(followup.followup_date)}</div><div className="row-main"><div className="row-title"><Badge>{followup.execution_status}</Badge><Badge>{followup.effect}</Badge>{followup.metric_value !== null && <span className="metric-inline">指标 {formatMetric(followup.metric_value)}</span>}{followup.metric_change !== null && <span className={`metric-inline${followup.metric_change >= 0 ? ' metric-positive' : ' metric-negative'}`}>相对基线 {followup.metric_change >= 0 ? '+' : ''}{formatMetric(followup.metric_change)}{followup.metric_change_rate !== null && <small>（{followup.metric_change_rate >= 0 ? '+' : ''}{formatPercent(followup.metric_change_rate)}）</small>}</span>}</div><p>{followup.execution_note || '未填写执行记录'}</p><small>下一步：{followup.next_action} · {followup.effect_note || '暂无效果说明'}</small></div><div className="row-actions"><AppButton size="compact" appearance="subtle" onClick={() => onEdit(followup)}>编辑</AppButton><AppButton size="compact" appearance="subtle" onClick={() => remove(followup)}>删除</AppButton></div></div>)}</div>}</>}</div>
}

export type DetailTab = 'overview' | 'sessions' | 'reviews' | 'issues' | 'plans' | 'goals' | 'timeline'
type DetailDialog = 'session' | 'session-detail' | 'review' | 'issue' | 'issue-detail' | 'plan' | 'followup' | 'goal' | 'event' | null

export function AnchorDetailPage({ anchorId, refreshKey, initialTab = 'overview', targetId, onBack }: { anchorId: number; refreshKey: number; initialTab?: DetailTab; targetId?: number; onBack: () => void }) {
  const [detail, setDetail] = useState<AnchorDetail | null>(null)
  const [tab, setTab] = useState<DetailTab>('overview')
  const [dialog, setDialog] = useState<DetailDialog>(null)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingSession, setEditingSession] = useState<LiveSession | null>(null)
  const [copyingSession, setCopyingSession] = useState<LiveSession | null>(null)
  const [editingReview, setEditingReview] = useState<OperationReview | null>(null)
  const [reviewSessionId, setReviewSessionId] = useState<number | null>(null)
  const [editingIssue, setEditingIssue] = useState<AnchorIssue | null>(null)
  const [issueReviewId, setIssueReviewId] = useState<number | null>(null)
  const [editingPlan, setEditingPlan] = useState<ImprovementPlan | null>(null)
  const [planIssueId, setPlanIssueId] = useState<number | null>(null)
  const [followupPlanId, setFollowupPlanId] = useState<number | null>(null)
  const [editingFollowup, setEditingFollowup] = useState<PlanFollowup | null>(null)
  const [editingGoal, setEditingGoal] = useState<StageGoal | null>(null)
  const [editingEvent, setEditingEvent] = useState<AnchorEvent | null>(null)
  const [viewingSession, setViewingSession] = useState<LiveSession | null>(null)
  const [viewingIssue, setViewingIssue] = useState<AnchorIssue | null>(null)
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null)
  const [selectedGoalId, setSelectedGoalId] = useState<number | null>(null)
  const [anomalies, setAnomalies] = useState<AnomalyCandidate[]>([])

  const load = () => { setLoading(true); setError(''); Service.GetAnchorDetail(anchorId).then(setDetail).catch((reason) => setError(errorMessage(reason))).finally(() => setLoading(false)) }
  useEffect(() => { load() }, [anchorId, refreshKey, revision])
  useEffect(() => {
    let alive = true
    Service.GetAnchorAnomalies(anchorId, 30).then((items) => { if (alive) setAnomalies(arrayOrEmpty(items)) }).catch((reason) => { if (alive) setError(errorMessage(reason)) })
    return () => { alive = false }
  }, [anchorId, refreshKey, revision])
  useEffect(() => { if (detail && selectedPlanId !== null && !arrayOrEmpty(detail.plans).some((plan) => plan.id === selectedPlanId)) setSelectedPlanId(null) }, [detail, selectedPlanId])
  useEffect(() => {
    if (!detail) return
    setTab(initialTab)
    setSelectedPlanId(initialTab === 'plans' ? targetId ?? null : null)
    setSelectedGoalId(initialTab === 'goals' ? targetId ?? null : null)
    if (initialTab === 'issues' && targetId) {
      const issue = arrayOrEmpty(detail.issues).find((item) => item.id === targetId)
      if (issue) { setViewingIssue(issue); setDialog('issue-detail') }
    }
  }, [detail, initialTab, targetId])

  const sessions = arrayOrEmpty(detail?.sessions)
  const reviews = arrayOrEmpty(detail?.reviews)
  const issues = arrayOrEmpty(detail?.issues)
  const plans = arrayOrEmpty(detail?.plans)
  const goals = arrayOrEmpty(detail?.goals)
  const activeIssues = issues.filter((issue) => issue.status !== '已解决' && issue.status !== '已关闭')
  const activePlans = plans.filter((plan) => !['已验证有效', '无效', '已终止'].includes(plan.status))
  const opened = (next: DetailDialog) => { setDialog(next); setError('') }
  const saved = (continueEntry = false) => { if (!continueEntry) setDialog(null); setEditingSession(null); setCopyingSession(null); setRevision((value) => value + 1) }
  const openSession = (session: LiveSession | null = null) => { setCopyingSession(null); setEditingSession(session); opened('session') }
  const openSessionCopy = (session: LiveSession) => { setEditingSession(null); setCopyingSession(session); opened('session') }
  const openSessionDetail = (session: LiveSession) => { setViewingSession(session); opened('session-detail') }
  const openReview = (review: OperationReview | null = null, sessionId: number | null = null) => { setEditingReview(review); setReviewSessionId(review?.live_session_id ?? sessionId); opened('review') }
  const openIssue = (issue: AnchorIssue | null = null, reviewId: number | null = null) => { setEditingIssue(issue); setIssueReviewId(reviewId); opened('issue') }
  const openIssueDetail = (issue: AnchorIssue) => { setViewingIssue(issue); opened('issue-detail') }
  const openPlan = (plan: ImprovementPlan | null = null, issueId: number | null = null) => { setEditingPlan(plan); setPlanIssueId(issueId ?? plan?.issue_id ?? null); opened('plan') }
  const openFollowup = (planId: number, followup: PlanFollowup | null = null) => { setFollowupPlanId(planId); setEditingFollowup(followup); opened('followup') }
  const openGoal = (goal: StageGoal | null = null) => { setEditingGoal(goal); opened('goal') }
  const openEvent = (event: AnchorEvent | null = null) => { setEditingEvent(event); opened('event') }
  const removeEvent = (event: AnchorEvent) => { if (!window.confirm(`确认删除事件“${event.title}”？`)) return; Service.DeleteEvent(event.id).then(() => setRevision((value) => value + 1)).catch((reason) => setError(errorMessage(reason))) }
  const convertAnomaly = async (candidate: AnomalyCandidate) => {
		const category = candidate.id === 'avg-stay-drop' ? '留存' : candidate.id === 'revenue-drop' ? '流水' : candidate.id === 'followers-negative' ? '涨粉' : '互动'
    await Service.CreateIssue({ anchor_id: anchorId, review_id: null, title: candidate.title, category, description: '由规则提示生成，待运营补充事实背景和原因判断。', evidence: candidate.evidence, cause_hypothesis: '待运营判断；当前只表示数据变化，不代表已确认因果。', priority: '普通', status: '待处理', discovered_at: candidate.detected_at })
    setAnomalies((current) => current.filter((item) => item.id !== candidate.id))
    load()
  }

  if (loading && !detail) return <AppPage title="主播详情" description="正在读取主播档案…" actions={<AppButton appearance="subtle" onClick={onBack}>‹ 返回主播档案</AppButton>}><div className="detail-loading"><div className="loading-state">正在读取主播档案…</div></div></AppPage>
  if (!detail) return <AppPage title="主播详情" description="主播档案无法读取。" actions={<><AppButton appearance="subtle" onClick={onBack}>‹ 返回主播档案</AppButton><AppButton appearance="subtle" onClick={load}>重试</AppButton></>}><FormError message={error || '主播不存在或已归档。'} /></AppPage>

  const { anchor } = detail
  const tabs: Array<{ key: DetailTab; label: string; count?: number }> = [{ key: 'overview', label: '概览' }, { key: 'sessions', label: '直播记录', count: sessions.length }, { key: 'reviews', label: '复盘', count: reviews.length }, { key: 'issues', label: '问题', count: activeIssues.length }, { key: 'plans', label: '改进方案', count: activePlans.length }, { key: 'goals', label: '阶段目标', count: goals.length }, { key: 'timeline', label: '时间线' }]
  return <AppPage title={anchor.nickname} description={`${anchor.platform}${anchor.category ? ` · ${anchor.category}` : ''} · 最近更新 ${formatDateTime(anchor.updated_at)}`} actions={<><AppButton appearance="subtle" onClick={load}>刷新</AppButton><AppButton appearance="subtle" onClick={onBack}>‹ 返回主播档案</AppButton></>}>
    <div className="detail-header"><div className="detail-avatar">{anchor.nickname.slice(0, 1)}</div><div className="detail-meta"><div className="detail-name-row"><h1>{anchor.nickname}</h1><Badge>{anchor.stage}</Badge><Badge>{anchor.attention_level}</Badge><Badge>{anchor.status}</Badge></div><p>{anchor.name || '未填写真实姓名'} · {anchor.operator_name || '未指定运营负责人'} · UID {anchor.platform_uid || '未填写'}</p><div className="pill-list">{arrayOrEmpty(anchor.tags).map((tag) => <span className="tag-chip" key={tag}>{tag}</span>)}</div></div><div className="detail-actions"><AppButton appearance="primary" onClick={() => openSession()}>+ 新增直播</AppButton><AppButton appearance="standard" onClick={() => openReview()}>+ 新增复盘</AppButton><AppButton appearance="subtle" onClick={() => openEvent()}>记录事件</AppButton></div></div>
    <div className="detail-tabs" role="tablist">{tabs.map((item) => <button className={`tab-button${tab === item.key ? ' is-active' : ''}`} role="tab" aria-selected={tab === item.key} key={item.key} onClick={() => setTab(item.key)}>{item.label}{item.count !== undefined && <span>{item.count}</span>}</button>)}</div>
    {error && <div className="notice notice-error"><span>{error}</span><button className="notice-dismiss" onClick={() => setError('')} aria-label="关闭错误">×</button></div>}
    {tab === 'overview' && <Overview anchorId={anchorId} detail={detail} anomalies={anomalies} onConvertAnomaly={convertAnomaly} onOpenIssue={() => setTab('issues')} onOpenPlan={() => setTab('plans')} onOpenGoal={() => setTab('goals')} onOpenSession={() => openSession()} />}
    {tab === 'sessions' && <SessionsTab anchorId={anchorId} refreshToken={revision} sessions={sessions} onCreate={() => openSession()} onEdit={openSession} onCopy={openSessionCopy} onView={openSessionDetail} onCreateReview={(sessionId) => openReview(null, sessionId)} onDelete={(id) => { if (!window.confirm('确认删除这条直播记录？存在关联复盘、跟进或事件时不能删除。')) return; Service.DeleteSession(id).then(() => setRevision((value) => value + 1)).catch((reason) => setError(errorMessage(reason))) }} />}
    {tab === 'reviews' && <ReviewsTab reviews={reviews} issues={issues} onCreate={() => openReview()} onEdit={openReview} onCreateIssue={(reviewId) => openIssue(null, reviewId)} onViewIssue={openIssueDetail} />}
    {tab === 'issues' && <IssuesTab issues={issues} onCreate={() => openIssue()} onEdit={openIssue} onView={openIssueDetail} onCreatePlan={(issueId) => openPlan(null, issueId)} onChangeStatus={(id, status) => Service.ChangeIssueStatus(id, status).then(() => setRevision((value) => value + 1)).catch((reason) => setError(errorMessage(reason)))} />}
    {tab === 'plans' && <PlansTab plans={plans} issues={issues} sessions={sessions} refreshToken={revision} selectedPlanId={selectedPlanId} onSelect={setSelectedPlanId} onCreate={() => openPlan()} onEdit={openPlan} onDelete={(id) => { if (!window.confirm('确认删除这个方案？有跟进记录时删除会被拒绝。')) return; Service.DeletePlan(id).then(() => setRevision((value) => value + 1)).catch((reason) => setError(errorMessage(reason))) }} onAddFollowup={(planId) => openFollowup(planId)} onEditFollowup={(planId, followup) => openFollowup(planId, followup)} onRefresh={() => setRevision((value) => value + 1)} />}
    {tab === 'goals' && <GoalsTab goals={goals} selectedGoalId={selectedGoalId} onCreate={() => openGoal()} onEdit={openGoal} onChangeStatus={(id, status) => Service.ChangeGoalStatus(id, status).then(() => setRevision((value) => value + 1)).catch((reason) => setError(errorMessage(reason)))} />}
    {tab === 'timeline' && <section className="detail-section"><div className="section-heading"><div><h2>运营时间线</h2><p>把数据和上下文放在同一条时间线上，回看变化发生的前后。</p></div><AppButton size="compact" appearance="primary" onClick={() => openEvent()}>+ 记录事件</AppButton></div><Timeline detail={detail} onEditEvent={openEvent} onDeleteEvent={removeEvent} /></section>}
    <SessionFormDialog open={dialog === 'session'} anchorId={anchorId} initial={editingSession} copyOf={copyingSession} onClose={() => setDialog(null)} onSaved={saved} />
    <ReviewFormDialog open={dialog === 'review'} anchorId={anchorId} sessions={sessions} initial={editingReview} sessionId={reviewSessionId} onClose={() => setDialog(null)} onSaved={saved} />
    <IssueFormDialog open={dialog === 'issue'} anchorId={anchorId} reviews={reviews} initial={editingIssue} reviewId={issueReviewId} onClose={() => setDialog(null)} onSaved={saved} />
    <PlanFormDialog open={dialog === 'plan'} anchorId={anchorId} issues={issues} initial={editingPlan} issueId={planIssueId} onClose={() => setDialog(null)} onSaved={saved} />
    <FollowupFormDialog open={dialog === 'followup'} anchorId={anchorId} planId={followupPlanId ?? 0} sessions={sessions} initial={editingFollowup} onClose={() => setDialog(null)} onSaved={saved} />
    <GoalFormDialog open={dialog === 'goal'} anchorId={anchorId} initial={editingGoal} onClose={() => setDialog(null)} onSaved={saved} />
    <EventFormDialog open={dialog === 'event'} anchorId={anchorId} sessions={sessions} initial={editingEvent} onClose={() => setDialog(null)} onSaved={saved} />
    {dialog === 'session-detail' && viewingSession && <SessionDetailDialog session={viewingSession} onClose={() => setDialog(null)} onEdit={() => openSession(viewingSession)} onCreateReview={() => openReview(null, viewingSession.id)} />}
    {dialog === 'issue-detail' && viewingIssue && <IssueDetailDialog issue={viewingIssue} plans={plans} reviews={reviews} sessions={sessions} onClose={() => setDialog(null)} onEdit={() => openIssue(viewingIssue)} onCreatePlan={() => openPlan(null, viewingIssue.id)} onOpenPlan={(planId) => { setDialog(null); setTab('plans'); setSelectedPlanId(planId) }} onOpenReview={openReview} onOpenSession={openSessionDetail} />}
  </AppPage>
}

function Overview({ anchorId, detail, anomalies, onConvertAnomaly, onOpenIssue, onOpenPlan, onOpenGoal, onOpenSession }: { anchorId: number; detail: AnchorDetail; anomalies: AnomalyCandidate[]; onConvertAnomaly: (candidate: AnomalyCandidate) => Promise<void>; onOpenIssue: () => void; onOpenPlan: () => void; onOpenGoal: () => void; onOpenSession: () => void }) {
  const sessions = arrayOrEmpty(detail.sessions)
  const issues = arrayOrEmpty(detail.issues)
  const plans = arrayOrEmpty(detail.plans)
  const goals = arrayOrEmpty(detail.goals)
  const latest = sessions[0]
  const openIssues = issues.filter((issue) => issue.status !== '已解决' && issue.status !== '已关闭')
  const activePlans = plans.filter((plan) => !['已验证有效', '无效', '已终止'].includes(plan.status))
  const currentGoal = goals.find((goal) => goal.status === '进行中')
  return <div className="detail-section"><AnomalyPanel anomalies={anomalies} onConvert={onConvertAnomaly} /><div className="detail-grid"><AppCard className="summary-panel"><div className="panel-heading"><div><h2>最近直播</h2><p>{latest ? formatDate(latest.session_date) : '暂无直播记录'}</p></div><AppButton size="compact" appearance="subtle" onClick={onOpenSession}>+ 记录</AppButton></div>{latest ? <><SessionMetrics session={latest} /><div className="panel-note">{latest.is_abnormal ? `异常：${latest.abnormal_note || '请补充异常说明'}` : latest.notes || '本场暂无补充备注'}</div></> : <Empty title="还没有直播记录" description="先记下一场直播，播伴会开始计算可用指标。" action={<AppButton size="compact" appearance="primary" onClick={onOpenSession}>新增直播</AppButton>} />}</AppCard><AppCard className="summary-panel"><div className="panel-heading"><div><h2>待推进事项</h2><p>问题和方案需要下一次动作。</p></div></div><div className="summary-list"><button onClick={onOpenIssue}><strong>{openIssues.length}</strong><span>个待处理问题</span><b>›</b></button><button onClick={onOpenPlan}><strong>{activePlans.length}</strong><span>个执行中方案</span><b>›</b></button><button onClick={onOpenGoal}><strong>{currentGoal ? 1 : 0}</strong><span>个进行中目标</span><b>›</b></button></div></AppCard></div><TrendPanel anchorId={anchorId} initialTrend={arrayOrEmpty(detail.trend)} /><section className="content-section"><div className="section-heading"><div><h2>最近活动</h2><p>快速查看最近发生的直播和运营变化。</p></div></div><Timeline detail={detail} /></section></div>
}

function SessionsTab({ anchorId, refreshToken, sessions, onCreate, onEdit, onCopy, onView, onCreateReview, onDelete }: { anchorId: number; refreshToken: number; sessions: LiveSession[]; onCreate: () => void; onEdit: (session: LiveSession) => void; onCopy: (session: LiveSession) => void; onView: (session: LiveSession) => void; onCreateReview: (sessionId: number) => void; onDelete: (id: number) => void }) {
  const [items, setItems] = useState<LiveSession[]>(sessions)
  const [page, setPage] = useState({ page: 1, page_size: 20, total: 0, total_pages: 0 })
  const [pageNumber, setPageNumber] = useState(1)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    setLoading(true); setError('')
    Service.ListSessionPage({ anchor_id: anchorId, page: pageNumber, page_size: 20 }).then((result) => { if (alive) { setPage(result.page); setItems(arrayOrEmpty(result.items)) } }).catch((reason) => { if (alive) setError(errorMessage(reason)) }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [anchorId, pageNumber, refreshToken, revision])
  const remove = (id: number) => { onDelete(id); setRevision((value) => value + 1) }
  const columns = useMemo<AppDataTableColumn<LiveSession>[]>(() => [
    { accessorKey: 'session_date', header: '日期', size: 120, cell: ({ row }) => formatDate(row.original.session_date) },
    { accessorKey: 'started_at', header: '开播时间', size: 145, cell: ({ row }) => formatDateTime(row.original.started_at) },
    { accessorKey: 'duration_minutes', header: '时长', size: 95, cell: ({ row }) => `${formatMetric(row.original.duration_minutes, 0)}${row.original.duration_minutes === null ? '' : ' 分钟'}` },
    { accessorKey: 'views', header: '场观', size: 90, cell: ({ row }) => formatMetric(row.original.views, 0) },
    { accessorKey: 'avg_online', header: '平均在线', size: 105, cell: ({ row }) => formatMetric(row.original.avg_online, 0) },
    { accessorKey: 'avg_stay_seconds', header: '平均停留', size: 105, cell: ({ row }) => `${formatMetric(row.original.avg_stay_seconds, 0)}${row.original.avg_stay_seconds === null ? '' : ' 秒'}` },
    { accessorKey: 'followers_gained', header: '新增粉丝', size: 105, cell: ({ row }) => formatMetric(row.original.followers_gained, 0) },
    { accessorKey: 'revenue_cents', header: '流水', size: 105, cell: ({ row }) => formatYuan(row.original.revenue_cents) },
    {
      id: 'actions',
      header: '操作',
      size: 250,
      enableSorting: false,
      cell: ({ row }) => {
        const session = row.original
        return <div className="row-actions">{session.is_abnormal && <Badge>异常</Badge>}<AppButton size="compact" appearance="subtle" onClick={(event) => { event.stopPropagation(); onCreateReview(session.id) }}>建复盘</AppButton><AppButton size="compact" appearance="subtle" onClick={(event) => { event.stopPropagation(); onCopy(session) }}>复制</AppButton><AppButton size="compact" appearance="subtle" onClick={(event) => { event.stopPropagation(); onEdit(session) }}>编辑</AppButton><AppButton size="compact" appearance="subtle" onClick={(event) => { event.stopPropagation(); remove(session.id) }}>删除</AppButton></div>
      },
    },
  ], [onCopy, onCreateReview, onEdit, remove])

  return <section className="detail-section"><div className="section-heading"><div><h2>直播记录</h2><p>数据按场次保存，指标由原始数据计算而来；历史记录按页读取。点击行可查看完整数据。</p></div><AppButton appearance="primary" onClick={onCreate}>+ 新增直播</AppButton></div>{error && <FormError message={error} />}<AppDataView height="auto" footer={page.total > 0 ? <AppPagination total={page.total} value={{ pageIndex: Math.max(pageNumber - 1, 0), pageSize: page.page_size }} onValueChange={(value) => setPageNumber(value.pageIndex + 1)} showPageSizeSelector={false} showFirstLastButtons showSummary compact /> : undefined}><AppDataTable data={items} columns={columns} density="compact" stickyHeader pagination={false} loading={loading} emptyContent={<Empty title="还没有直播记录" description="记录第一场直播后，再回来做复盘。" action={<AppButton appearance="primary" onClick={onCreate}>新增直播</AppButton>} />} getRowId={(session) => String(session.id)} onRowClick={(row) => onView(row.original)} /></AppDataView></section>
}

function ReviewsTab({ reviews, issues, onCreate, onEdit, onCreateIssue, onViewIssue }: { reviews: OperationReview[]; issues: AnchorIssue[]; onCreate: () => void; onEdit: (review: OperationReview) => void; onCreateIssue: (reviewId: number) => void; onViewIssue: (issue: AnchorIssue) => void }) {
  return <section className="detail-section"><div className="section-heading"><div><h2>运营复盘</h2><p>先描述事实，再提炼下一次要验证的变化。</p></div><AppButton appearance="primary" onClick={onCreate}>+ 新增复盘</AppButton></div>{reviews.length === 0 ? <Empty title="还没有复盘" description="直播结束后及时记录，后续问题和方案都会有上下文。" action={<AppButton appearance="primary" onClick={onCreate}>新增复盘</AppButton>} /> : <div className="review-list">{reviews.map((review) => { const producedIssues = issues.filter((issue) => issue.review_id === review.id); return <AppCard key={review.id} className="review-row"><div className="review-row-header"><div><strong>{formatDate(review.review_date)}</strong><span>{review.live_session_id ? '已关联直播场次' : '未关联具体场次'}</span></div><div className="row-actions"><AppButton size="compact" appearance="subtle" onClick={() => onCreateIssue(review.id)}>从复盘建问题</AppButton><AppButton size="compact" appearance="subtle" onClick={() => onEdit(review)}>编辑</AppButton></div></div><h3>{review.summary || '未填写总结'}</h3><div className="review-columns"><div><span>做得好的地方</span><p>{review.strengths || '暂无记录'}</p></div><div><span>观察到的问题</span><p>{review.observations || '暂无记录'}</p></div><div><span>复盘结论</span><p>{review.conclusion || '暂无记录'}</p></div></div>{producedIssues.length > 0 && <div className="review-produced-issues"><span>已产出问题</span><div className="pill-list">{producedIssues.map((issue) => <AppButton key={issue.id} size="compact" appearance="subtle" onClick={() => onViewIssue(issue)}>{issue.title} · {issue.status}</AppButton>)}</div></div>}</AppCard> })}</div>}</section>
}

function IssuesTab({ issues, onCreate, onEdit, onView, onCreatePlan, onChangeStatus }: { issues: AnchorIssue[]; onCreate: () => void; onEdit: (issue: AnchorIssue) => void; onView: (issue: AnchorIssue) => void; onCreatePlan: (issueId: number) => void; onChangeStatus: (id: number, status: string) => void }) {
  const groups = issueStatuses.map((status) => ({ status, items: issues.filter((issue) => issue.status === status) })).filter((group) => group.items.length > 0)
  return <section className="detail-section"><div className="section-heading"><div><h2>问题清单</h2><p>每个问题都可以拥有多个独立方案，分别观察效果。</p></div><AppButton appearance="primary" onClick={onCreate}>+ 新增问题</AppButton></div>{issues.length === 0 ? <Empty title="还没有问题" description="从复盘提炼问题，或直接记录一个待验证假设。" action={<AppButton appearance="primary" onClick={onCreate}>建立问题</AppButton>} /> : <div className="issue-groups">{groups.map((group) => <section className="issue-group" key={group.status}><div className="subheading-row"><strong>{group.status}</strong><span>{group.items.length}</span></div><div className="issue-list">{group.items.map((issue) => <AppCard key={issue.id} className="issue-row"><div className="issue-row-header"><div className="issue-title"><span className="priority-mark" data-priority={issue.priority} /><div><h3>{issue.title}</h3><span>{issue.category} · 发现于 {formatDate(issue.discovered_at)} · {issue.plan_count} 个方案</span></div></div><div className="row-actions"><AppSelect options={options(issueStatuses)} value={issue.status} onValueChange={(value) => { if (value && value !== issue.status) onChangeStatus(issue.id, value) }} /><AppButton size="compact" appearance="subtle" onClick={() => onView(issue)}>详情</AppButton><AppButton size="compact" appearance="subtle" onClick={() => onEdit(issue)}>编辑</AppButton><AppButton size="compact" appearance="primary" onClick={() => onCreatePlan(issue.id)}>+ 建方案</AppButton></div></div><div className="issue-fields"><div><span>描述</span><p>{issue.description || '暂无描述'}</p></div><div><span>事实证据</span><p>{issue.evidence || '暂无证据'}</p></div><div><span>原因假设</span><p>{issue.cause_hypothesis || '暂无假设'}</p></div></div><div className="issue-footer"><Badge>{issue.priority}</Badge><Badge>{issue.status}</Badge></div></AppCard>)}</div></section>)}</div>}</section>
}

function PlansTab({ plans, issues, sessions, refreshToken, selectedPlanId, onSelect, onCreate, onEdit, onDelete, onAddFollowup, onEditFollowup, onRefresh }: { plans: ImprovementPlan[]; issues: AnchorIssue[]; sessions: LiveSession[]; refreshToken: number; selectedPlanId: number | null; onSelect: (id: number | null) => void; onCreate: () => void; onEdit: (plan: ImprovementPlan) => void; onDelete: (id: number) => void; onAddFollowup: (planId: number) => void; onEditFollowup: (planId: number, followup: PlanFollowup) => void; onRefresh: () => void }) {
  return <section className="detail-section"><div className="section-heading"><div><h2>改进方案</h2><p>方案围绕问题执行，通过跟进记录效果和下一步。</p></div><AppButton appearance="primary" onClick={onCreate} disabled={issues.length === 0}>+ 新增方案</AppButton></div>{plans.length === 0 ? <Empty title={issues.length === 0 ? '先建立问题，再建立方案' : '还没有改进方案'} description={issues.length === 0 ? '改进方案必须归属于问题，避免没有上下文的动作清单。' : '从问题卡片建立第一个方案。'} /> : <div className="plan-list">{plans.map((plan) => <div className={`plan-card${selectedPlanId === plan.id ? ' is-selected' : ''}`} key={plan.id}><div className="plan-card-header"><div><div className="row-title"><span className="plan-mark">↗</span><h3>{plan.title}</h3><Badge>{plan.priority}</Badge><Badge>{plan.status}</Badge></div><span>问题：{issues.find((issue) => issue.id === plan.issue_id)?.title || '已关联问题'} · 开始于 {formatDate(plan.start_date)} · 预计结束 {formatDate(plan.expected_end_date)}</span></div><div className="row-actions"><AppButton size="compact" appearance="subtle" onClick={() => onEdit(plan)}>编辑</AppButton><AppButton size="compact" appearance="subtle" onClick={() => onDelete(plan.id)}>删除</AppButton><AppButton size="compact" appearance={selectedPlanId === plan.id ? 'standard' : 'primary'} onClick={() => onSelect(selectedPlanId === plan.id ? null : plan.id)}>{selectedPlanId === plan.id ? '收起跟进' : '查看跟进'}</AppButton></div></div><div className="plan-detail-grid"><div><span>目标</span><p>{plan.objective || '暂无目标'}</p></div><div><span>动作</span><p className="pre-line">{plan.actions || '暂无动作'}</p></div><div><span>指标</span><p>{plan.metric_name || '暂无指标'} {plan.baseline_value === null ? '' : `${formatMetric(plan.baseline_value)} → `}{plan.target_value === null ? '' : formatMetric(plan.target_value)} {plan.metric_unit}</p></div></div>{selectedPlanId === plan.id && <PlanFollowups plan={plan} sessions={sessions} refreshToken={refreshToken} onAdd={() => onAddFollowup(plan.id)} onEdit={(followup) => onEditFollowup(plan.id, followup)} onRefresh={onRefresh} />}</div>)}</div>}</section>
}

function GoalsTab({ goals, selectedGoalId, onCreate, onEdit, onChangeStatus }: { goals: StageGoal[]; selectedGoalId: number | null; onCreate: () => void; onEdit: (goal: StageGoal) => void; onChangeStatus: (id: number, status: string) => void }) {
  return <section className="detail-section"><div className="section-heading"><div><h2>阶段目标</h2><p>目标支持多个指标，明确时间范围和验收方式。</p></div><AppButton appearance="primary" onClick={onCreate}>+ 新增目标</AppButton></div>{goals.length === 0 ? <Empty title="还没有阶段目标" description="给主播设定一个有时间边界的阶段目标，避免只看零散场次。" action={<AppButton appearance="primary" onClick={onCreate}>建立目标</AppButton>} /> : <div className="goal-list">{goals.map((goal) => <AppCard key={goal.id} className={`goal-row${selectedGoalId === goal.id ? ' is-selected' : ''}`}><div className="goal-row-header"><div><h3>{goal.title}</h3><span>{formatDate(goal.start_date)}—{formatDate(goal.end_date)}</span></div><div className="row-actions"><AppSelect options={options(goalStatuses)} value={goal.status} onValueChange={(value) => { if (value && value !== goal.status) onChangeStatus(goal.id, value) }} /><AppButton size="compact" appearance="subtle" onClick={() => onEdit(goal)}>编辑</AppButton></div></div><p>{goal.description || '暂无目标说明'}</p><div className="goal-metrics">{arrayOrEmpty(goal.metrics).length === 0 ? <span>暂无量化指标</span> : arrayOrEmpty(goal.metrics).map((metric) => <div key={metric.id}><strong>{metric.metric_name}</strong><span>{metric.baseline_value === null ? '—' : formatMetric(metric.baseline_value)} → {metric.target_value === null ? '—' : formatMetric(metric.target_value)} {metric.metric_unit}</span></div>)}</div></AppCard>)}</div>}</section>
}

function downloadBase64(base64: string, fileName: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }))
  const link = document.createElement('a')
  link.href = url; link.download = fileName; link.click(); URL.revokeObjectURL(url)
}

export function SettingsPage() {
  const [info, setInfo] = useState<{ name: string; project: string; app_id: string; version: string; description: string; data_dir: string; database_path: string; log_dir: string; backup_dir: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { Service.AppInfo().then(setInfo).catch((reason) => setError(errorMessage(reason))).finally(() => setLoading(false)) }, [])
  const openDirectory = (kind: 'data' | 'logs') => {
    setError('')
    const request = kind === 'data' ? Service.OpenDataDirectory() : Service.OpenLogDirectory()
    request.catch((reason) => setError(errorMessage(reason)))
  }
  const exportBackup = () => { setBusy(true); setError(''); setMessage(''); Service.ExportBackup().then((result) => { downloadBase64(result.archive_base64, result.file_name); setMessage(`备份已导出：${result.file_name}`) }).catch((reason) => setError(errorMessage(reason))).finally(() => setBusy(false)) }
  const importBackup = async (file: File) => {
    if (!window.confirm(`确认导入“${file.name}”？导入前会自动备份当前数据库。`)) return
    setBusy(true); setError(''); setMessage('')
    try { await Service.ImportBackup(toBase64(await file.arrayBuffer())); setMessage('备份导入成功，正在重新载入播伴…'); window.setTimeout(() => window.location.reload(), 500) } catch (reason) { setError(errorMessage(reason)) } finally { setBusy(false) }
  }
  return <AppPage title="设置" description="播伴的业务数据保存在本机用户配置目录，不依赖云端同步。">{loading ? <div className="loading-state">正在读取应用信息…</div> : !info ? <FormError message={error || '应用信息暂时不可用。'} /> : <><section className="settings-grid"><AppCard className="settings-card"><div className="section-heading"><div><h2>应用信息</h2><p>{info.description}</p></div><Badge>{info.version}</Badge></div><dl className="info-list"><div><dt>产品名称</dt><dd>{info.name}</dd></div><div><dt>项目名</dt><dd>{info.project}</dd></div><div><dt>App ID</dt><dd>{info.app_id}</dd></div></dl></AppCard><AppCard className="settings-card"><div className="section-heading"><div><h2>数据与日志</h2><p>可复制路径，便于迁移或排查问题。</p></div><div className="row-actions"><AppButton size="compact" appearance="subtle" onClick={() => openDirectory('data')}>打开数据目录</AppButton><AppButton size="compact" appearance="subtle" onClick={() => openDirectory('logs')}>打开日志目录</AppButton></div></div><dl className="info-list"><div><dt>数据目录</dt><dd><code>{info.data_dir}</code></dd></div><div><dt>数据库</dt><dd><code>{info.database_path}</code></dd></div><div><dt>日志目录</dt><dd><code>{info.log_dir}</code></dd></div><div><dt>备份目录</dt><dd><code>{info.backup_dir}</code></dd></div></dl></AppCard></section><section className="content-section backup-section"><div className="section-heading"><div><h2>备份与恢复</h2><p>备份包含数据库、配置和清单；恢复前会自动生成当前数据的安全备份。</p></div><div className="detail-actions"><AppButton appearance="primary" onClick={exportBackup} loading={busy}>导出备份 ZIP</AppButton><label className="button-like"><span>{busy ? '处理中…' : '导入备份 ZIP'}</span><input type="file" accept=".zip,application/zip" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void importBackup(file); event.currentTarget.value = '' }} /></label></div></div>{message && <div className="notice notice-success">{message}</div>}{error && <FormError message={error} />}</section><section className="content-section settings-note"><h2>数据原则</h2><p>未知指标保持为空；金额以整数分保存；删除主播采用归档方式，历史直播、复盘、问题和方案仍然保留。</p></section></>}</AppPage>
}
