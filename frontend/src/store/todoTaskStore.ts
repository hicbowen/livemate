import { create } from 'zustand';
import { getTodayTasks, saveTodayTasks } from '../services/api/task';
import dayjs from 'dayjs';
import type { Task } from '../types/todo';
import { getErrorMessage } from '../utils/error';

interface TodoTaskState {
    tasks: Task[];
    todayTasks: Task[];
    date: dayjs.Dayjs;
    saveError?: string;
    loadTasks: (date?: dayjs.Dayjs) => Promise<void>;
    loadTodayTasks: () => Promise<void>;
    addTask: (task: Task) => Promise<void>;
    addTodayTask: (task: Task) => Promise<void>;
    removeTask: (id: string) => Promise<void>;
    updateTask: (task: Task) => Promise<void>;
    sortedTask: (tasks: Task[]) => Promise<void>;
    saveTasks: (dateKey?: string, tasksSnapshot?: Task[]) => Promise<void>;
    moveTaskToDate: (id: string, targetDate: dayjs.Dayjs) => Promise<void>;
    copyTaskToDate: (id: string, targetDate: dayjs.Dayjs) => Promise<void>;
    moveUncompletedTasksToDate: (targetDate: dayjs.Dayjs) => Promise<number>;
    changeDate: (date: dayjs.Dayjs) => void;
}

function createTaskId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

let saveQueue = Promise.resolve();

const todayKey = () => dayjs().format('YYYYMMDD');

const enqueueSaveTasks = (dateKey: string, tasksSnapshot: Task[]) => {
    const saveSnapshot = () => saveTodayTasks(dateKey, tasksSnapshot);
    saveQueue = saveQueue.then(saveSnapshot, saveSnapshot);
    return saveQueue;
};

