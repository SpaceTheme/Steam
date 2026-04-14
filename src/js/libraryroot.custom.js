const waitForElement = (selector, parent = document) => new Promise((resolve) => {
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




// Create Loading Screen
const createLoadingDiv = () => {
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'st-loading-div';

    // Radial Loader
    const loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'st-radial-loader';

    loadingDiv.appendChild(loadingIndicator);

    // Apply to body
    document.body.appendChild(loadingDiv);

    // Timer
    setTimeout(() => {
        document.body.removeChild(loadingDiv);
    }, 2500);
};

// Patch to body
waitForElement('.Rp8QOGJ2DypeDniMnRBhr').then(() => {
    if (!document.getElementById('st-loading-div')) {
        createLoadingDiv();
    }
});




// Store Sidebar Width half fix
async function syncWidthIfTargetHidden() {
    const sourceClass = '._9sPoVBFyE_vE87mnZJ5aB';
    const targetClass = '.RGNMWtyj73_-WdhflrmuY';

    const sourceEl = await waitForElement(sourceClass);
    const targetEl = await waitForElement(targetClass);

    const setWidth = () => {
        const width = sourceEl.style.width;
        if (width) {
            targetEl.style.width = width;
        }
    };

    const removeWidth = () => {
        targetEl.style.removeProperty('width');
    };

    const handleTargetDisplayChange = () => {
        if (targetEl.style.display === 'none') {
            setWidth();
        } else {
            removeWidth();
        }
    };

    // Initial check
    handleTargetDisplayChange();

    // Watch for style changes on source
    const sourceObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                if (targetEl.style.display === 'none') {
                    setWidth();
                }
            }
        }
    });

    sourceObserver.observe(sourceEl, {
        attributes: true,
        attributeFilter: ['style'],
    });

    // Watch for style changes on target (especially display)
    const targetObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                handleTargetDisplayChange();
            }
        }
    });

    targetObserver.observe(targetEl, {
        attributes: true,
        attributeFilter: ['style'],
    });
}

syncWidthIfTargetHidden();

(async function setupGamesHovers() {
    const gamesContainer = await waitForElement('._1ijTaXJJA5YWl_fW2IxcaT .ReactVirtualized__Grid__innerScrollContainer');
    const itemSelector = '._2-O4ZG0KrnSrzISHBKctFQ';
    const separatorSelector = '._2RggXvVkWMDvvxFegjtKso';
    const widthContainerSelector = '._2SXJM0PeFEi3gbC7V3S5pE';
    const pxPerSec = 70;
    const minDurationSec = 2;

    const setHoverVariables = (item, overflow) => {
        if (overflow <= 0) {
            item.style.removeProperty('--st-game-overflow');
            item.style.removeProperty('--st-game-hover-duration');
            return;
        }

        const duration = Math.max(minDurationSec, overflow / pxPerSec);
        item.style.setProperty('--st-game-overflow', `${overflow}px`);
        item.style.setProperty('--st-game-hover-duration', `${duration}s`);
    };

    const getOverflowWidth = (item, itemText, separator) => {
        if (!separator) {
            return itemText.scrollWidth - itemText.clientWidth + 5;
        }

        itemText.style.setProperty('padding-right', `${separator.offsetWidth + 4}px`);
        const widthContainer = item.querySelector(widthContainerSelector);
        if (!widthContainer) {
            return itemText.scrollWidth - itemText.clientWidth + 5;
        }

        return widthContainer.scrollWidth - widthContainer.clientWidth;
    };

    const handleGamesHover = () => {
        const gameItems = gamesContainer.querySelectorAll(itemSelector);

        gameItems.forEach(item => {
            const itemText = item.querySelector('span');
            if (!itemText) return;

            const separator = itemText.querySelector(separatorSelector);

            if (!itemText.dataset.stHoverText) {
                let text = itemText.innerText;
                if (separator) text += ` ${separator.textContent}`;
                itemText.dataset.stHoverText = text;
            }

            const widthDiff = getOverflowWidth(item, itemText, separator);
            const overflow = Math.max(0, Math.ceil(widthDiff));
            setHoverVariables(item, overflow);
        });
    };

    let rafId = 0;
    const scheduleHoverUpdate = () => {
        if (!rafId) {
            rafId = requestAnimationFrame(() => {
                rafId = 0;
                handleGamesHover();
            });
        }
    };

    const attrObserver = new MutationObserver(scheduleHoverUpdate);
    attrObserver.observe(gamesContainer, { attributes: true, attributeFilter: ['style'] });

    const childObserver = new MutationObserver(scheduleHoverUpdate);
    childObserver.observe(gamesContainer, { childList: true, subtree: true });

    handleGamesHover();
})();