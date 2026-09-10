import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  AppButton,
  AppCard,
  AppDialog,
  AppEmptyState,
  AppField,
  AppPage,
  AppRail,
  AppSearchBox,
  AppSelect,
  AppShell,
  AppStatusBadge,
  AppTextArea,
  AppTextBox,
} from 'react-desktop-shell'
import 'react-desktop-shell/style.css'

import type {
  Anchor,
  AnchorFilter,
  AnchorInput,
  AnchorListItem,
  Dashboard,
} from '../bindings/github.com/hicbowen/livemate/internal/domain/models.js'
import { arrayOrEmpty, errorMessage, formatDate, formatMetric, formatYuan, optionalInteger, Service } from './api'
import { useAppStore, type AppView } from './store'
import { AnchorDetailPage, SettingsPage } from './detail'
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

function Icon({ children }: { children: ReactNode }) {
  return <span className="rail-icon" aria-hidden="true">{children}</span>
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

function DashboardPage({ onOpenAnchor }: { onOpenAnchor: (id: number) => void }) {
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

  return <AppPage title="运营首页" description={`${data.today} · 用事实记录，把今天的运营动作排出优先级。`} actions={<AppButton appearance="subtle" onClick={load}>刷新</AppButton>}>
    {error && <ErrorNotice message={error} onDismiss={() => setError('')} />}
    <section className="stat-grid" aria-label="今日概览">
      <StatBlock label="主播总数" value={String(data.anchor_count)} hint={`${data.today_not_live_anchor_count} 位今天未开播`} accent />
      <StatBlock label="今天已开播" value={String(data.today_live_anchor_count)} hint="按主播去重" />
      <StatBlock label="今日直播时长" value={`${formatMetric(data.today_duration_minutes / 60, 1)} 小时`} hint={`${data.today_duration_minutes} 分钟`} />
      <StatBlock label="今日流水" value={formatYuan(data.today_revenue_cents)} hint="保存为整数分" />
      <StatBlock label="今日新增粉丝" value={formatMetric(data.today_followers_gained, 0)} hint="未知值不会被当成 0" />
    </section>

    <div className="dashboard-columns">
      <section className="content-section">
        <div className="section-heading"><div><h2>重点关注</h2><p>紧急和重点关注主播，优先处理。</p></div><span className="section-count">{focus.length}</span></div>
        {focus.length === 0 ? <Empty title="暂无重点主播" description="可以在主播档案中设置关注等级。" action={<AppButton size="compact" onClick={() => useAppStore.getState().setView('anchors')}>查看主播</AppButton>} /> : <div className="stack-list">{focus.map((item) => <AppCard key={item.anchor_id} interactive onClick={() => onOpenAnchor(item.anchor_id)} className="focus-row"><div className="focus-avatar">{item.nickname.slice(0, 1)}</div><div className="row-main"><div className="row-title"><strong>{item.nickname}</strong><Badge>{item.attention_level}</Badge></div><span>{item.attention_reason}</span><small>最近直播：{formatDate(item.last_session_date)} · {item.recent_change_note || '暂无备注'}</small></div><span className="row-arrow">›</span></AppCard>)}</div>}
      </section>

      <section className="content-section">
        <div className="section-heading"><div><h2>待处理问题</h2><p>重点 / 紧急且尚未关闭的问题。</p></div><span className="section-count">{pendingIssues.length}</span></div>
        {pendingIssues.length === 0 ? <Empty title="问题清单已清空" description="新的问题可以从复盘或主播详情页快速建立。" /> : <div className="compact-list">{pendingIssues.map((item) => <button className="list-row" key={item.id} onClick={() => onOpenAnchor(item.anchor_id)}><span className="priority-mark" data-priority={item.priority} /><span className="row-main"><strong>{item.title}</strong><small>{item.anchor_nickname} · {item.category} · {formatDate(item.discovered_at)}</small></span><Badge>{item.priority}</Badge></button>)}</div>}
      </section>
    </div>

    <div className="dashboard-columns">
      <section className="content-section"><div className="section-heading"><div><h2>正在执行的方案</h2><p>持续观察执行进度和目标指标。</p></div><span className="section-count">{activePlans.length}</span></div>{activePlans.length === 0 ? <Empty title="暂无执行中的方案" description="从问题详情创建第一个可执行方案。" /> : <div className="compact-list">{activePlans.map((item) => <button className="list-row" key={item.id} onClick={() => onOpenAnchor(item.anchor_id)}><span className="plan-mark">↗</span><span className="row-main"><strong>{item.title}</strong><small>{item.anchor_nickname} · 已执行 {item.days_active} 天 · 最近跟进 {formatDate(item.last_followup_date)}</small></span><span className="metric-inline">{item.current_metric_value === null || item.current_metric_value === undefined ? '暂无指标' : `${formatMetric(item.current_metric_value)} ${item.metric_unit}`}</span></button>)}</div>}</section>
      <section className="content-section"><div className="section-heading"><div><h2>长时间未跟进</h2><p>默认超过 {data.stale_days} 天没有跟进。</p></div><span className="section-count warning-count">{stalePlans.length}</span></div>{stalePlans.length === 0 ? <Empty title="跟进节奏正常" description="当前没有超过提醒阈值的执行中方案。" /> : <div className="compact-list">{stalePlans.map((item) => <button className="list-row" key={item.id} onClick={() => onOpenAnchor(item.anchor_id)}><span className="warning-icon">!</span><span className="row-main"><strong>{item.title}</strong><small>{item.anchor_nickname} · 已 {item.days_since_followup} 天未跟进</small></span><Badge>{item.status}</Badge></button>)}</div>}</section>
    </div>
    {expiringGoals.length > 0 && <section className="content-section"><div className="section-heading"><div><h2>阶段目标即将到期</h2><p>未来 3 天内到期的进行中目标。</p></div><span className="section-count warning-count">{expiringGoals.length}</span></div><div className="goal-strip">{expiringGoals.map((goal) => <button className="goal-chip" key={goal.id} onClick={() => onOpenAnchor(goal.anchor_id)}><strong>{goal.title}</strong><span>{goal.anchor_nickname} · {goal.days_remaining === 0 ? '今天到期' : `${goal.days_remaining} 天后到期`}</span></button>)}</div></section>}
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
      <div className="form-span-2"><AppField label="主播昵称" required><AppTextBox value={form.nickname} onChange={(event) => update('nickname', event.target.value)} placeholder="例如：小鱼" autoFocus /></AppField></div>
      <AppField label="平台" required><AppTextBox value={form.platform} onChange={(event) => update('platform', event.target.value)} placeholder="抖音 / 快手 / 视频号" /></AppField>
      <AppField label="赛道"><AppTextBox value={form.category} onChange={(event) => update('category', event.target.value)} placeholder="聊天 / 舞蹈 / 才艺" /></AppField>
      <AppField label="阶段"><AppSelect options={optionList(stages)} value={form.stage} onValueChange={(value) => update('stage', value ?? '新人')} /></AppField>
      <AppField label="关注等级"><AppSelect options={optionList(attentionLevels)} value={form.attention_level} onValueChange={(value) => update('attention_level', value ?? '正常')} /></AppField>
      <AppField label="当前状态"><AppSelect options={optionList(anchorStatuses)} value={form.status} onValueChange={(value) => update('status', value ?? '正常开播')} /></AppField>
      <AppField label="真实姓名"><AppTextBox value={form.name} onChange={(event) => update('name', event.target.value)} /></AppField>
      <AppField label="平台 UID"><AppTextBox value={form.platform_uid} onChange={(event) => update('platform_uid', event.target.value)} /></AppField>
      <AppField label="直播账号"><AppTextBox value={form.account_name} onChange={(event) => update('account_name', event.target.value)} /></AppField>
      <AppField label="运营负责人"><AppTextBox value={form.operator_name} onChange={(event) => update('operator_name', event.target.value)} /></AppField>
      <AppField label="性别"><AppTextBox value={form.gender} onChange={(event) => update('gender', event.target.value)} /></AppField>
      <AppField label="年龄"><AppTextBox type="number" min="0" value={form.age === null ? '' : String(form.age)} onChange={(event) => update('age', optionalInteger(event.target.value))} /></AppField>
      <AppField label="签约日期"><AppTextBox type="date" value={form.joined_at ?? ''} onChange={(event) => update('joined_at', event.target.value || null)} /></AppField>
      <div className="form-span-2"><AppField label="标签" description="多个标签用逗号分隔，标签用于检索，不代表能力评级。"><AppTextBox value={(form.tags ?? []).join(', ')} onChange={(event) => update('tags', event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean))} placeholder="新人, 高潜, 需关注留存" /></AppField></div>
      <div className="form-span-2"><AppField label="长期备注"><AppTextArea value={form.notes} onChange={(event) => update('notes', event.target.value)} rows={3} placeholder="记录稳定、长期有效的背景信息" /></AppField></div>
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

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    Service.ListAnchors(filter).then((result) => { if (alive) { setPage(result.page); setItems(arrayOrEmpty(result.items)) } }).catch((reason) => { if (alive) setError(errorMessage(reason)) }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [filter, refresh])

  const openCreate = () => { setEditing(null); setDialogOpen(true) }
  const openEdit = (item: AnchorListItem) => { Service.GetAnchor(item.id).then((anchor) => { setEditing(anchor); setDialogOpen(true) }).catch((reason) => setError(errorMessage(reason))) }
  const archive = (item: AnchorListItem) => {
    if (!window.confirm(`确认归档主播“${item.nickname}”？历史场次、复盘和方案会保留。`)) return
    Service.ArchiveAnchor(item.id).then(() => setRefresh((value) => value + 1)).catch((reason) => setError(errorMessage(reason)))
  }
  const columns = useMemo(() => ['昵称', '平台', '赛道', '阶段', '关注', '状态', '最近开播', '近 7 日流水', '待处理', '方案'], [])

  return <AppPage title="主播档案" description="按关注优先级和最近活动管理主播，不把运营事实压缩成分数。" actions={<AppButton appearance="primary" onClick={openCreate}>+ 新增主播</AppButton>}>
    <div className="toolbar-row"><AppSearchBox value={filter.query} onValueChange={(value) => setFilter({ query: value })} debounceMs={250} placeholder="搜索昵称、姓名、UID…" className="anchor-search" /><AppSelect options={optionList(stages, true)} value={filter.stage} onValueChange={(value) => setFilter({ stage: value ?? '' })} placeholder="阶段" /><AppSelect options={optionList(anchorStatuses, true)} value={filter.status} onValueChange={(value) => setFilter({ status: value ?? '' })} placeholder="状态" /><AppSelect options={optionList(attentionLevels, true)} value={filter.attention_level} onValueChange={(value) => setFilter({ attention_level: value ?? '' })} placeholder="关注等级" /></div>
    {error && <ErrorNotice message={error} onDismiss={() => setError('')} />}
    {loading ? <LoadingState /> : items.length === 0 ? <Empty title="还没有符合条件的主播" description={filter.query || filter.stage || filter.status || filter.attention_level ? '试试清空筛选条件，或建立一份新的主播档案。' : '先建立第一份主播档案，后续的直播记录和复盘都会在这里汇总。'} action={<AppButton appearance="primary" onClick={openCreate}>建立主播档案</AppButton>} /> : <div className="table-shell"><table className="data-table"><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}<th aria-label="操作" /></tr></thead><tbody>{items.map((item) => <tr key={item.id} onDoubleClick={() => openEdit(item)} onClick={() => onOpenAnchor(item.id)}><td><div className="table-person"><span className="avatar-small">{item.nickname.slice(0, 1)}</span><span><strong>{item.nickname}</strong>{item.name && <small>{item.name}</small>}</span></div></td><td>{item.platform}</td><td>{item.category || '—'}</td><td><Badge>{item.stage}</Badge></td><td><Badge>{item.attention_level}</Badge></td><td><Badge>{item.status}</Badge></td><td>{formatDate(item.last_session_date)}</td><td>{formatYuan(item.last_7_revenue_cents)}</td><td>{item.pending_issue_count || '—'}</td><td>{item.active_plan_count || '—'}</td><td><div className="row-actions"><AppButton size="compact" appearance="subtle" onClick={(event) => { event.stopPropagation(); openEdit(item) }}>编辑</AppButton><AppButton size="compact" appearance="subtle" onClick={(event) => { event.stopPropagation(); archive(item) }}>归档</AppButton></div></td></tr>)}</tbody></table></div>}
    {page.total_pages > 1 && <div className="pagination-row"><span>共 {page.total} 位主播</span><div><AppButton size="compact" appearance="subtle" disabled={page.page <= 1} onClick={() => setFilter({ page: page.page - 1 })}>上一页</AppButton><span className="page-number">{page.page} / {page.total_pages}</span><AppButton size="compact" appearance="subtle" disabled={page.page >= page.total_pages} onClick={() => setFilter({ page: page.page + 1 })}>下一页</AppButton></div></div>}
    <AnchorForm open={dialogOpen} anchor={editing} onClose={() => setDialogOpen(false)} onSaved={() => { setDialogOpen(false); setRefresh((value) => value + 1) }} />
  </AppPage>
}

