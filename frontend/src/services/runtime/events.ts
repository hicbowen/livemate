import { Events } from '@wailsio/runtime';

export function eventsOn<TArgs extends unknown[] = unknown[]>(
    eventName: string,
    callback: (...args: TArgs) => void,
) {
    return Events.On(eventName, (event: Events.WailsEvent) => {
        callback(...([event.data] as unknown as TArgs));
    });
}
