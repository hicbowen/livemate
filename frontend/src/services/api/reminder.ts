import { Service } from '../../api';
import { getTodayTasks, saveTodayTasks } from './task';

function toBackendDate(dateKey: string): string {
    if (/^\d{8}$/.test(dateKey)) {
        return `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`;
    }
    return dateKey;
}

export async function addTodoStartReminder(
    taskId: string,
    taskText: string,
    taskDate: string,
    startTime: string,
) {
    void taskText;
    void startTime;
    const tasks = await getTodayTasks(taskDate);
    if (!tasks.some((task) => task.id === taskId)) {
        throw new Error('待办不存在');
    }
    await Service.SaveTodoTasks(
        toBackendDate(taskDate),
        tasks.map((task) => task.id === taskId ? { ...task, start_reminder_enabled: true } : task),
    );
}

export async function cancelTodoStartReminder(taskId: string, taskDate: string) {
    const tasks = await getTodayTasks(taskDate);
    if (!tasks.some((task) => task.id === taskId)) {
        throw new Error('待办不存在');
    }
    await saveTodayTasks(
        taskDate,
        tasks.map((task) => task.id === taskId ? { ...task, start_reminder_enabled: false } : task),
    );
}