function App() {
  const view = useAppStore((state) => state.view)
  const setView = useAppStore((state) => state.setView)
  const selectedAnchorId = useAppStore((state) => state.selectedAnchorId)
  const selectAnchor = useAppStore((state) => state.selectAnchor)
  const [refresh, setRefresh] = useState(0)

  const openAnchor = (id: number) => { selectAnchor(id); setRefresh((value) => value + 1) }
  const backToAnchors = () => { selectAnchor(null); setView('anchors') }
  const activeView: AppView = view === 'anchor-detail' ? 'anchors' : view

  return <AppShell theme="system" themePreset="teal" title="播伴" icon={<span className="app-logo">伴</span>} sidebar={{ displayMode: 'auto', collapsible: true }} sidebarHeader={<div className="sidebar-brand"><span className="app-logo">伴</span><span><strong>播伴</strong><small>主播运营管理</small></span></div>} rail={<AppRail value={activeView} onValueChange={(value) => { if (value === 'dashboard' || value === 'anchors' || value === 'settings') setView(value) }} items={[{ key: 'dashboard', label: '运营首页', icon: <Icon>⌂</Icon> }, { key: 'anchors', label: '主播档案', icon: <Icon>◎</Icon> }, { type: 'group', label: '工作闭环' }, { key: 'reviews', label: '复盘与问题', icon: <Icon>≡</Icon>, disabled: true }, { key: 'plans', label: '改进方案', icon: <Icon>↗</Icon>, disabled: true }]} footerItems={[{ key: 'settings', label: '设置', icon: <Icon>⚙</Icon> }]} />}>{view === 'dashboard' && <DashboardPage onOpenAnchor={openAnchor} />}{view === 'anchors' && <AnchorsPage onOpenAnchor={openAnchor} />}{view === 'anchor-detail' && selectedAnchorId && <AnchorDetailPage anchorId={selectedAnchorId} refreshKey={refresh} onBack={backToAnchors} />}{view === 'settings' && <SettingsPage />}</AppShell>
}

export default App
