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

export const tryPromise = cb => {
    if (typeof cb !== 'function') return Promise.resolve();
    if ('try' in Promise) {
        return Promise.try(cb);
    }
    return Promise.resolve().then(cb);
};

export const createContainerTracker = (selector, { onCleanup, onSetup, onUpdate } = {}) => {
    let container = null;

    const rebind = async () => {
        const nextContainer = document.querySelector(selector);

        if (nextContainer === container) {
            return;
        }

        container = nextContainer;

        if (!container) {
            await tryPromise(onCleanup);
            return;
        }

        await tryPromise(onSetup);
        await tryPromise(onUpdate);
    };

    return {
        rebind,
        getContainer: () => container,
        setContainer: (newContainer) => { container = newContainer; },
    };
};

export const CssClassNames = {
    Root: '.Rp8QOGJ2DypeDniMnRBhr',
    MainBody: '.RGNMWtyj73_-WdhflrmuY',
    Library: {
        Body: '._9sPoVBFyE_vE87mnZJ5aB',
        Container: '._3x1HklzyDs4TEjACrRO2tB',
        Divider: '._276E6ijBpjMA2_iTxNhhjc',
        Games: {
            Container: '._1ijTaXJJA5YWl_fW2IxcaT',
            Game: '._2-O4ZG0KrnSrzISHBKctFQ',
            Separator: '._2RggXvVkWMDvvxFegjtKso',
            Name: '._2SXJM0PeFEi3gbC7V3S5pE',
        }
    },
    UserPanel: {
        Container: '._3cykd-VfN_xBxf3Qxriccm',
        Button: '._2Szzh5sKyGgnLUR870zbDE',
        FriendButton: '._1TdaAqMFadi0UTqilrkelR',
        FamilyButton: '._13vrqU6oOqmmxrsZSW5O39',
    },
    DownloadBar: '._1_yS5UP7el0aN4vntx3dx',
};
