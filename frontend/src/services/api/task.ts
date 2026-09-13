import { Service } from '../../api';
import type { Task } from '../../types/todo';

function toBackendDate(dateKey: string): string {
    if (/^\d{8}$/.test(dateKey)) {
        return `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`;
    }
    return dateKey;
}

export async function getTodayTasks(dateKey: string): Promise<Task[]> {
    return (await Service.GetTodoTasks(toBackendDate(dateKey))) ?? [];
}

export async function saveTodayTasks(dateKey: string, tasks: Task[]): Promise<void> {
    await Service.SaveTodoTasks(toBackendDate(dateKey), tasks);
}