export const useTodoTaskStore = create<TodoTaskState>((set, get) => ({
    tasks: [],
    todayTasks: [],
    date: dayjs(),
    saveError: undefined,
    loadTasks: async (date) => {
        const targetDate = date ?? get().date;
        const dateKey = targetDate.format('YYYYMMDD');
        const tasks = await getTodayTasks(dateKey);
        const currentDateKey = get().date.format('YYYYMMDD');

        if (currentDateKey !== dateKey) {
            return;
        }

        set((state) => ({
            tasks,
            todayTasks: dateKey === todayKey() ? tasks : state.todayTasks,
        }));
    },
    loadTodayTasks: async () => {
        const dateKey = todayKey();
        const tasks = await getTodayTasks(dateKey);
        set((state) => ({
            todayTasks: tasks,
            tasks: state.date.format('YYYYMMDD') === dateKey ? tasks : state.tasks,
        }));
    },
    addTask: async (task: Task) => {
        const dateKey = get().date.format('YYYYMMDD');
        const nextTasks = [...get().tasks, task];
        await get().saveTasks(dateKey, nextTasks);
        set((state) => ({
            tasks: nextTasks,
            todayTasks: dateKey === todayKey() ? nextTasks : state.todayTasks,
        }));
    },
    addTodayTask: async (task: Task) => {
        const dateKey = todayKey();
        let todayTasks: Task[];
        if (get().date.format('YYYYMMDD') === dateKey) {
            todayTasks = get().tasks;
        } else {
            todayTasks = await getTodayTasks(dateKey);
        }

        const nextTodayTasks = [...todayTasks, task];
        await get().saveTasks(dateKey, nextTodayTasks);
        set((state) => ({
            todayTasks: nextTodayTasks,
            tasks: state.date.format('YYYYMMDD') === dateKey ? nextTodayTasks : state.tasks,
        }));
    },
    removeTask: async (id: string) => {
        const dateKey = get().date.format('YYYYMMDD');
        const nextTasks = get().tasks.filter((task) => task.id !== id);
        await get().saveTasks(dateKey, nextTasks);
        set((state) => ({
            tasks: nextTasks,
            todayTasks: dateKey === todayKey() ? nextTasks : state.todayTasks,
        }));
    },
    async updateTask(task: Task) {
        const dateKey = get().date.format('YYYYMMDD');
        const nextTasks = get().tasks.map((t) => (t.id === task.id ? task : t));
        await get().saveTasks(dateKey, nextTasks);
        set((state) => ({
            tasks: nextTasks,
            todayTasks: dateKey === todayKey() ? nextTasks : state.todayTasks,
        }));
    },
    async sortedTask(tasks: Task[]) {
        const dateKey = get().date.format('YYYYMMDD');
        const previousTasks = get().tasks;
        const previousTodayTasks = get().todayTasks;

        // Update the visible order before waiting for the Wails/SQLite save.
        // Keep the array reference so a failed older save cannot roll back a
        // newer reorder that the user has already made.
        set((state) => ({
            tasks,
            todayTasks: dateKey === todayKey() ? tasks : state.todayTasks,
        }));

        try {
            await get().saveTasks(dateKey, tasks);
        } catch (error) {
            set((state) => {
                if (state.tasks !== tasks) {
                    return state;
                }
                return {
                    tasks: previousTasks,
                    todayTasks: dateKey === todayKey() ? previousTodayTasks : state.todayTasks,
                };
            });
            throw error;
        }
    },
    saveTasks: async (dateKey = get().date.format('YYYYMMDD'), tasksSnapshot = get().tasks) => {
        try {
            await enqueueSaveTasks(dateKey, tasksSnapshot);
            set({ saveError: undefined });
        } catch (error) {
            set({ saveError: getErrorMessage(error, '事项保存失败，请稍后重试', 'todo.save', 'TodoTaskStore') });
            throw error;
        }
    },
    moveTaskToDate: async (id: string, targetDate: dayjs.Dayjs) => {
        const sourceDate = get().date.format('YYYYMMDD');
        const targetDateKey = targetDate.format('YYYYMMDD');

        if (sourceDate === targetDateKey) {
            return;
        }

        const sourceTasks = get().tasks;
        const movingTask = sourceTasks.find((task) => task.id === id);

        if (!movingTask) {
            return;
        }

        const nextSourceTasks = sourceTasks.filter((task) => task.id !== id);

        set((state) => ({
            tasks: nextSourceTasks,
            todayTasks: sourceDate === todayKey() ? nextSourceTasks : state.todayTasks,
        }));

        try {
            await get().saveTasks(sourceDate, nextSourceTasks);

            const targetTasks = await getTodayTasks(targetDateKey);
            await get().saveTasks(targetDateKey, [...targetTasks, movingTask]);
            if (targetDateKey === todayKey()) {
                await get().loadTodayTasks();
            }
        } catch (error) {
            set((state) => ({
                tasks: sourceTasks,
                todayTasks: sourceDate === todayKey() ? sourceTasks : state.todayTasks,
            }));
            await get().saveTasks(sourceDate, sourceTasks);
            throw error;
        }
    },
    copyTaskToDate: async (id: string, targetDate: dayjs.Dayjs) => {
        const sourceDate = get().date.format('YYYYMMDD');
        const targetDateKey = targetDate.format('YYYYMMDD');

        if (sourceDate === targetDateKey) {
            return;
        }

        const task = get().tasks.find((task) => task.id === id);

        if (!task) {
            return;
        }

        const copiedTask: Task = {
            ...task,
            id: createTaskId(),
            time_range: task.time_range ? [...task.time_range] : undefined,
            start_reminder_enabled: false,
        };

        const targetTasks = await getTodayTasks(targetDateKey);
        await get().saveTasks(targetDateKey, [...targetTasks, copiedTask]);
        if (targetDateKey === todayKey()) {
            await get().loadTodayTasks();
        }
    },
    moveUncompletedTasksToDate: async (targetDate: dayjs.Dayjs) => {
        const sourceDate = get().date.format('YYYYMMDD');
        const targetDateKey = targetDate.format('YYYYMMDD');

        if (sourceDate === targetDateKey) {
            return 0;
        }

        const sourceTasks = get().tasks;
        const movingTasks = sourceTasks.filter((task) => !task.completed);

        if (!movingTasks.length) {
            return 0;
        }

        const nextSourceTasks = sourceTasks.filter((task) => task.completed);

        set((state) => ({
            tasks: nextSourceTasks,
            todayTasks: sourceDate === todayKey() ? nextSourceTasks : state.todayTasks,
        }));

        try {
            await get().saveTasks(sourceDate, nextSourceTasks);

            const targetTasks = await getTodayTasks(targetDateKey);
            await get().saveTasks(targetDateKey, [...targetTasks, ...movingTasks]);
            if (targetDateKey === todayKey()) {
                await get().loadTodayTasks();
            }
            return movingTasks.length;
        } catch (error) {
            set((state) => ({
                tasks: sourceTasks,
                todayTasks: sourceDate === todayKey() ? sourceTasks : state.todayTasks,
            }));
            await get().saveTasks(sourceDate, sourceTasks);
            throw error;
        }
    },
    changeDate(date: dayjs.Dayjs) {
        set({ date });
        void get().loadTasks(date).catch((error) => {
            getErrorMessage(error, '加载事项失败，请稍后重试', 'todo.change-date-load', 'TodoTaskStore');
        });
    },
}));
