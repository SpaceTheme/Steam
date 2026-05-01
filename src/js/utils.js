export const waitForElement = (selector, parent = document) => new Promise((resolve) => {
    const el = parent.querySelector(selector);
    if (el) {
        resolve(el);
    }

    const observer = new MutationObserver(() => {
        const el = parent.querySelector(selector);
        if (!el) {
            return;
        }

        resolve(el);
        observer.disconnect();
    });

    observer.observe(document.body, {
        subtree: true,
        childList: true,
    });
});

export const createContainerTracker = (selector, { onCleanup, onSetup, onUpdate } = {}) => {
    let container = null;

    const rebind = () => {
        const nextContainer = document.querySelector(selector);

        if (nextContainer === container) {
            return;
        }

        container = nextContainer;

        if (!container) {
            onCleanup?.();
            return;
        }

        onSetup?.();
        onUpdate?.();
    };

    return {
        rebind,
        getContainer: () => container,
        setContainer: (newContainer) => { container = newContainer; },
    };
};