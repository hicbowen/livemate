import dayjs, { type Dayjs } from 'dayjs';
import type {
    AppDateValue,
    AppTimeRangeValue,
    AppTimeValue,
} from 'react-desktop-shell';

export function dayjsToAppDate(value?: Dayjs | null): AppDateValue | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    return {
        year: value.year(),
        month: value.month() + 1,
        day: value.date(),
    };
}

export function appDateToDayjs(value: AppDateValue | null): Dayjs | null {
    if (!value) return null;
    return dayjs(
        `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`,
    );
}

export function dayjsToAppTime(value?: Dayjs | null): AppTimeValue | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    return {
        hour: value.hour(),
        minute: value.minute(),
    };
}

export function appTimeToDayjs(value: AppTimeValue | null): Dayjs | null {
    if (!value) return null;
    return dayjs().hour(value.hour).minute(value.minute).second(0);
}

export function dayjsRangeToAppTimeRange(
    value?: readonly [Dayjs | null, Dayjs | null] | null,
): AppTimeRangeValue | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || !value[0] || !value[1]) return null;
    return {
        start: dayjsToAppTime(value[0])!,
        end: dayjsToAppTime(value[1])!,
    };
}

export function appTimeRangeToDayjsRange(
    value: AppTimeRangeValue | null,
): [Dayjs, Dayjs] | null {
    if (!value) return null;
    return [
        appTimeToDayjs(value.start)!,
        appTimeToDayjs(value.end)!,
    ];
}
