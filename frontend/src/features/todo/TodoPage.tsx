import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
    AppButton, AppCheckBox, AppContextMenu, AppDatePicker, AppDialog,
    AppEmptyState, AppIconButton, AppPage, AppSelectorBar, AppSelectorPanel,
    AppSelectorPanels, AppTextArea, AppTimeRangePicker,
    AppToolbar, AppTooltip, useAppMessageBox,
} from 'react-desktop-shell';
import type { AppContextMenuItem } from 'react-desktop-shell';
import {
    AddRegular, ArrowUpRightRegular, CalendarArrowRightRegular,
    CalendarCheckmarkRegular, CalendarClockRegular, CalendarDayRegular,
    ChevronLeftRegular, ChevronRightRegular, ClockRegular, CopyRegular,
    DeleteRegular, EditRegular, LightbulbRegular,
    ReOrderDotsVerticalRegular, WarningRegular,
} from '@fluentui/react-icons';
import dayjs, { type Dayjs } from 'dayjs';
import type { Dashboard } from '../../../bindings/github.com/hicbowen/livemate/internal/domain/models.js';
import { Service, arrayOrEmpty } from '../../api';
import { SortableList } from '../../components/SortableList';
import { Surface } from '../../components/PageLayout';
import { useTodoTaskStore } from '../../store/todoTaskStore';
import type { Task } from '../../types/todo';
import { message } from '../../services/ui/message';
import { getErrorMessage } from '../../utils/error';
import { focusTextControlAtEnd } from '../../utils/focus';
import { appDateToDayjs, appTimeRangeToDayjsRange, dayjsRangeToAppTimeRange, dayjsToAppDate } from '../../utils/desktopShellDateTime';

type TodoTab = 'today' | 'issues' | 'plans' | 'followups';
type DetailTab = 'overview' | 'sessions' | 'reviews' | 'issues' | 'plans' | 'goals' | 'timeline';
type Props = { onOpenAnchor?: (id: number, tab?: DetailTab, targetId?: number) => void };

const tabItems: Array<{ key: TodoTab; label: string }> = [
    { key: 'today', label: '今日事项' },
    { key: 'issues', label: '问题' },
    { key: 'plans', label: '改进方案' },
    { key: 'followups', label: '待跟进' },
];

