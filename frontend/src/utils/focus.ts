export const focusTextControlAtEnd = (element: HTMLInputElement | HTMLTextAreaElement | null) => {
    if (!element) {
        return;
    }

    requestAnimationFrame(() => {
        if (!document.contains(element)) {
            return;
        }

        const end = element.value.length;
        element.focus({ preventScroll: true });
        element.setSelectionRange(end, end);
    });
};
