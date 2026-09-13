import { errorMessage } from '../api';

export function getErrorMessage(
    error: unknown,
    fallback = '操作失败',
    _operation = 'ui.operation.failed',
    _component = '',
): string {
    const message = errorMessage(error);
    return message === '操作失败，请稍后重试。' ? fallback : message;
}