export default function TodoPage({ onOpenAnchor }: Props) {
    const messageBox = useAppMessageBox();
    const editFocusRef = useRef<HTMLElement | null>(null);
    const editTextRef = useRef('');
    const timeRangeRef = useRef<[Dayjs | null, Dayjs | null]>([null, null]);
    const moveDateRef = useRef<Dayjs | null>(null);
    const copyDateRef = useRef<Dayjs | null>(null);
    const [activeTab, setActiveTab] = useState<TodoTab>('today');
    const [dashboard, setDashboard] = useState<Dashboard | null>(null);
    const [inputValue, setInputValue] = useState('');
    const [editOpen, setEditOpen] = useState(false);
    const [editText, setEditText] = useState('');
    const [editId, setEditId] = useState<string | null>(null);
    const [timeOpen, setTimeOpen] = useState(false);
    const [timeId, setTimeId] = useState<string | null>(null);
    const [startTime, setStartTime] = useState<Dayjs | null>(null);
    const [endTime, setEndTime] = useState<Dayjs | null>(null);
    const [moveOpen, setMoveOpen] = useState(false);
    const [moveId, setMoveId] = useState<string | null>(null);
    const [moveDate, setMoveDate] = useState<Dayjs | null>(null);
    const [copyOpen, setCopyOpen] = useState(false);
    const [copyId, setCopyId] = useState<string | null>(null);
    const [copyDate, setCopyDate] = useState<Dayjs | null>(null);
    const [dateOpen, setDateOpen] = useState(false);
    const store = useTodoTaskStore();
    const { tasks, date } = store;

    const isToday = dayjs(date).isSame(dayjs(), 'day');
    const completedCount = tasks.filter((task) => task.completed).length;
    const manualOpenCount = tasks.length - completedCount;
    const pendingIssues = arrayOrEmpty(dashboard?.pending_issues);
    const activePlans = arrayOrEmpty(dashboard?.active_plans);
    const stalePlans = arrayOrEmpty(dashboard?.stale_plans);
    const expiringGoals = arrayOrEmpty(dashboard?.expiring_goals);
    const systemCount = isToday ? pendingIssues.length + stalePlans.length + expiringGoals.length : 0;

    useEffect(() => {
        void store.loadTasks().catch((error) => message.error(getErrorMessage(error, '加载事项失败，请稍后重试', 'todo.load', 'TodoPage')));
        void Service.GetDashboard(3).then(setDashboard).catch((error) => message.error(getErrorMessage(error, '加载系统事项失败，请稍后重试', 'todo.system-load', 'TodoPage')));
    }, [store.loadTasks]);

    const systemItems = useMemo(() => {
        if (!isToday) return [];
        return [
            ...stalePlans.map((item) => ({ key: `followup-${item.id}`, tone: 'warning', title: `${item.anchor_nickname} · ${item.title}已 ${item.days_since_followup} 天未跟进`, meta: '改进方案', open: () => onOpenAnchor?.(item.anchor_id, 'plans', item.id) })),
            ...expiringGoals.map((item) => ({ key: `goal-${item.id}`, tone: item.days_remaining === 0 ? 'danger' : 'warning', title: `${item.anchor_nickname} · ${item.title}${item.days_remaining === 0 ? '今天到期' : `${item.days_remaining} 天后到期`}`, meta: '阶段目标', open: () => onOpenAnchor?.(item.anchor_id, 'goals', item.id) })),
            ...pendingIssues.map((item) => ({ key: `issue-${item.id}`, tone: item.priority === '紧急' ? 'danger' : 'neutral', title: `${item.anchor_nickname} · ${item.title}仍未处理`, meta: `${item.priority}问题`, open: () => onOpenAnchor?.(item.anchor_id, 'issues', item.id) })),
        ];
    }, [expiringGoals, isToday, onOpenAnchor, pendingIssues, stalePlans]);

    const addTask = async () => {
        const text = inputValue.trim();
        if (!text) return;
        try {
            await store.addTask({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text, completed: false, start_reminder_enabled: false });
            setInputValue('');
            message.success('已添加手工事项');
        } catch (error) { message.error(getErrorMessage(error, '添加事项失败，请稍后重试', 'todo.add', 'TodoPage')); }
    };

    const toggleTask = async (task: Task) => {
        try { await store.updateTask({ ...task, completed: !task.completed }); }
        catch (error) { message.error(getErrorMessage(error, '更新事项失败，请稍后重试', 'todo.toggle', 'TodoPage')); }
    };

    const openEdit = (task: Task) => {
        editTextRef.current = task.text;
        setEditText(task.text);
        setEditId(task.id);
        setEditOpen(true);
    };

    const saveEdit = async () => {
        const task = tasks.find((item) => item.id === editId);
        const text = editTextRef.current.trim();
        if (!task || !text) return;
        try { await store.updateTask({ ...task, text }); setEditOpen(false); message.success('已保存'); }
        catch (error) { message.error(getErrorMessage(error, '编辑事项失败，请稍后重试', 'todo.edit', 'TodoPage')); }
    };

    const openTime = (task: Task) => {
        if (task.time_range?.length === 2) {
            const start = dayjs(task.time_range[0], 'HH:mm');
            const end = dayjs(task.time_range[1], 'HH:mm');
            timeRangeRef.current = [start, end]; setStartTime(start); setEndTime(end);
        } else { timeRangeRef.current = [null, null]; setStartTime(null); setEndTime(null); }
        setTimeId(task.id); setTimeOpen(true);
    };

    const saveTime = async () => {
        const task = tasks.find((item) => item.id === timeId);
        if (!task) return;
        const [start, end] = timeRangeRef.current;
        try {
            await store.updateTask({ ...task, time_range: start && end ? [start.format('HH:mm'), end.format('HH:mm')] : [], start_reminder_enabled: false });
            setTimeOpen(false); message.success('时间已更新');
        } catch (error) { message.error(getErrorMessage(error, '更新时间失败，请稍后重试', 'todo.update-time', 'TodoPage')); }
    };

    const openMove = (task: Task) => { const target = date.add(1, 'day'); moveDateRef.current = target; setMoveDate(target); setMoveId(task.id); setMoveOpen(true); };
    const openCopy = (task: Task) => { const target = date.add(1, 'day'); copyDateRef.current = target; setCopyDate(target); setCopyId(task.id); setCopyOpen(true); };
    const moveTask = async () => {
        if (!moveId || !moveDateRef.current) return;
        try { await store.moveTaskToDate(moveId, moveDateRef.current); setMoveOpen(false); message.success('事项已移动'); }
        catch (error) { message.error(getErrorMessage(error, '移动事项失败，请稍后重试', 'todo.move', 'TodoPage')); }
    };
    const copyTask = async () => {
        if (!copyId || !copyDateRef.current) return;
        try { await store.copyTaskToDate(copyId, copyDateRef.current); setCopyOpen(false); message.success('事项已复制'); }
        catch (error) { message.error(getErrorMessage(error, '复制事项失败，请稍后重试', 'todo.copy', 'TodoPage')); }
    };
    const deferTasks = async () => {
        if (!manualOpenCount) return;
        const target = date.add(1, 'day');
        const confirmed = await messageBox.confirm({ title: '顺延未完成事项', message: `将 ${manualOpenCount} 项未完成的手工事项移动到 ${target.format('YYYY-MM-DD')}。`, confirmText: '顺延', cancelText: '取消' });
        if (!confirmed) return;
        try { await store.moveUncompletedTasksToDate(target); message.success(`已顺延 ${manualOpenCount} 项`); }
        catch (error) { message.error(getErrorMessage(error, '顺延事项失败，请稍后重试', 'todo.defer', 'TodoPage')); }
    };

    const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void addTask(); }
    };

    const renderTask = (task: Task, handle: any) => {
        const menu: AppContextMenuItem[] = [
            { key: 'edit', label: '编辑', icon: <EditRegular aria-hidden="true" fontSize={16} />, onClick: () => openEdit(task) },
            { key: 'time', label: '设定时间', icon: <ClockRegular aria-hidden="true" fontSize={16} />, onClick: () => openTime(task) },
            { key: 'move', label: '移动到其它日期', icon: <CalendarArrowRightRegular aria-hidden="true" fontSize={16} />, onClick: () => openMove(task) },
            { key: 'copy', label: '复制到其它日期', icon: <CopyRegular aria-hidden="true" fontSize={16} />, onClick: () => openCopy(task) },
            { key: 'delete', label: '删除', icon: <DeleteRegular aria-hidden="true" fontSize={16} />, danger: true, onClick: () => void store.removeTask(task.id) },
        ];
        return <AppContextMenu items={menu}><div className={`manual-item${task.completed ? ' is-complete' : ''}`}>
            <AppCheckBox checked={task.completed} onCheckedChange={() => void toggleTask(task)} aria-label={task.completed ? '标记为未完成' : '标记为完成'} />
            <span className={`manual-time${task.time_range?.[0] ? '' : ' is-empty'}`}>{task.time_range?.[0] || '全天'}</span>
            <span className="manual-title">{task.text}</span>
            <span className="manual-more" {...handle.attributes} {...handle.listeners} ref={handle.ref}><ReOrderDotsVerticalRegular aria-hidden="true" fontSize={17} /></span>
        </div></AppContextMenu>;
    };

    const tabCount = (key: TodoTab) => key === 'today' ? systemCount + manualOpenCount : key === 'issues' ? pendingIssues.length : key === 'plans' ? activePlans.length : stalePlans.length;
    const selectorItems = tabItems.map((tab) => ({
        key: tab.key,
        label: <>{tab.label}{tabCount(tab.key) > 0 && <span className="app-selector-count">{tabCount(tab.key)}</span>}</>,
        panelId: `todo-panel-${tab.key}`,
    }));

    return <AppPage title="运营事项" description="把系统发现的异常和自己要做的事，放在同一个处理入口。" actions={activeTab === 'today' ? <AppButton appearance="primary" icon={<AddRegular aria-hidden="true" fontSize={16} />} onClick={() => document.querySelector<HTMLTextAreaElement>('.todo-composer textarea')?.focus()}>新建手工事项</AppButton> : undefined}>
        <div className="todo-workspace">
            <AppSelectorBar ariaLabel="运营事项分类" className="todo-selector-bar" value={activeTab} size="small" onValueChange={(value) => setActiveTab(value as TodoTab)} items={selectorItems} />
            <AppSelectorPanels value={activeTab} mountStrategy="unmount" motion="directional" className="todo-selector-panels">
                <AppSelectorPanel value="today" id="todo-panel-today"><>
                    <AppToolbar className="todo-toolbar" start={<div className="todo-date-title"><strong>{isToday ? '今天' : date.locale('zh-cn').format('M 月 D 日 ddd')}</strong><span>{date.format(isToday ? 'M 月 D 日' : 'YYYY 年 M 月 D 日')}</span></div>} status={`${manualOpenCount + systemCount} 项待处理`} end={<>
                        <AppTooltip content="前一天"><span><AppIconButton aria-label="前一天" icon={<ChevronLeftRegular aria-hidden="true" fontSize={16} />} onClick={() => store.changeDate(date.subtract(1, 'day'))} /></span></AppTooltip>
                        <AppTooltip content={isToday ? '选择日期' : '回到今天'}><span><AppIconButton aria-label={isToday ? '选择日期' : '回到今天'} icon={isToday ? <CalendarDayRegular aria-hidden="true" fontSize={16} /> : <CalendarCheckmarkRegular aria-hidden="true" fontSize={16} />} onClick={() => isToday ? setDateOpen(true) : store.changeDate(dayjs())} /></span></AppTooltip>
                        <AppTooltip content="后一天"><span><AppIconButton aria-label="后一天" icon={<ChevronRightRegular aria-hidden="true" fontSize={16} />} onClick={() => store.changeDate(date.add(1, 'day'))} /></span></AppTooltip>
                        <AppTooltip content="未完成手工事项顺延到明天"><span><AppIconButton aria-label="未完成手工事项顺延到明天" disabled={!manualOpenCount} icon={<CalendarClockRegular aria-hidden="true" fontSize={16} />} onClick={() => void deferTasks()} /></span></AppTooltip>
                    </>} />

                    <TodoGroup icon={<LightbulbRegular aria-hidden="true" fontSize={16} />} kind="system" title="系统产生" description="来自问题、方案和阶段目标；处理源业务后会自动消失。" count={systemItems.length}>
                        {systemItems.length === 0 ? <AppEmptyState size="small" visual="simple" title={isToday ? '暂时没有系统事项' : '系统事项只显示在今天'} description={isToday ? '当前问题、方案和目标都在正常节奏内。' : '切回今天查看由业务状态自动产生的事项。'} /> : <div className="system-item-list">{systemItems.map((item) => <button key={item.key} className="system-item" data-tone={item.tone} onClick={item.open}><span className="system-indicator"><WarningRegular aria-hidden="true" fontSize={16} /></span><span className="system-item-copy"><strong>{item.title}</strong><small>{item.meta} · 点击查看详情</small></span><ChevronRightRegular aria-hidden="true" fontSize={16} /></button>)}</div>}
                    </TodoGroup>

                    <section className="todo-group">
                        <div className="todo-group-heading"><div><span className="todo-group-icon manual"><CalendarCheckmarkRegular aria-hidden="true" fontSize={16} /></span><div><h2>手工事项</h2><p>自己安排的联系、确认、整理和提醒。</p></div></div><span>{tasks.length}</span></div>
                        <div className="todo-composer"><AppTextArea autoResize fullWidth minRows={1} maxRows={3} resize="none" value={inputValue} onChange={(event) => setInputValue(event.target.value)} onKeyDown={onComposerKeyDown} placeholder="添加手工事项，按 Enter 保存" /><AppButton appearance="primary" disabled={!inputValue.trim()} onClick={() => void addTask()}>添加</AppButton></div>
                        <Surface className="todo-group-surface manual-surface">{tasks.length === 0 ? <AppEmptyState size="small" visual="simple" title="这一天还没有手工事项" description="从上方写下第一件要做的事。" /> : <SortableList items={tasks.map((task) => task.id)} onChange={(ids) => void store.sortedTask(ids.map((id) => tasks.find((task) => task.id === id)!))} renderItem={(id, handle) => renderTask(tasks.find((task) => task.id === id)!, handle)} />}</Surface>
                    </section>
                </></AppSelectorPanel>
                <AppSelectorPanel value="issues" id="todo-panel-issues"><BusinessList title="待处理问题" empty="当前没有待处理问题">{pendingIssues.map((item) => <button className="business-row" key={item.id} onClick={() => onOpenAnchor?.(item.anchor_id, 'issues', item.id)}><span className="business-mark" data-tone={item.priority === '紧急' ? 'danger' : item.priority === '重点' ? 'warning' : 'neutral'} /><span><strong>{item.title}</strong><small>{item.anchor_nickname} · {item.category} · {item.status}</small></span><span className="business-badge">{item.priority}</span><ChevronRightRegular aria-hidden="true" fontSize={16} /></button>)}</BusinessList></AppSelectorPanel>
                <AppSelectorPanel value="plans" id="todo-panel-plans"><BusinessList title="正在执行的方案" empty="当前没有执行中的改进方案">{activePlans.map((item) => <button className="business-row" key={item.id} onClick={() => onOpenAnchor?.(item.anchor_id, 'plans', item.id)}><span className="business-icon"><ArrowUpRightRegular aria-hidden="true" fontSize={16} /></span><span><strong>{item.title}</strong><small>{item.anchor_nickname} · 已执行 {item.days_active} 天</small></span><span className="business-badge">{item.status}</span><ChevronRightRegular aria-hidden="true" fontSize={16} /></button>)}</BusinessList></AppSelectorPanel>
                <AppSelectorPanel value="followups" id="todo-panel-followups"><BusinessList title="待跟进方案" empty="当前方案都在正常跟进">{stalePlans.map((item) => <button className="business-row" key={item.id} onClick={() => onOpenAnchor?.(item.anchor_id, 'plans', item.id)}><span className="business-icon warning"><WarningRegular aria-hidden="true" fontSize={16} /></span><span><strong>{item.title}</strong><small>{item.anchor_nickname} · 已 {item.days_since_followup} 天未跟进</small></span><span className="business-badge warning">需要跟进</span><ChevronRightRegular aria-hidden="true" fontSize={16} /></button>)}</BusinessList></AppSelectorPanel>
            </AppSelectorPanels>
        </div>

        <AppDialog title="编辑手工事项" width={440} open={editOpen} initialFocus={editFocusRef} onOpenChange={(open) => { if (!open) setEditOpen(false); }} actions={<><AppButton onClick={() => setEditOpen(false)}>取消</AppButton><AppButton appearance="primary" onClick={() => void saveEdit()}>保存</AppButton></>}><AppTextArea ref={(node: HTMLTextAreaElement | null) => { editFocusRef.current = node; focusTextControlAtEnd(node); }} autoFocus autoResize fullWidth minRows={2} maxRows={5} defaultValue={editText} onChange={(event) => { editTextRef.current = event.target.value; }} /></AppDialog>
        <AppDialog title="设置时间" width={360} open={timeOpen} onOpenChange={(open) => { if (!open) setTimeOpen(false); }}><AppTimeRangePicker defaultValue={startTime && endTime ? dayjsRangeToAppTimeRange([startTime, endTime]) : undefined} minuteStep={5} onValueChange={(value) => { const range = appTimeRangeToDayjsRange(value); timeRangeRef.current = [range?.[0] ?? null, range?.[1] ?? null]; void saveTime(); }} /></AppDialog>
        <DateDialog title="移动到其它日期" open={moveOpen} value={moveDate} current={date} onClose={() => setMoveOpen(false)} onChange={(value) => { moveDateRef.current = value; }} onConfirm={() => void moveTask()} />
        <DateDialog title="复制到其它日期" open={copyOpen} value={copyDate} current={date} onClose={() => setCopyOpen(false)} onChange={(value) => { copyDateRef.current = value; }} onConfirm={() => void copyTask()} />
        <AppDialog title="选择日期" width={360} open={dateOpen} onOpenChange={(open) => { if (!open) setDateOpen(false); }} actions={<AppButton onClick={() => setDateOpen(false)}>关闭</AppButton>}><AppDatePicker allowClear={false} value={dayjsToAppDate(date)} onValueChange={(value) => { const selected = appDateToDayjs(value); if (selected) { store.changeDate(selected); setDateOpen(false); } }} /></AppDialog>
    </AppPage>;
}

