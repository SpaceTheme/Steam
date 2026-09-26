import { waitForElement, createContainerTracker, CssClassNames } from './utils.js';

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
waitForElement(CssClassNames.Root).then(() => {
    if (!document.getElementById('st-loading-div')) {
        createLoadingDiv();
    }
});




// Store Sidebar Width fix
async function syncWidthIfTargetHidden() {
    const sourceClass = CssClassNames.Library.Body;
    const targetClass = CssClassNames.MainBody;

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
    const gamesContainerSelector = `${CssClassNames.Library.Games.Container} .ReactVirtualized__Grid__innerScrollContainer`;
    const itemSelector = CssClassNames.Library.Games.Game;
    const separatorSelector = CssClassNames.Library.Games.Separator;
    const widthContainerSelector = CssClassNames.Library.Games.Name;
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



// Sync User panel and Download bar width with Store sidebar
function syncUserPanelWidth() {
    const sourceClass = CssClassNames.Library.Body;
    const userPanelSelector = CssClassNames.UserPanel.Container;
    const downloadBarSelector = CssClassNames.DownloadBar;

    let sourceEl = null;
    let userPanelEl = null;
    let downloadBarEl = null;
    let sourceObserver = null;

    const setWidth = () => {
        if (!sourceEl) return;
        const computedWidth = window.getComputedStyle(sourceEl).width;
        if (computedWidth && computedWidth !== 'auto') {
            if (userPanelEl) {
                userPanelEl.style.width = computedWidth;
            }
            if (downloadBarEl) {
                downloadBarEl.style.width = computedWidth;
            }
        }
    };

    const bindObservers = () => {
        if (!sourceEl || (!userPanelEl && !downloadBarEl)) return;

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
        userPanelEl = document.querySelector(userPanelSelector);
        downloadBarEl = document.querySelector(downloadBarSelector);

        if (sourceEl && (userPanelEl || downloadBarEl)) {
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
syncUserPanelWidth();




// Create userpanel button container and move buttons
(async () => {
    await waitForElement(CssClassNames.Library.Container); // wait for game panel to load first
    // Userpanel
    const friendButton = await waitForElement(CssClassNames.UserPanel.FriendButton);
    const familyButton = document.querySelector(CssClassNames.UserPanel.FamilyButton);
    const parent = await waitForElement(CssClassNames.UserPanel.Container);

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'userpanel-buttoncontainer';

    const buttons = parent.querySelectorAll(`div${CssClassNames.UserPanel.Container} > div`);
    const buttonsToMove = Array.from(buttons).filter((button) => {
        return button.querySelector(CssClassNames.UserPanel.Button);
    });

    buttonsToMove.forEach((button) => {
        buttonContainer.appendChild(button);
    });

    buttonContainer.appendChild(friendButton);
    if (familyButton) {
        buttonContainer.appendChild(familyButton);
    }

    // Create custom settings button
    const settingsButton = document.createElement('div');
    settingsButton.className = 'tool-tip-source Focusable st-steam-settings';
    settingsButton.style.order = '999';

    const settingsIconWrapper = document.createElement('div');
    settingsIconWrapper.className = `${CssClassNames.UserPanel.Button.slice(1)} _3LKQ3S_yqrebeNLF6aeiog`;

    const settingsIcon = document.createElement('svg');
    settingsIcon.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    settingsIcon.setAttribute('viewBox', '0 0 20 19');
    settingsIcon.setAttribute('fill', 'none');
    settingsIcon.setAttribute('class', '_34bQcTHo5QKzuujoEyU1tm');

    settingsIconWrapper.appendChild(settingsIcon);
    settingsButton.appendChild(settingsIconWrapper);

    settingsButton.addEventListener('click', () => {
        window.opener.SteamClient.URL.ExecuteSteamURL("steam://millennium/sidebar");
    });

    buttonContainer.appendChild(settingsButton);

    parent.appendChild(buttonContainer);
})();



// Custom side panel resize behaviour
(async () => {
    const containerSelector = CssClassNames.MainBody;
    const panelSelector = CssClassNames.Library.Container;
    const panelBodySelector = CssClassNames.Library.Body;
    const panelResizerSelector = CssClassNames.Library.Divider;

    await waitForElement(panelSelector);

    let container = null;
    let body = null;
    let resizer = null;

    const minWidthPx = 256;
    let isResizing = false;
    let startX = 0;
    let startWidthPx = 0;
    let containerWidthPx = 0;
    let resizeDirection = 1;

    const handleUpdate = () => {
        resizer.onmousedown = null;
        resizer.onpointerdown = null;
        resizer.onclick = null;

        resizer.addEventListener('mousedown', e => {
            e.stopPropagation();
            isResizing = true;

            const containerRect = container.getBoundingClientRect();
            const bodyRect = body.getBoundingClientRect();

            startX = e.clientX;
            startWidthPx = bodyRect.width;
            containerWidthPx = containerRect.width;

            const containerCenterX = containerRect.left + containerRect.width / 2;
            const bodyCenterX = bodyRect.left + bodyRect.width / 2;

            const panelIsOnLeft = bodyCenterX < containerCenterX;

            resizeDirection = panelIsOnLeft ? 1 : -1;
        });

        document.addEventListener("mousemove", e => {
            if (!isResizing) return;

            const dx = (e.clientX - startX) * resizeDirection;

            let newWidthPx = startWidthPx + dx;

            newWidthPx = Math.max(minWidthPx, newWidthPx);
            newWidthPx = Math.min(containerWidthPx, newWidthPx);

            const newWidthPercent = (newWidthPx / containerWidthPx) * 100;

            body.style.width = `${newWidthPercent}%`;
        });

        document.addEventListener("mouseup", () => {
            if (!isResizing) return;
            isResizing = false;
        });
    }

    const handleSetup = async () => {
        container = await waitForElement(containerSelector);
        body = await waitForElement(panelBodySelector);
        resizer = await waitForElement(panelResizerSelector);
    };

    const containerTracker = createContainerTracker(panelSelector, {
        onSetup: handleSetup,
        onUpdate: handleUpdate
    });

    const rootObserver = new MutationObserver(async () => await containerTracker.rebind());
    rootObserver.observe(document.body, {
        subtree: true,
        childList: true,
    });
    await containerTracker.rebind();
})();
