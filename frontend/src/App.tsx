import { useEffect, useMemo, useRef, useState, type ComponentPropsWithoutRef, type FormEvent, type ReactNode } from 'react'
import {
	AppButton,
	AppCard,
	AppDialog,
	AppEmptyState,
	AppField,
	AppPagination,
	AppPage,
	AppRail,
	AppSearchBox,
	AppSelect,
	AppShell,
	AppPersona,
	AppTitleBar,
	AppStatusBadge,
	AppTextArea,
	AppTextBox,
} from 'react-desktop-shell'
import { AppDataTable, AppDataView, type AppDataTableColumn } from 'react-desktop-shell/data'
import 'react-desktop-shell/style.css'
import { Window } from '@wailsio/runtime'

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
import './app.css'

const stages = ['新人', '培养期', '成长期', '稳定期', '核心期', '暂停', '已离开']
const attentionLevels = ['正常', '重点关注', '紧急']
const anchorStatuses = ['正常开播', '短暂停播', '长期停播', '待开播', '已离开']

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

type IconName = 'dashboard' | 'anchors' | 'settings'

function Icon({ name }: { name: IconName }) {
	return <span className="rail-icon" aria-hidden="true">
		<svg viewBox="0 0 20 20" fill="none" focusable="false">
			{ name === 'dashboard' && <>
				<rect x="3" y="3" width="5.5" height="5.5" rx="1.1" stroke="currentColor" strokeWidth="1.5" />
				<rect x="11.5" y="3" width="5.5" height="5.5" rx="1.1" stroke="currentColor" strokeWidth="1.5" />
				<rect x="3" y="11.5" width="5.5" height="5.5" rx="1.1" stroke="currentColor" strokeWidth="1.5" />
				<rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1.1" stroke="currentColor" strokeWidth="1.5" />
			</> }
			{ name === 'anchors' && <>
				<circle cx="10" cy="7" r="2.7" stroke="currentColor" strokeWidth="1.5" />
				<path d="M4.8 16c.7-2.2 2.5-3.5 5.2-3.5s4.5 1.3 5.2 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
			</> }
			{ name === 'settings' && <>
				<circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.5" />
				<path d="M10 3.2v1.3M10 15.5v1.3M3.2 10h1.3M15.5 10h1.3M5.2 5.2l.9.9M13.9 13.9l.9.9M14.8 5.2l-.9.9M6.1 13.9l-.9.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
			</> }
		</svg>
	</span>
}