function TodoGroup({ icon, kind, title, description, count, children }: { icon: ReactNode; kind: string; title: string; description: string; count: number; children: ReactNode }) {
    return <section className="todo-group"><div className="todo-group-heading"><div><span className={`todo-group-icon ${kind}`}>{icon}</span><div><h2>{title}</h2><p>{description}</p></div></div><span>{count}</span></div><Surface className="todo-group-surface">{children}</Surface></section>;
}

function BusinessList({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
    const hasChildren = Array.isArray(children) ? children.length > 0 : !!children;
    return <section className="todo-business-view"><div className="todo-business-heading"><h2>{title}</h2><p>内容直接来自业务对象，点击后进入对应主播详情处理。</p></div><Surface className="todo-group-surface">{hasChildren ? <div className="business-list">{children}</div> : <AppEmptyState size="small" visual="simple" title={empty} description="业务状态变化后，这里会自动更新。" />}</Surface></section>;
}

function DateDialog({ title, open, value, current, onClose, onChange, onConfirm }: { title: string; open: boolean; value: Dayjs | null; current: Dayjs; onClose: () => void; onChange: (value: Dayjs | null) => void; onConfirm: () => void }) {
    return <AppDialog title={title} width={360} open={open} onOpenChange={(next) => { if (!next) onClose(); }} actions={<><AppButton onClick={onClose}>取消</AppButton><AppButton appearance="primary" onClick={onConfirm}>确定</AppButton></>}><AppDatePicker allowClear={false} defaultValue={value ? dayjsToAppDate(value) : undefined} isDateUnavailable={(dateValue) => appDateToDayjs(dateValue)!.isSame(current, 'day')} onValueChange={(dateValue) => onChange(appDateToDayjs(dateValue))} /></AppDialog>;
}
