import { useEffect, useMemo, useState, type FocusEvent, type FormEvent, type ReactNode } from 'react'
import {
	AppButton,
	AppCard,
	AppCardFooter,
	AppCardGroup,
	AppCardHeader,
	AppDialog,
	AppEmptyState,
	AppField,
	AppPage,
	AppScrollArea,
	AppRail,
	AppSearchBox,
	AppSelect,
	AppShell,
	AppPersona,
	AppAvatar,
	AppListView,
	AppListViewItem,
	AppTag,
	AppTitleBar,
	AppStatusBadge,
	AppTextArea,
	AppTextBox,
} from 'react-desktop-shell'
import { AppDataTable, AppDataView, type AppDataTableColumn, type AppDataTableFilterDefinition } from 'react-desktop-shell/data'
import 'react-desktop-shell/style.css'
import { Window } from '@wailsio/runtime'
import type { FluentIcon } from '@fluentui/react-icons'
import {
  AddRegular,
  ArrowClockwiseRegular,
  CalendarCheckmarkRegular,
  DataUsageFilled,
  DataUsageRegular,
  DismissRegular,
  DocumentTextFilled,
  DocumentTextRegular,
  GridFilled,
  GridRegular,
  PeopleFilled,
  PeopleRegular,
  SettingsFilled,
  SettingsRegular,
  TableFilled,
  TableRegular,
  TaskListSquareLtrFilled,
  TaskListSquareLtrRegular,
  WarningRegular,
  ChevronRightRegular,
} from '@fluentui/react-icons'

import type {
  Anchor,
  AnchorFilter,
  AnchorInput,
  AnchorListItem,
  Dashboard,
  SearchResult,
} from '../bindings/github.com/hicbowen/livemate/internal/domain/models.js'
import { arrayOrEmpty, errorMessage, formatDate, formatMetric, formatYuan, optionalInteger, Service } from './api'
import { useAppStore, type AppView } from './store'
import { AnchorDetailPage, SettingsPage, type DetailTab } from './detail'
import { DailyDataPage } from './features/daily-data/DailyDataPage'
import { DataImportPage } from './features/data-import/DataImportPage'
import TodoPage from './features/todo/TodoPage'
import { AnalyticsPage } from './features/analytics/AnalyticsPage'
import { ReportsPage } from './features/reports/ReportsPage'
import { useTodoTaskStore } from './store/todoTaskStore'
import { AppToastBridge } from './services/ui/message'
import './app.css'

const stages = ['新人', '培养期', '成长期', '稳定期', '核心期', '暂停', '已离开']
const attentionLevels = ['正常', '重点关注', '紧急']
const anchorStatuses = ['正常开播', '短暂停播', '长期停播', '待开播', '已离开']

// 主播规模控制在约 20 人，主播档案页一次加载完整列表，让表格自身负责搜索、筛选和排序。
const anchorTableRequest: AnchorFilter = {
  query: '',
  stage: '',
  status: '',
  attention_level: '',
  tag: '',
  page: 1,
  page_size: 200,
  sort_by: '',
  sort_desc: false,
}

type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

function optionList(values: string[], includeEmpty = false) {
  const options = values.map((value) => ({ value, label: value }))
  return includeEmpty ? [{ value: '', label: '全部' }, ...options] : options
}

function badgeTone(value: string): BadgeTone {
  if (value === '紧急' || value === '已终止' || value === '无效' || value === '长期停播') return 'danger'
  if (value === '重点关注' || value === '重点' || value === '处理中' || value === '观察中' || value === '短暂停播') return 'warning'
  if (value === '已解决' || value === '已关闭' || value === '已验证有效' || value === '完整执行' || value === '有效' || value === '正常开播') return 'success'
  if (value === '执行中' || value === '部分执行' || value === '进行中') return 'info'
  return 'neutral'
}

function Badge({ children }: { children: string }) {
  return <AppStatusBadge status={badgeTone(children)} appearance="subtle" size="small" marker="dot">{children}</AppStatusBadge>
}

type IconName = 'dashboard' | 'daily-data' | 'anchors' | 'todo' | 'data-analysis' | 'reports' | 'settings'