function ErrorNotice({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return <div className="notice notice-error" role="alert"><span>{message}</span>{onDismiss && <button className="notice-dismiss" onClick={onDismiss} aria-label="关闭错误">×</button>}</div>
}

function LoadingState({ label = '正在读取数据…' }: { label?: string }) {
  return <div className="loading-state"><span className="loading-dot" />{label}</div>
}

function StatBlock({ label, value, hint, accent = false }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return <div className={`stat-block${accent ? ' stat-accent' : ''}`}><span className="stat-label">{label}</span><strong>{value}</strong>{hint && <span className="stat-hint">{hint}</span>}</div>
}

function Empty({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <AppEmptyState size="small" visual="simple" title={title} description={description} action={action} />
}

function Dialog({ open, title, description, onClose, children, actions }: { open: boolean; title: string; description?: string; onClose: () => void; children: ReactNode; actions: ReactNode }) {
  return <AppDialog open={open} onOpenChange={(next) => { if (!next) onClose() }} title={title} description={description} width={640} closeOnOverlayClick={false} actions={actions}>{children}</AppDialog>
}

function DashboardPage({ onOpenAnchor }: { onOpenAnchor: (id: number, tab?: DetailTab, targetId?: number) => void }) {
  const [data, setData] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    setError('')
    Service.GetDashboard(3).then(setData).catch((reason) => setError(errorMessage(reason))).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  if (loading && !data) return <AppPage title="运营首页" description="打开播伴，先看今天值得关注什么。"><LoadingState /></AppPage>
  if (!data) return <AppPage title="运营首页" description="打开播伴，先看今天值得关注什么。"><ErrorNotice message={error || 'Dashboard 暂时不可用。'} onDismiss={load} /></AppPage>

  const focus = arrayOrEmpty(data.focus_anchors)
  const pendingIssues = arrayOrEmpty(data.pending_issues)
  const activePlans = arrayOrEmpty(data.active_plans)
  const stalePlans = arrayOrEmpty(data.stale_plans)
  const expiringGoals = arrayOrEmpty(data.expiring_goals)
  const staleAnchors = arrayOrEmpty(data.stale_anchors)

  return <AppPage title="运营首页" description={`${data.today} · 用事实记录，把今天的运营动作排出优先级。`} actions={<AppButton appearance="subtle" onClick={load}>刷新</AppButton>}>
    {error && <ErrorNotice message={error} onDismiss={() => setError('')} />}
    <section className="stat-grid" aria-label="今日概览">
      <StatBlock label="主播总数" value={String(data.anchor_count)} hint={`${data.today_not_live_anchor_count} 位今天未开播`} accent />
      <StatBlock label="今天已开播" value={String(data.today_live_anchor_count)} hint="按主播去重" />
      <StatBlock label="今日直播时长" value={`${formatMetric(data.today_duration_minutes === null ? null : data.today_duration_minutes / 60, 1)} 小时`} hint={`${formatMetric(data.today_duration_minutes, 0)} 分钟`} />
      <StatBlock label="今日流水" value={formatYuan(data.today_revenue_cents)} hint="保存为整数分" />
      <StatBlock label="今日新增粉丝" value={formatMetric(data.today_followers_gained, 0)} hint="未知值不会被当成 0" />
    </section>

    {staleAnchors.length > 0 && <section className="content-section dashboard-alert-section"><div className="section-heading"><div><h2>长期未开播</h2><p>状态仍为“正常开播”，但最近 {data.stale_days} 天没有直播记录，建议今天确认排期或调整状态。</p></div><span className="section-count warning-count">{staleAnchors.length}</span></div><div className="goal-strip">{staleAnchors.map((item) => <button className="goal-chip stale-anchor-chip" key={item.anchor_id} onClick={() => onOpenAnchor(item.anchor_id)}><strong>{item.nickname}</strong><span>{item.stage} · {item.last_session_date ? `上次直播 ${formatDate(item.last_session_date)}` : '尚未记录直播'} · 已 {item.days_since_live} 天未播</span></button>)}</div></section>}

    <div className="dashboard-columns">
      <section className="content-section">
        <div className="section-heading"><div><h2>重点关注</h2><p>紧急和重点关注主播，优先处理。</p></div><span className="section-count">{focus.length}</span></div>
        {focus.length === 0 ? <Empty title="暂无重点主播" description="可以在主播档案中设置关注等级。" action={<AppButton size="compact" onClick={() => useAppStore.getState().setView('anchors')}>查看主播</AppButton>} /> : <div className="stack-list">{focus.map((item) => <AppCard key={item.anchor_id} interactive onClick={() => onOpenAnchor(item.anchor_id)} className="focus-row"><div className="focus-avatar">{item.nickname.slice(0, 1)}</div><div className="row-main"><div className="row-title"><strong>{item.nickname}</strong><Badge>{item.attention_level}</Badge></div><span>{item.attention_reason}</span><small>最近直播：{formatDate(item.last_session_date)} · {item.recent_change_note || '暂无备注'}</small></div><span className="row-arrow">›</span></AppCard>)}</div>}
      </section>

      <section className="content-section">
        <div className="section-heading"><div><h2>待处理问题</h2><p>重点 / 紧急且尚未关闭的问题。</p></div><span className="section-count">{pendingIssues.length}</span></div>
        {pendingIssues.length === 0 ? <Empty title="问题清单已清空" description="新的问题可以从复盘或主播详情页快速建立。" /> : <div className="compact-list">{pendingIssues.map((item) => <button className="list-row" key={item.id} onClick={() => onOpenAnchor(item.anchor_id, 'issues', item.id)}><span className="priority-mark" data-priority={item.priority} /><span className="row-main"><strong>{item.title}</strong><small>{item.anchor_nickname} · {item.category} · {formatDate(item.discovered_at)}</small></span><Badge>{item.priority}</Badge></button>)}</div>}
      </section>
    </div>

    <div className="dashboard-columns">
      <section className="content-section"><div className="section-heading"><div><h2>正在执行的方案</h2><p>持续观察执行进度和目标指标。</p></div><span className="section-count">{activePlans.length}</span></div>{activePlans.length === 0 ? <Empty title="暂无执行中的方案" description="从问题详情创建第一个可执行方案。" /> : <div className="compact-list">{activePlans.map((item) => <button className="list-row" key={item.id} onClick={() => onOpenAnchor(item.anchor_id, 'plans', item.id)}><span className="plan-mark">↗</span><span className="row-main"><strong>{item.title}</strong><small>{item.anchor_nickname} · 已执行 {item.days_active} 天 · 最近跟进 {formatDate(item.last_followup_date)}</small></span><span className="metric-inline">{item.current_metric_value === null || item.current_metric_value === undefined ? '暂无指标' : `${formatMetric(item.current_metric_value)} ${item.metric_unit}`}</span></button>)}</div>}</section>
      <section className="content-section"><div className="section-heading"><div><h2>长时间未跟进</h2><p>默认超过 {data.stale_days} 天没有跟进。</p></div><span className="section-count warning-count">{stalePlans.length}</span></div>{stalePlans.length === 0 ? <Empty title="跟进节奏正常" description="当前没有超过提醒阈值的执行中方案。" /> : <div className="compact-list">{stalePlans.map((item) => <button className="list-row" key={item.id} onClick={() => onOpenAnchor(item.anchor_id, 'plans', item.id)}><span className="warning-icon">!</span><span className="row-main"><strong>{item.title}</strong><small>{item.anchor_nickname} · 已 {item.days_since_followup} 天未跟进</small></span><Badge>{item.status}</Badge></button>)}</div>}</section>
    </div>
    {expiringGoals.length > 0 && <section className="content-section"><div className="section-heading"><div><h2>阶段目标即将到期</h2><p>未来 3 天内到期的进行中目标。</p></div><span className="section-count warning-count">{expiringGoals.length}</span></div><div className="goal-strip">{expiringGoals.map((goal) => <button className="goal-chip" key={goal.id} onClick={() => onOpenAnchor(goal.anchor_id, 'goals', goal.id)}><strong>{goal.title}</strong><span>{goal.anchor_nickname} · {goal.days_remaining === 0 ? '今天到期' : `${goal.days_remaining} 天后到期`}</span></button>)}</div></section>}
  </AppPage>
}

const emptyAnchor: AnchorInput = { name: '', nickname: '', platform: '抖音', platform_uid: '', account_name: '', category: '', gender: '', age: null, joined_at: null, operator_name: '', stage: '新人', attention_level: '正常', status: '正常开播', notes: '', tags: [] }

function anchorToInput(anchor: Anchor): AnchorInput {
  return { name: anchor.name, nickname: anchor.nickname, platform: anchor.platform, platform_uid: anchor.platform_uid, account_name: anchor.account_name, category: anchor.category, gender: anchor.gender, age: anchor.age, joined_at: anchor.joined_at, operator_name: anchor.operator_name, stage: anchor.stage, attention_level: anchor.attention_level, status: anchor.status, notes: anchor.notes, tags: anchor.tags ?? [] }
}

type ImeInputProps = Omit<ComponentPropsWithoutRef<typeof AppTextBox>, 'value' | 'onChange' | 'onCompositionStart' | 'onCompositionEnd' | 'onKeyDown'> & {
  value: string
  onValueChange: (value: string) => void
  compositionRef: { current: boolean }
  submitGuardRef: { current: boolean }
  onKeyDown?: ComponentPropsWithoutRef<typeof AppTextBox>['onKeyDown']
}

function ImeTextBox({ value, onValueChange, compositionRef, submitGuardRef, onKeyDown, ...props }: ImeInputProps) {
  return <AppTextBox
    {...props}
    value={value}
    onChange={(event) => {
      if (!compositionRef.current && !(event.nativeEvent as Event & { isComposing?: boolean }).isComposing) onValueChange(event.currentTarget.value)
    }}
    onCompositionStart={() => { compositionRef.current = true }}
    onCompositionEnd={(event) => {
      compositionRef.current = false
      onValueChange(event.currentTarget.value)
    }}
    onKeyDown={(event) => {
      if (event.key === 'Enter' && (compositionRef.current || event.nativeEvent.isComposing)) {
        submitGuardRef.current = true
        window.setTimeout(() => { submitGuardRef.current = false }, 0)
      }
      onKeyDown?.(event)
    }}
  />
}

type ImeTextAreaProps = Omit<ComponentPropsWithoutRef<typeof AppTextArea>, 'value' | 'onChange' | 'onCompositionStart' | 'onCompositionEnd' | 'onKeyDown'> & {
  value: string
  onValueChange: (value: string) => void
  compositionRef: { current: boolean }
  submitGuardRef: { current: boolean }
  onKeyDown?: ComponentPropsWithoutRef<typeof AppTextArea>['onKeyDown']
}

function ImeTextArea({ value, onValueChange, compositionRef, submitGuardRef, onKeyDown, ...props }: ImeTextAreaProps) {
  return <AppTextArea
    {...props}
    value={value}
    onChange={(event) => {
      if (!compositionRef.current && !(event.nativeEvent as Event & { isComposing?: boolean }).isComposing) onValueChange(event.currentTarget.value)
    }}
    onCompositionStart={() => { compositionRef.current = true }}
    onCompositionEnd={(event) => {
      compositionRef.current = false
      onValueChange(event.currentTarget.value)
    }}
    onKeyDown={(event) => {
      if (event.key === 'Enter' && (compositionRef.current || event.nativeEvent.isComposing)) {
        submitGuardRef.current = true
        window.setTimeout(() => { submitGuardRef.current = false }, 0)
      }
      onKeyDown?.(event)
    }}
  />
}

function AnchorForm({ open, anchor, onClose, onSaved }: { open: boolean; anchor: Anchor | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<AnchorInput>(anchor ? anchorToInput(anchor) : emptyAnchor)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const compositionRef = useRef(false)
  const submitGuardRef = useRef(false)

  useEffect(() => { compositionRef.current = false; submitGuardRef.current = false; setForm(anchor ? anchorToInput(anchor) : emptyAnchor); setError('') }, [anchor, open])
  const update = <K extends keyof AnchorInput>(key: K, value: AnchorInput[K]) => setForm((current) => ({ ...current, [key]: value }))
  const save = (event: FormEvent) => {
    event.preventDefault()
    if (compositionRef.current || submitGuardRef.current) return
    setSaving(true)
    setError('')
    const request = anchor ? Service.UpdateAnchor(anchor.id, form) : Service.CreateAnchor(form)
    request.then(() => onSaved()).catch((reason) => setError(errorMessage(reason))).finally(() => setSaving(false))
  }

  return <Dialog open={open} title={anchor ? '编辑主播档案' : '新增主播'} description="先记录运营每天会用到的事实，低频资料可以稍后补充。" onClose={onClose} actions={<><AppButton appearance="subtle" onClick={onClose}>取消</AppButton><AppButton appearance="primary" type="submit" form="anchor-form" loading={saving}>{anchor ? '保存修改' : '建立档案'}</AppButton></>}>
    <form id="anchor-form" className="form-grid" onSubmit={save}>
      {error && <ErrorNotice message={error} />}
      <div className="form-span-2"><AppField label="主播昵称" required><ImeTextBox compositionRef={compositionRef} submitGuardRef={submitGuardRef} value={form.nickname} onValueChange={(value) => update('nickname', value)} placeholder="例如：小鱼" autoFocus /></AppField></div>
      <AppField label="平台" required><ImeTextBox compositionRef={compositionRef} submitGuardRef={submitGuardRef} value={form.platform} onValueChange={(value) => update('platform', value)} placeholder="抖音 / 快手 / 视频号" /></AppField>
      <AppField label="赛道"><ImeTextBox compositionRef={compositionRef} submitGuardRef={submitGuardRef} value={form.category} onValueChange={(value) => update('category', value)} placeholder="聊天 / 舞蹈 / 才艺" /></AppField>
      <AppField label="阶段"><AppSelect options={optionList(stages)} value={form.stage} onValueChange={(value) => update('stage', value ?? '新人')} /></AppField>
      <AppField label="关注等级"><AppSelect options={optionList(attentionLevels)} value={form.attention_level} onValueChange={(value) => update('attention_level', value ?? '正常')} /></AppField>
      <AppField label="当前状态"><AppSelect options={optionList(anchorStatuses)} value={form.status} onValueChange={(value) => update('status', value ?? '正常开播')} /></AppField>
      <AppField label="真实姓名"><ImeTextBox compositionRef={compositionRef} submitGuardRef={submitGuardRef} value={form.name} onValueChange={(value) => update('name', value)} /></AppField>
      <AppField label="平台 UID"><ImeTextBox compositionRef={compositionRef} submitGuardRef={submitGuardRef} value={form.platform_uid} onValueChange={(value) => update('platform_uid', value)} /></AppField>
      <AppField label="直播账号"><ImeTextBox compositionRef={compositionRef} submitGuardRef={submitGuardRef} value={form.account_name} onValueChange={(value) => update('account_name', value)} /></AppField>
      <AppField label="运营负责人"><ImeTextBox compositionRef={compositionRef} submitGuardRef={submitGuardRef} value={form.operator_name} onValueChange={(value) => update('operator_name', value)} /></AppField>
      <AppField label="性别"><ImeTextBox compositionRef={compositionRef} submitGuardRef={submitGuardRef} value={form.gender} onValueChange={(value) => update('gender', value)} /></AppField>
      <AppField label="年龄"><AppTextBox type="number" min="0" value={form.age === null ? '' : String(form.age)} onChange={(event) => update('age', optionalInteger(event.target.value))} /></AppField>
      <AppField label="签约日期"><AppTextBox type="date" value={form.joined_at ?? ''} onChange={(event) => update('joined_at', event.target.value || null)} /></AppField>
      <div className="form-span-2"><AppField label="标签" description="多个标签用逗号分隔，标签用于检索，不代表能力评级。"><ImeTextBox compositionRef={compositionRef} submitGuardRef={submitGuardRef} value={(form.tags ?? []).join(', ')} onValueChange={(value) => update('tags', value.split(',').map((tag) => tag.trim()).filter(Boolean))} placeholder="新人, 高潜, 需关注留存" /></AppField></div>
      <div className="form-span-2"><AppField label="长期备注"><ImeTextArea compositionRef={compositionRef} submitGuardRef={submitGuardRef} value={form.notes} onValueChange={(value) => update('notes', value)} rows={3} placeholder="记录稳定、长期有效的背景信息" /></AppField></div>
    </form>
  </Dialog>
}

function AnchorsPage({ onOpenAnchor }: { onOpenAnchor: (id: number) => void }) {
  const filter = useAppStore((state) => state.anchorFilter)
  const setFilter = useAppStore((state) => state.setAnchorFilter)
  const [page, setPage] = useState<{ page: AnchorFilter['page']; page_size: number; total: number; total_pages: number }>({ page: 1, page_size: 50, total: 0, total_pages: 0 })
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
    Service.ListAnchors(filter).then((result) => { if (alive) { setPage(result.page); setItems(arrayOrEmpty(result.items)) } }).catch((reason) => { if (alive) setError(errorMessage(reason)) }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [filter, refresh])

  useEffect(() => { Service.ListTagNames().then((names) => setTagNames(arrayOrEmpty(names))).catch(() => undefined) }, [refresh])

  const openCreate = () => { setEditing(null); setDialogOpen(true) }
  const openEdit = (item: AnchorListItem) => { Service.GetAnchor(item.id).then((anchor) => { setEditing(anchor); setDialogOpen(true) }).catch((reason) => setError(errorMessage(reason))) }
  const archive = (item: AnchorListItem) => {
    if (!window.confirm(`确认归档主播“${item.nickname}”？历史场次、复盘和方案会保留。`)) return
    Service.ArchiveAnchor(item.id).then(() => setRefresh((value) => value + 1)).catch((reason) => setError(errorMessage(reason)))
  }
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
    { accessorKey: 'stage', header: '阶段', size: 100, cell: ({ getValue }) => <Badge>{String(getValue())}</Badge> },
    { accessorKey: 'attention_level', header: '关注', size: 100, cell: ({ getValue }) => <Badge>{String(getValue())}</Badge> },
    { accessorKey: 'status', header: '状态', size: 110, cell: ({ getValue }) => <Badge>{String(getValue())}</Badge> },
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

  return <AppPage title="主播档案" description="按关注优先级和最近活动管理主播，不把运营事实压缩成分数。" actions={<AppButton appearance="primary" onClick={openCreate}>+ 新增主播</AppButton>}>
    <div className="toolbar-row"><AppSearchBox value={filter.query} onValueChange={(value) => setFilter({ query: value })} debounceMs={250} placeholder="搜索昵称、姓名、UID…" className="anchor-search" /><AppSelect options={optionList(stages, true)} value={filter.stage} onValueChange={(value) => setFilter({ stage: value ?? '' })} placeholder="阶段" /><AppSelect options={optionList(anchorStatuses, true)} value={filter.status} onValueChange={(value) => setFilter({ status: value ?? '' })} placeholder="状态" /><AppSelect options={optionList(attentionLevels, true)} value={filter.attention_level} onValueChange={(value) => setFilter({ attention_level: value ?? '' })} placeholder="关注等级" /><AppSelect options={optionList(tagNames, true)} value={filter.tag} onValueChange={(value) => setFilter({ tag: value ?? '' })} placeholder="标签" /><AppSelect options={[{ value: '', label: '默认优先级' }, { value: 'recent', label: '最近活动' }, { value: 'nickname', label: '昵称' }, { value: 'stage', label: '阶段' }, { value: 'status', label: '状态' }, { value: 'revenue', label: '近 7 日流水' }, { value: 'followers', label: '近 7 日涨粉' }]} value={filter.sort_by} onValueChange={(value) => setFilter({ sort_by: value ?? '', sort_desc: value ? filter.sort_desc : false })} placeholder="排序" /><AppSelect options={[{ value: 'asc', label: '升序' }, { value: 'desc', label: '降序' }]} value={filter.sort_desc ? 'desc' : 'asc'} onValueChange={(value) => setFilter({ sort_desc: value === 'desc' })} placeholder="方向" /></div>
    {error && <ErrorNotice message={error} onDismiss={() => setError('')} />}
    <AppDataView
      height="auto"
      footer={page.total_pages > 1 ? <AppPagination total={page.total} value={{ pageIndex: Math.max(page.page - 1, 0), pageSize: page.page_size }} onValueChange={(value) => setFilter({ page: value.pageIndex + 1, page_size: value.pageSize })} showPageSizeSelector={false} showFirstLastButtons showSummary compact /> : page.total > 0 ? `共 ${page.total} 位主播` : undefined}
    >
      <AppDataTable
        data={items}
        columns={columns}
        density="compact"
        stickyHeader
        pagination={false}
        loading={loading}
        emptyContent={<Empty title="还没有符合条件的主播" description={filter.query || filter.stage || filter.status || filter.attention_level || filter.tag || filter.sort_by ? '试试清空筛选条件，或建立一份新的主播档案。' : '先建立第一份主播档案，后续的直播记录和复盘都会在这里汇总。'} action={<AppButton appearance="primary" onClick={openCreate}>建立主播档案</AppButton>} />}
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
  return <div className="global-search-wrap"><AppSearchBox value={query} onValueChange={(value) => { setQuery(value); setOpen(true) }} onFocus={() => setOpen(true)} placeholder="全局搜索主播、问题、方案…" className="global-search" />{open && query.trim() && <div className="global-search-results">{loading ? <div className="search-state">正在搜索…</div> : results.length === 0 ? <div className="search-state">没有找到匹配内容</div> : results.map((result) => <button key={`${result.kind}-${result.id}`} onClick={() => openResult(result)}><span className="search-kind">{resultKind(result.kind)}</span><span className="row-main"><strong>{result.title || result.anchor_nickname}</strong><small>{result.kind === 'anchor' ? result.subtitle : `${result.anchor_nickname} · ${result.subtitle}`}</small></span><span className="row-arrow">›</span></button>)}</div>}</div>
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
  const activeView: AppView = view === 'anchor-detail' ? 'anchors' : view
  const toggleMaximise = () => {
    void Window.ToggleMaximise()
      .then(() => Window.IsMaximised())
      .then(setMaximized)
      .catch(() => undefined)
  }

	return <div className="app" data-maximized={maximized ? 'true' : 'false'}>
		<AppShell
			contentClassName="app-shell-content"
			title="播伴"
			titleBar={<AppTitleBar
				className="window-title-bar"
				maximized={maximized}
				onMinimize={() => { void Window.Minimise() }}
				onToggleMaximize={toggleMaximise}
				onClose={() => { void Window.Close() }}
			/>}
			sidebar={{ displayMode: 'auto', collapsible: true }}
			rail={<AppRail
				value={activeView}
				onValueChange={(value) => { if (value === 'dashboard' || value === 'anchors' || value === 'settings') setView(value) }}
				items={[
					{ key: 'dashboard', label: '运营首页', icon: <Icon name="dashboard" /> },
					{ key: 'anchors', label: '主播档案', icon: <Icon name="anchors" /> },
				]}
				footerItems={[{ key: 'settings', label: '设置', icon: <Icon name="settings" /> }]}
			/>}
		>
			<div className="app-content-stack">
				<GlobalSearch onOpenAnchor={openAnchor} />
				{view === 'dashboard' && <DashboardPage onOpenAnchor={openAnchor} />}
				{view === 'anchors' && <AnchorsPage onOpenAnchor={openAnchor} />}
        {view === 'anchor-detail' && selectedAnchorId && <AnchorDetailPage anchorId={selectedAnchorId} refreshKey={refresh} initialTab={detailNavigation.tab} targetId={detailNavigation.targetId} onBack={backToAnchors} />}
				{view === 'settings' && <SettingsPage />}
			</div>
		</AppShell>
	</div>
}

export default App
