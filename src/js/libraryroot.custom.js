import { waitForElement, createContainerTracker } from './utils.js';

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

    let sourceEl = null;
    let targetEl = null;
    let sourceObserver = null;
    let targetObserver = null;

    const setWidth = () => {
        const width = sourceEl.style.width;
        const scrollbarWidth = '16px';
        if (width) {
            targetEl.style.flex = `0 0 calc(${width} + ${scrollbarWidth})`;
        }
    };

    const removeWidth = () => {
        targetEl.style.removeProperty('flex');
    };

    const handleTargetDisplayChange = () => {
        if (targetEl.style.display === 'none') {
            setWidth();
        } else {
            removeWidth();
        }
    };


    const disconnectObservers = () => {
        sourceObserver?.disconnect();
        sourceObserver = null;

        targetObserver?.disconnect();
        targetObserver = null;
    };

    const bindObservers = () => {
        disconnectObservers();

        sourceObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    if (targetEl.style.display === 'none') {
                        setWidth();
                    }
                }
            }
        });

        // Watch for style changes on source
        sourceObserver.observe(sourceEl, {
            attributes: true,
            attributeFilter: ['style'],
        });

        // Watch for style changes on target (especially display)
        targetObserver = new MutationObserver((mutations) => {
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
    };

    const setupElements = async () => {
        sourceEl = await waitForElement(sourceClass);
        targetEl = await waitForElement(targetClass);
        bindObservers();
        handleTargetDisplayChange();
    };

    const sourceTracker = createContainerTracker(sourceClass, {
        onCleanup: disconnectObservers,
        onSetup: setupElements,
    });

    const rootObserver = new MutationObserver(async () => await sourceTracker.rebind());
    rootObserver.observe(document.body, {
        subtree: true,
        childList: true,
    });

    await setupElements();
}
syncWidthIfTargetHidden();




// Custom hover effect for game items
async function setupGamesHovers() {
    const gamesContainerSelector = '._1ijTaXJJA5YWl_fW2IxcaT .ReactVirtualized__Grid__innerScrollContainer';
    const itemSelector = '._2-O4ZG0KrnSrzISHBKctFQ';
    const separatorSelector = '._2RggXvVkWMDvvxFegjtKso';
    const widthContainerSelector = '._2SXJM0PeFEi3gbC7V3S5pE';
    const pxPerSec = 70;
    const minDurationSec = 2;
    const navTextOffset = 5;
    let attrObserver = null;
    let childObserver = null;
    let rafId = 0;

    const setHoverVariables = (item, overflow) => {
        if (overflow <= navTextOffset) {
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
            return itemText.scrollWidth - itemText.clientWidth + navTextOffset;
        }

        itemText.style.setProperty('padding-right', `${separator.offsetWidth + 4}px`);
        const widthContainer = item.querySelector(widthContainerSelector);
        if (!widthContainer) {
            return itemText.scrollWidth - itemText.clientWidth + navTextOffset;
        }

        return widthContainer.scrollWidth - widthContainer.clientWidth;
    };

    const handleGamesHover = () => {
        const gamesContainer = containerTracker.getContainer();
        if (!gamesContainer) {
            return;
        }

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

    const scheduleHoverUpdate = () => {
        if (!rafId) {
            rafId = requestAnimationFrame(() => {
                rafId = 0;
                handleGamesHover();
            });
        }
    };

    const disconnectContainerObservers = () => {
        attrObserver?.disconnect();
        attrObserver = null;

        childObserver?.disconnect();
        childObserver = null;
    };

    const bindContainerObservers = () => {
        const gamesContainer = containerTracker.getContainer();
        if (!gamesContainer) {
            return;
        }

        disconnectContainerObservers();

        attrObserver = new MutationObserver(scheduleHoverUpdate);
        attrObserver.observe(gamesContainer, { attributes: true, attributeFilter: ['style'] });

        childObserver = new MutationObserver(scheduleHoverUpdate);
        childObserver.observe(gamesContainer, { childList: true, subtree: true });
    };

    const containerTracker = createContainerTracker(gamesContainerSelector, {
        onCleanup: disconnectContainerObservers,
        onSetup: bindContainerObservers,
        onUpdate: scheduleHoverUpdate,
    });

    const rootObserver = new MutationObserver(async () => await containerTracker.rebind());
    rootObserver.observe(document.body, {
        subtree: true,
        childList: true,
    });

    await containerTracker.rebind();
}
setupGamesHovers();



// Sync Userpanel and Downloadbar width with Store sidebar
function syncUserpanelWidth() {
    const sourceClass = '._9sPoVBFyE_vE87mnZJ5aB';
    const userpanelSelector = '._3cykd-VfN_xBxf3Qxriccm._1-9sir4j_KQiMqdkZjQN0u';
    const downloadBarSelector = '._1_yS5UP7el0aN4vntx3dx';

    let sourceEl = null;
    let userpanelEl = null;
    let downloadBarEl = null;
    let sourceObserver = null;

    const setWidth = () => {
        if (!sourceEl) return;
        const computedWidth = window.getComputedStyle(sourceEl).width;
        if (computedWidth && computedWidth !== 'auto') {
            if (userpanelEl) {
                userpanelEl.style.width = computedWidth;
            }
            if (downloadBarEl) {
                downloadBarEl.style.width = computedWidth;
            }
        }
    };

    const bindObservers = () => {
        if (!sourceEl || (!userpanelEl && !downloadBarEl)) return;

        sourceObserver?.disconnect();

        sourceObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    setWidth();
                }
            }
        });

        sourceObserver.observe(sourceEl, {
            attributes: true,
            attributeFilter: ['style'],
        });

        setWidth();
    };

    const setupElements = () => {
        sourceEl = document.querySelector(sourceClass);
        userpanelEl = document.querySelector(userpanelSelector);
        downloadBarEl = document.querySelector(downloadBarSelector);

        if (sourceEl && (userpanelEl || downloadBarEl)) {
            bindObservers();
        }
    };

    window.addEventListener('resize', setWidth);
    new ResizeObserver(setWidth).observe(document.documentElement);
    window.visualViewport?.addEventListener('resize', setWidth);

    const rootObserver = new MutationObserver(() => setupElements());

    rootObserver.observe(document.body, {
        subtree: true,
        childList: true,
    });

    setupElements();
}
syncUserpanelWidth();




// Create userpanel button container and move buttons
(async () => {
    await waitForElement('._3x1HklzyDs4TEjACrRO2tB'); // wait for game panel to load first
    // Userpanel
    const friendButton = await waitForElement('._1TdaAqMFadi0UTqilrkelR');
    const parent = await waitForElement('._3cykd-VfN_xBxf3Qxriccm');

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'userpanel-buttoncontainer';
  
    const buttons = parent.querySelectorAll('div._3cykd-VfN_xBxf3Qxriccm > div');
    const buttonsToMove = Array.from(buttons).filter((button) => {
        return button.querySelector('._2Szzh5sKyGgnLUR870zbDE');
    });
  
    buttonsToMove.forEach((button) => {
        buttonContainer.appendChild(button);
    });
    
    buttonContainer.appendChild(friendButton);
    parent.appendChild(buttonContainer);
})();