import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useAppToast } from 'react-desktop-shell';
import type { AppToast, AppToastId, AppToastStatus } from 'react-desktop-shell';

type MessageContent =
    | ReactNode
    | {
        content?: ReactNode;
        duration?: number;
        key?: string;
    };

let appToast: AppToast | null = null;

function isMessageConfig(input: MessageContent): input is Exclude<MessageContent, ReactNode> {
    return (
        !!input &&
        typeof input === 'object' &&
        !Array.isArray(input) &&
        'content' in input
    );
}

function normalizeMessage(input: MessageContent) {
    if (isMessageConfig(input)) {
        return {
            content: input.content ?? '',
            duration: input.duration,
            key: input.key,
        };
    }

    return {
        content: input,
        duration: undefined,
        key: undefined,
    };
}

function toDurationMs(duration?: number) {
    return duration === undefined ? undefined : duration * 1000;
}

function show(status: AppToastStatus, input: MessageContent): AppToastId {
    const { content, duration, key } = normalizeMessage(input);
    const title = content || '';
    const next = {
        title,
        status,
        duration: status === 'loading' ? 0 : toDurationMs(duration),
    };

    if (!appToast) {
        return key ?? `${status}-${Date.now()}`;
    }

    if (key) {
        appToast.show({ id: key, ...next });
        return key;
    }

    return appToast.show(next);
}

export const message = {
    success(input: MessageContent) {
        return show('success', input);
    },
    error(input: MessageContent) {
        return show('error', input);
    },
    warning(input: MessageContent) {
        return show('warning', input);
    },
    info(input: MessageContent) {
        return show('info', input);
    },
    loading(input: MessageContent) {
        return show('loading', input);
    },
};

export function AppToastBridge() {
    const toast = useAppToast();

    useEffect(() => {
        appToast = toast;
        return () => {
            if (appToast === toast) {
                appToast = null;
            }
        };
    }, [toast]);

    return null;
}