const railIcons: Record<IconName, { regular: FluentIcon; filled: FluentIcon }> = {
  dashboard: { regular: GridRegular, filled: GridFilled },
  'daily-data': { regular: TableRegular, filled: TableFilled },
  anchors: { regular: PeopleRegular, filled: PeopleFilled },
  todo: { regular: TaskListSquareLtrRegular, filled: TaskListSquareLtrFilled },
  'data-analysis': { regular: DataUsageRegular, filled: DataUsageFilled },
  reports: { regular: DocumentTextRegular, filled: DocumentTextFilled },
  settings: { regular: SettingsRegular, filled: SettingsFilled },
}

function Icon({ name, active = false }: { name: IconName; active?: boolean }) {
  const IconComponent = railIcons[name][active ? 'filled' : 'regular']
  return <span className="rail-icon" aria-hidden="true"><IconComponent aria-hidden="true" fontSize={16} /></span>
}

function ErrorNotice({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return <div className="notice notice-error" role="alert"><span>{message}</span>{onDismiss && <button className="notice-dismiss" onClick={onDismiss} aria-label="关闭错误"><DismissRegular aria-hidden="true" fontSize={16} /></button>}</div>
}

function LoadingState({ label = '正在读取数据…' }: { label?: string }) {
  return <div className="loading-state"><ArrowClockwiseRegular className="loading-icon" aria-hidden="true" fontSize={16} />{label}</div>
}

function Empty({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <AppEmptyState size="small" visual="simple" title={title} description={description} action={action} />
}

function Dialog({ open, title, description, onClose, children, actions }: { open: boolean; title: string; description?: string; onClose: () => void; children: ReactNode; actions: ReactNode }) {
  return <AppDialog open={open} onOpenChange={(next) => { if (!next) onClose() }} title={title} description={description} width={640} closeOnOverlayClick={false} actions={actions}>{children}</AppDialog>
}

type DashboardAction = {
  key: string
  score: number
  kind: 'manual' | 'issue' | 'plan' | 'goal' | 'anomaly'
  label: string
  tone: 'neutral' | 'info' | 'warning' | 'danger'
  title: string
  meta: string
  open: () => void
}

function DashboardPage({ onOpenAnchor, onOpenDaily, onOpenTodo }: { onOpenAnchor: (id: number, tab?: DetailTab, targetId?: number) => void; onOpenDaily: () => void; onOpenTodo: () => void }) {
  const [data, setData] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { todayTasks, loadTodayTasks } = useTodoTaskStore()

  const load = () => {
    setLoading(true)
    setError('')
    Service.GetDashboard(3).then(setData).catch((reason) => setError(errorMessage(reason))).finally(() => setLoading(false))
  }

  useEffect(() => { load(); void loadTodayTasks().catch(() => undefined) }, [loadTodayTasks])

  if (loading && !data) return <AppPage title="运营首页" description="打开播伴，先看今天值得关注什么。"><LoadingState /></AppPage>
  if (!data) return <AppPage title="运营首页" description="打开播伴，先看今天值得关注什么。"><ErrorNotice message={error || 'Dashboard 暂时不可用。'} onDismiss={load} /></AppPage>

  const focus = arrayOrEmpty(data.focus_anchors)
  const pendingIssues = arrayOrEmpty(data.pending_issues)
  const activePlans = arrayOrEmpty(data.active_plans)
  const stalePlans = arrayOrEmpty(data.stale_plans)
  const expiringGoals = arrayOrEmpty(data.expiring_goals)
  const staleAnchors = arrayOrEmpty(data.stale_anchors)
  const openManualTasks = todayTasks.filter((task) => !task.completed)
  const priorityActions: DashboardAction[] = [
    ...staleAnchors.map((item) => ({ key: `anomaly-${item.anchor_id}`, score: 100 + item.days_since_live, kind: 'anomaly' as const, label: '异常', tone: 'danger' as const, title: `${item.nickname} · 已 ${item.days_since_live} 天未开播`, meta: `${item.stage} · 当前状态仍为${item.status}`, open: () => onOpenAnchor(item.anchor_id) })),
    ...expiringGoals.map((item) => ({ key: `goal-${item.id}`, score: 95 - item.days_remaining, kind: 'goal' as const, label: '目标', tone: item.days_remaining === 0 ? 'danger' as const : 'warning' as const, title: `${item.anchor_nickname} · ${item.title}`, meta: item.days_remaining === 0 ? '今天到期，需要确认完成情况' : `${item.days_remaining} 天后到期`, open: () => onOpenAnchor(item.anchor_id, 'goals', item.id) })),
    ...pendingIssues.map((item) => ({ key: `issue-${item.id}`, score: item.priority === '紧急' ? 92 : item.priority === '重点' ? 76 : 58, kind: 'issue' as const, label: '问题', tone: item.priority === '紧急' ? 'danger' as const : item.priority === '重点' ? 'warning' as const : 'neutral' as const, title: `${item.anchor_nickname} · ${item.title}`, meta: `${item.priority} · ${item.category} · ${item.status}`, open: () => onOpenAnchor(item.anchor_id, 'issues', item.id) })),
    ...stalePlans.map((item) => ({ key: `plan-${item.id}`, score: 80 + item.days_since_followup, kind: 'plan' as const, label: '跟进', tone: 'warning' as const, title: `${item.anchor_nickname} · ${item.title}`, meta: `已 ${item.days_since_followup} 天未跟进`, open: () => onOpenAnchor(item.anchor_id, 'plans', item.id) })),
    ...openManualTasks.map((task) => ({ key: `manual-${task.id}`, score: task.time_range?.[0] ? 70 : 38, kind: 'manual' as const, label: '手工', tone: 'info' as const, title: task.text, meta: task.time_range?.[0] ? `今天 ${task.time_range[0]}` : '今天 · 未设置时间', open: onOpenTodo })),
  ].sort((left, right) => right.score - left.score)
  const closureItems = [
    { label: '待处理问题', value: pendingIssues.length, hint: pendingIssues.some((item) => item.priority === '紧急') ? '包含紧急问题' : '尚未关闭', tone: 'danger' },
    { label: '执行中方案', value: activePlans.length, hint: '正在验证效果', tone: 'info' },
    { label: '待跟进方案', value: stalePlans.length, hint: `超过 ${data.stale_days} 天`, tone: 'warning' },
    { label: '即将到期目标', value: expiringGoals.length, hint: '未来 3 天', tone: 'warning' },
  ]

  return <AppPage title="今日工作台" description={`${data.today} · 先处理风险，再推进重点主播。`} actions={<><AppButton appearance="primary" onClick={onOpenDaily}>录入今日数据</AppButton><AppButton appearance="subtle" icon={<ArrowClockwiseRegular aria-hidden="true" fontSize={16} />} onClick={load}>刷新</AppButton></>}>
    {error && <ErrorNotice message={error} onDismiss={() => setError('')} />}

    <div className="dashboard-overview-grid" aria-label="今日概览">
      <AppCard appearance="outlined" padding="compact" className="overview-metric-card"><span>今日有直播记录</span><strong>{data.today_live_anchor_count}<small> 位</small></strong><p>{data.today_not_live_anchor_count > 0 ? `${data.today_not_live_anchor_count} 位今日暂无记录` : '今日均有直播记录'}</p></AppCard>
      <AppCard appearance="outlined" padding="compact" className="overview-metric-card"><span>累计直播</span><strong>{formatMetric(data.today_duration_minutes === null ? null : data.today_duration_minutes / 60, 1)}<small> 小时</small></strong><p>{formatMetric(data.today_duration_minutes, 0)} 分钟</p></AppCard>
      <AppCard appearance="outlined" padding="compact" className="overview-metric-card"><span>今日流水</span><strong>{formatYuan(data.today_revenue_cents)}</strong><p>已录入场次汇总</p></AppCard>
      <AppCard appearance="outlined" padding="compact" className="overview-metric-card"><span>新增粉丝</span><strong>{data.today_followers_gained === null || data.today_followers_gained === undefined ? '—' : `${data.today_followers_gained >= 0 ? '+' : ''}${formatMetric(data.today_followers_gained, 0)}`}<small> 人</small></strong><p>未知值不会计为零</p></AppCard>
    </div>

    <div className="dashboard-main-grid">
      <AppCard appearance="outlined" padding="regular" className="dashboard-panel priority-panel">
        <AppCardHeader title="优先处理" description="问题、方案、目标和异常按紧急程度合并排序。" action={<AppStatusBadge status={priorityActions.length ? 'warning' : 'success'} appearance="subtle" size="small">{priorityActions.length}</AppStatusBadge>} />
        {priorityActions.length === 0 ? <Empty title="今天暂时没有待处理事项" description="可以先查看主播数据，或安排一个手工事项。" action={<AppButton size="compact" onClick={onOpenTodo}>打开运营事项</AppButton>} /> : <AppListView ariaLabel="优先处理事项" density="compact" activationMode="invoke" onItemInvoke={(key) => priorityActions.find((item) => item.key === key)?.open()} className="priority-list">{priorityActions.slice(0, 6).map((item) => <AppListViewItem key={item.key} value={item.key} icon={<AppTag size="small" appearance="subtle" color={item.tone === 'danger' ? 'red' : item.tone === 'warning' ? 'orange' : item.tone === 'info' ? 'blue' : 'neutral'}>{item.label}</AppTag>} title={item.title} description={item.meta} trailing={<ChevronRightRegular aria-hidden="true" fontSize={15} />} />)}</AppListView>}
        {priorityActions.length > 0 && <AppCardFooter divided end={<AppButton appearance="subtle" size="compact" icon={<ChevronRightRegular aria-hidden="true" fontSize={14} />} iconPosition="end" onClick={onOpenTodo}>查看全部 {priorityActions.length} 项</AppButton>} />}
      </AppCard>

      <AppCard appearance="outlined" padding="regular" className="dashboard-panel focus-panel">
        <AppCardHeader title="重点关注主播" description="只保留需要持续盯住的人。" action={<AppStatusBadge status={focus.length ? 'info' : 'neutral'} appearance="subtle" size="small">{focus.length}</AppStatusBadge>} />
        {focus.length === 0 ? <Empty title="暂无重点关注主播" description="可以在主播档案中设置关注等级。" /> : <AppListView ariaLabel="重点关注主播" density="compact" activationMode="invoke" onItemInvoke={(value) => onOpenAnchor(Number(value))} className="dashboard-focus-list">{focus.slice(0, 5).map((item) => <AppListViewItem key={item.anchor_id} value={String(item.anchor_id)} icon={<AppAvatar initials={item.nickname.slice(0, 1)} name={item.nickname} size="small" />} title={item.nickname} description={item.attention_reason || item.recent_change_note || '需要持续关注'} trailing={<Badge>{item.attention_level}</Badge>} />)}</AppListView>}
        <AppCardFooter divided end={<AppButton appearance="subtle" size="compact" icon={<ChevronRightRegular aria-hidden="true" fontSize={14} />} iconPosition="end" onClick={() => useAppStore.getState().setView('anchors')}>查看全部主播</AppButton>} />
      </AppCard>
    </div>

    <div className="dashboard-secondary-grid">
      <AppCard appearance="outlined" padding="regular" className="dashboard-panel closure-panel">
        <AppCardHeader title="运营闭环" description="从发现问题到跟进目标，快速看哪里发生积压。" />
        <AppCardGroup orientation="horizontal" className="closure-grid">{closureItems.map((item) => <AppCard key={item.label} appearance="subtle" padding="compact" interactive onClick={onOpenTodo} data-tone={item.tone}><span>{item.label}</span><strong>{item.value}</strong><small>{item.hint}</small></AppCard>)}</AppCardGroup>
      </AppCard>

      <AppCard appearance="outlined" padding="regular" className="dashboard-panel anomaly-panel-home">
        <AppCardHeader title="异常提醒" description="优先确认长期未开播等状态异常。" action={<AppStatusBadge status={staleAnchors.length ? 'warning' : 'success'} appearance="subtle" size="small">{staleAnchors.length}</AppStatusBadge>} />
        {staleAnchors.length === 0 ? <AppEmptyState appearance="compact" layout="inline" align="start" visual="none" icon={<CalendarCheckmarkRegular aria-hidden="true" fontSize={18} />} title="暂未发现异常" description="当前主播开播状态与记录一致。" /> : <AppListView ariaLabel="异常提醒" density="compact" activationMode="invoke" onItemInvoke={(value) => onOpenAnchor(Number(value))} className="home-anomaly-list">{staleAnchors.slice(0, 4).map((item) => <AppListViewItem key={item.anchor_id} value={String(item.anchor_id)} icon={<WarningRegular aria-hidden="true" fontSize={16} />} title={`${item.nickname} · 已 ${item.days_since_live} 天未开播`} description={`${item.stage} · 上次直播 ${formatDate(item.last_session_date)}`} trailing={<ChevronRightRegular aria-hidden="true" fontSize={15} />} />)}</AppListView>}
      </AppCard>
    </div>
  </AppPage>
}

const emptyAnchor: AnchorInput = { name: '', nickname: '', platform: '抖音', platform_uid: '', account_name: '', category: '', gender: '', age: null, joined_at: null, operator_name: '', stage: '新人', attention_level: '正常', status: '正常开播', notes: '', tags: [] }

function anchorToInput(anchor: Anchor): AnchorInput {
  return { name: anchor.name, nickname: anchor.nickname, platform: anchor.platform, platform_uid: anchor.platform_uid, account_name: anchor.account_name, category: anchor.category, gender: anchor.gender, age: anchor.age, joined_at: anchor.joined_at, operator_name: anchor.operator_name, stage: anchor.stage, attention_level: anchor.attention_level, status: anchor.status, notes: anchor.notes, tags: anchor.tags ?? [] }
}

function AnchorForm({ open, anchor, onClose, onSaved }: { open: boolean; anchor: Anchor | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<AnchorInput>(anchor ? anchorToInput(anchor) : emptyAnchor)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { setForm(anchor ? anchorToInput(anchor) : emptyAnchor); setError('') }, [anchor, open])
  const update = <K extends keyof AnchorInput>(key: K, value: AnchorInput[K]) => setForm((current) => ({ ...current, [key]: value }))
  const save = (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    const request = anchor ? Service.UpdateAnchor(anchor.id, form) : Service.CreateAnchor(form)
    request.then(() => onSaved()).catch((reason) => setError(errorMessage(reason))).finally(() => setSaving(false))
  }

  return <Dialog open={open} title={anchor ? '编辑主播档案' : '新增主播'} description="先记录运营每天会用到的事实，低频资料可以稍后补充。" onClose={onClose} actions={<><AppButton appearance="subtle" onClick={onClose}>取消</AppButton><AppButton appearance="primary" type="submit" form="anchor-form" loading={saving}>{anchor ? '保存修改' : '建立档案'}</AppButton></>}>
    <form id="anchor-form" className="form-grid" onSubmit={save}>
      {error && <ErrorNotice message={error} />}
      <div className="form-span-2"><AppField label="主播昵称" required><AppTextBox value={form.nickname} onChange={(event) => update('nickname', event.currentTarget.value)} placeholder="例如：小鱼" autoFocus /></AppField></div>
      <AppField label="平台" required><AppTextBox value={form.platform} onChange={(event) => update('platform', event.currentTarget.value)} placeholder="抖音 / 快手 / 视频号" /></AppField>
      <AppField label="赛道"><AppTextBox value={form.category} onChange={(event) => update('category', event.currentTarget.value)} placeholder="聊天 / 舞蹈 / 才艺" /></AppField>
      <AppField label="阶段"><AppSelect options={optionList(stages)} value={form.stage} onValueChange={(value) => update('stage', value ?? '新人')} /></AppField>
      <AppField label="关注等级"><AppSelect options={optionList(attentionLevels)} value={form.attention_level} onValueChange={(value) => update('attention_level', value ?? '正常')} /></AppField>
      <AppField label="当前状态"><AppSelect options={optionList(anchorStatuses)} value={form.status} onValueChange={(value) => update('status', value ?? '正常开播')} /></AppField>
      <AppField label="真实姓名"><AppTextBox value={form.name} onChange={(event) => update('name', event.currentTarget.value)} /></AppField>
      <AppField label="平台 UID"><AppTextBox value={form.platform_uid} onChange={(event) => update('platform_uid', event.currentTarget.value)} /></AppField>
      <AppField label="直播账号"><AppTextBox value={form.account_name} onChange={(event) => update('account_name', event.currentTarget.value)} /></AppField>
      <AppField label="运营负责人"><AppTextBox value={form.operator_name} onChange={(event) => update('operator_name', event.currentTarget.value)} /></AppField>
      <AppField label="性别"><AppTextBox value={form.gender} onChange={(event) => update('gender', event.currentTarget.value)} /></AppField>
      <AppField label="年龄"><AppTextBox type="number" min="0" value={form.age === null ? '' : String(form.age)} onChange={(event) => update('age', optionalInteger(event.target.value))} /></AppField>
      <AppField label="签约日期"><AppTextBox type="date" value={form.joined_at ?? ''} onChange={(event) => update('joined_at', event.target.value || null)} /></AppField>
      <div className="form-span-2"><AppField label="标签" description="多个标签用逗号分隔，标签用于检索，不代表能力评级。"><AppTextBox value={(form.tags ?? []).join(', ')} onChange={(event) => update('tags', event.currentTarget.value.split(',').map((tag) => tag.trim()).filter(Boolean))} placeholder="新人, 高潜, 需关注留存" /></AppField></div>
      <div className="form-span-2"><AppField label="长期备注"><AppTextArea value={form.notes} onChange={(event) => update('notes', event.currentTarget.value)} rows={3} placeholder="记录稳定、长期有效的背景信息" /></AppField></div>
    </form>
  </Dialog>
}

function AnchorsPage({ onOpenAnchor }: { onOpenAnchor: (id: number) => void }) {
  const [items, setItems] = useState<AnchorListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Anchor | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [tagNames, setTagNames] = useState<string[]>([])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    Service.ListAnchors(anchorTableRequest).then((result) => { if (alive) setItems(arrayOrEmpty(result.items)) }).catch((reason) => { if (alive) setError(errorMessage(reason)) }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [refresh])

  useEffect(() => { Service.ListTagNames().then((names) => setTagNames(arrayOrEmpty(names))).catch(() => undefined) }, [refresh])

  const openCreate = () => { setEditing(null); setDialogOpen(true) }
  const openEdit = (item: AnchorListItem) => { Service.GetAnchor(item.id).then((anchor) => { setEditing(anchor); setDialogOpen(true) }).catch((reason) => setError(errorMessage(reason))) }
  const archive = (item: AnchorListItem) => {
    if (!window.confirm(`确认归档主播“${item.nickname}”？历史场次、复盘和方案会保留。`)) return
    Service.ArchiveAnchor(item.id).then(() => setRefresh((value) => value + 1)).catch((reason) => setError(errorMessage(reason)))
  }
  const tableFilters = useMemo<AppDataTableFilterDefinition<AnchorListItem>[]>(() => [
    { columnId: 'stage', label: '阶段', options: optionList(stages) },
    { columnId: 'attention_level', label: '关注等级', options: optionList(attentionLevels) },
    { columnId: 'status', label: '状态', options: optionList(anchorStatuses) },
    {
      // 标签不是独立展示列，挂在昵称列菜单中，避免再增加一列只为筛选。
      columnId: 'nickname',
      label: '标签',
      options: tagNames.map((value) => ({ value, label: value })),
      filterFn: (row, _columnId, filterValue) => (row.original.tags ?? []).some((tag) => tag === String(filterValue ?? '')),
    },
  ], [tagNames])
  const columns = useMemo<AppDataTableColumn<AnchorListItem>[]>(() => [
    {
      id: 'nickname',
      accessorKey: 'nickname',
      header: '昵称',
      size: 180,
      cell: ({ row }) => <AppPersona size="small" name={row.original.nickname} secondaryText={row.original.name || undefined} avatar={{ initials: row.original.nickname.slice(0, 1), size: 'small' }} />,
    },
    { accessorKey: 'platform', header: '平台', size: 90 },
    { accessorKey: 'category', header: '赛道', size: 100, cell: ({ getValue }) => (getValue() as string) || '—' },
    { id: 'stage', accessorKey: 'stage', header: '阶段', size: 100, cell: ({ getValue }) => <Badge>{String(getValue())}</Badge> },
    { id: 'attention_level', accessorKey: 'attention_level', header: '关注', size: 100, cell: ({ getValue }) => <Badge>{String(getValue())}</Badge> },
    { id: 'status', accessorKey: 'status', header: '状态', size: 110, cell: ({ getValue }) => <Badge>{String(getValue())}</Badge> },
    { accessorKey: 'last_session_date', header: '最近开播', size: 120, cell: ({ getValue }) => formatDate(getValue() as string | null) },
    { accessorKey: 'last_7_duration_minutes', header: '近 7 日时长', size: 120, cell: ({ getValue }) => `${formatMetric(getValue() as number, 0)}${(getValue() as number) ? ' 分钟' : ''}` },
    { accessorKey: 'last_7_revenue_cents', header: '近 7 日流水', size: 125, cell: ({ getValue }) => formatYuan(getValue() as number) },
    { accessorKey: 'last_7_followers_gained', header: '近 7 日涨粉', size: 115, cell: ({ getValue }) => formatMetric(getValue() as number, 0) },
    { accessorKey: 'pending_issue_count', header: '待处理', size: 85, cell: ({ getValue }) => (getValue() as number) || '—' },
    { accessorKey: 'active_plan_count', header: '方案', size: 75, cell: ({ getValue }) => (getValue() as number) || '—' },
    {
      id: 'actions',
      header: '操作',
      size: 160,
      enableSorting: false,
      cell: ({ row }) => {
        const item = row.original
        return <div className="row-actions"><AppButton size="compact" appearance="subtle" onClick={(event) => { event.stopPropagation(); openEdit(item) }}>编辑</AppButton><AppButton size="compact" appearance="subtle" onClick={(event) => { event.stopPropagation(); archive(item) }}>归档</AppButton></div>
      },
    },
  ], [archive, openEdit])

  return <AppPage title="主播档案" description="按关注优先级和最近活动管理主播，不把运营事实压缩成分数。" actions={<AppButton appearance="primary" icon={<AddRegular aria-hidden="true" fontSize={16} />} onClick={openCreate}>新增主播</AppButton>}>
    {error && <ErrorNotice message={error} onDismiss={() => setError('')} />}
    <AppDataView height="auto">
      <AppDataTable
        data={items}
        columns={columns}
        controls={{ search: true, filters: tableFilters, clearAll: true }}
        globalFilterFn={(row, _columnId, filterValue) => {
          const query = String(filterValue ?? '').trim().toLocaleLowerCase()
          if (!query) return true
          const item = row.original
          return [item.nickname, item.name, item.platform_uid, item.account_name].some((value) => String(value ?? '').toLocaleLowerCase().includes(query))
        }}
        density="compact"
        stickyHeader
        stickyColumns={['nickname']}
        pagination={false}
        loading={loading}
        emptyContent={<Empty title="还没有符合条件的主播" description={items.length > 0 ? '试试清空表格中的搜索或筛选条件。' : '先建立第一份主播档案，后续的直播记录和复盘都会在这里汇总。'} action={<AppButton appearance="primary" onClick={openCreate}>建立主播档案</AppButton>} />}
        getRowId={(item) => String(item.id)}
        onRowClick={(row) => onOpenAnchor(row.original.id)}
      />
    </AppDataView>
    <AnchorForm open={dialogOpen} anchor={editing} onClose={() => setDialogOpen(false)} onSaved={() => { setDialogOpen(false); setRefresh((value) => value + 1) }} />
  </AppPage>
}

function GlobalSearch({ onOpenAnchor }: { onOpenAnchor: (id: number, tab?: DetailTab, targetId?: number) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) { setResults([]); setLoading(false); return }
    let alive = true
    const timer = window.setTimeout(() => {
      setLoading(true)
      Service.Search(trimmed).then((items) => { if (alive) setResults(arrayOrEmpty(items)) }).catch(() => { if (alive) setResults([]) }).finally(() => { if (alive) setLoading(false) })
    }, 220)
    return () => { alive = false; window.clearTimeout(timer) }
  }, [query])
  const resultKind = (kind: string) => kind === 'anchor' ? '主播' : kind === 'issue' ? '问题' : '方案'
  const openResult = (result: SearchResult) => { onOpenAnchor(result.kind === 'anchor' ? result.id : result.anchor_id, result.kind === 'issue' ? 'issues' : result.kind === 'plan' ? 'plans' : 'overview', result.kind === 'anchor' ? undefined : result.id); setOpen(false) }
  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
  }
  return <div className="global-search-wrap" onBlur={handleBlur} onFocus={() => setOpen(true)}><AppSearchBox value={query} onValueChange={(value) => { setQuery(value); setOpen(true) }} placeholder="全局搜索主播、问题、方案…" />{open && query.trim() && <div className="global-search-results">{loading ? <div className="search-state">正在搜索…</div> : results.length === 0 ? <div className="search-state">没有找到匹配内容</div> : results.map((result) => <button key={`${result.kind}-${result.id}`} onClick={() => openResult(result)}><span className="search-kind">{resultKind(result.kind)}</span><span className="row-main"><strong>{result.title || result.anchor_nickname}</strong><small>{result.kind === 'anchor' ? result.subtitle : `${result.anchor_nickname} · ${result.subtitle}`}</small></span><span className="row-arrow"><ChevronRightRegular aria-hidden="true" fontSize={16} /></span></button>)}</div>}</div>
}

function App() {
  const view = useAppStore((state) => state.view)
  const setView = useAppStore((state) => state.setView)
  const selectedAnchorId = useAppStore((state) => state.selectedAnchorId)
  const selectAnchor = useAppStore((state) => state.selectAnchor)
  const [refresh, setRefresh] = useState(0)
  const [detailNavigation, setDetailNavigation] = useState<{ tab: DetailTab; targetId?: number }>({ tab: 'overview' })
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    let alive = true
    void Window.IsMaximised().then((value) => {
      if (alive) setMaximized(value)
    }).catch(() => undefined)
    return () => { alive = false }
  }, [])

  const openAnchor = (id: number, tab: DetailTab = 'overview', targetId?: number) => { setDetailNavigation({ tab, targetId }); selectAnchor(id); setRefresh((value) => value + 1) }
  const backToAnchors = () => { selectAnchor(null); setView('anchors') }
  const activeView: AppView = view === 'anchor-detail' || view === 'data-import' ? (view === 'data-import' ? 'daily-data' : 'anchors') : view
  const toggleMaximise = () => {
    void Window.ToggleMaximise()
      .then(() => Window.IsMaximised())
      .then(setMaximized)
      .catch(() => undefined)
  }

	return <div className="app" data-maximized={maximized ? 'true' : 'false'}>
		<AppShell
			className="livemate-shell"
			contentClassName="app-shell-content"
			title="播伴"
			contextMenu="app"
			titleBar={<AppTitleBar
				className="window-title-bar"
				center={<GlobalSearch onOpenAnchor={openAnchor} />}
				maximized={maximized}
				onMinimize={() => { void Window.Minimise() }}
				onToggleMaximize={toggleMaximise}
				onClose={() => { void Window.Close() }}
			/>}
			sidebar={{ displayMode: 'auto', collapsible: true, expandedWidth: 280 }}
			rail={<AppRail
				value={activeView}
				onValueChange={(value) => { if (value === 'dashboard' || value === 'daily-data' || value === 'anchors' || value === 'todo' || value === 'data-analysis' || value === 'reports' || value === 'settings') setView(value) }}
				items={[
					{ key: 'dashboard', label: '首页', icon: <Icon name="dashboard" active={activeView === 'dashboard'} /> },
					{ key: 'daily-data', label: '每日数据', icon: <Icon name="daily-data" active={activeView === 'daily-data'} /> },
					{ key: 'anchors', label: '主播', icon: <Icon name="anchors" active={activeView === 'anchors'} /> },
					{ key: 'todo', label: '运营事项', icon: <Icon name="todo" active={activeView === 'todo'} /> },
					{ key: 'data-analysis', label: '数据分析', icon: <Icon name="data-analysis" active={activeView === 'data-analysis'} /> },
					{ key: 'reports', label: '报告', icon: <Icon name="reports" active={activeView === 'reports'} /> },
				]}
				footerItems={[{ key: 'settings', label: '设置', icon: <Icon name="settings" active={activeView === 'settings'} /> }]}
			/>}
		>
			<AppScrollArea className="app-page-stage" orientation="vertical">
				<div className="app-content-stack">
				<AppToastBridge />
				{view === 'dashboard' && <DashboardPage onOpenAnchor={openAnchor} onOpenDaily={() => setView('daily-data')} onOpenTodo={() => setView('todo')} />}
				{view === 'todo' && <TodoPage onOpenAnchor={openAnchor} />}
				{view === 'daily-data' && <DailyDataPage onOpenAnchor={openAnchor} onOpenImport={() => setView('data-import')} />}
				{view === 'data-import' && <DataImportPage onBack={() => setView('daily-data')} />}
				{view === 'anchors' && <AnchorsPage onOpenAnchor={openAnchor} />}
				{view === 'data-analysis' && <AnalyticsPage onOpenAnchor={openAnchor} />}
				{view === 'reports' && <ReportsPage onOpenAnchor={openAnchor} />}
        {view === 'anchor-detail' && selectedAnchorId && <AnchorDetailPage anchorId={selectedAnchorId} refreshKey={refresh} initialTab={detailNavigation.tab} targetId={detailNavigation.targetId} onBack={backToAnchors} />}
				{view === 'settings' && <SettingsPage />}
				</div>
			</AppScrollArea>
		</AppShell>
	</div>
}

export default App
