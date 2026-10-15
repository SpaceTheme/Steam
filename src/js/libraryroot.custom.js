import { waitForElement, createContainerTracker, getFiber, CssClassNames } from './utils.js';

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
waitForElement(CssClassNames.HtmlRoot).then(() => {
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
            // Used by the "Sidebar only on hover" option for the expanded width.
            // Only set on changes, every style change triggers the observer below again.
            if (targetEl.style.getPropertyValue('--st-sidebar-width') !== width) {
                targetEl.style.setProperty('--st-sidebar-width', width);
            }
        }
    };

    const removeWidth = () => {
        targetEl.style.removeProperty('flex');
        if (targetEl.style.getPropertyValue('--st-sidebar-width')) {
            targetEl.style.removeProperty('--st-sidebar-width');
        }
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
    let sourceResizeObserver = null;

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

        // Width changes through CSS, e.g. the sidebar expanding on hover
        sourceResizeObserver?.disconnect();
        sourceResizeObserver = new ResizeObserver(setWidth);
        sourceResizeObserver.observe(sourceEl);

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
        window.opener.MILLENNIUM_API.openQuickAccess({ theme: "SpaceTheme for Steam" });
    });

    buttonContainer.appendChild(settingsButton);

    parent.appendChild(buttonContainer);
})();



// Sidebar width
// The custom resize behaviour only changes the element's style, so the width is saved here and given to Steam's library too.
// Otherwise the library falls back to its own width every time it gets mounted again (e.g. after the downloads page).
// Steam itself only restores whole percentages, so the exact width is kept in an own key.
const sidebarWidthKey = 'st-sidebar-width';

const getSidebarWidth = () => {
    const width = parseFloat(localStorage.getItem(sidebarWidthKey) ?? localStorage.getItem('GameListWidthPercentage'));
    return Number.isNaN(width) ? null : width;
};

const getLibraryInstance = body => {
    for (let fiber = getFiber(body); fiber; fiber = fiber.return) {
        if (fiber.stateNode?.SetGameListWidth) return fiber.stateNode;
    }
    return null;
};

const applySidebarWidth = body => {
    const width = getSidebarWidth();
    if (width === null) return;

    const library = getLibraryInstance(body);
    if (!library) {
        body.style.width = `${width}%`;
    } else if (library.state.nListWidthPercentage !== width) {
        library.setState({ nListWidthPercentage: width });
    }
};

const saveSidebarWidth = (body, width) => {
    localStorage.setItem(sidebarWidthKey, width);
    localStorage.setItem('GameListWidthPercentage', width);
    getLibraryInstance(body)?.setState({ nListWidthPercentage: width });
};



// Game sidebar on the downloads page
// Steam routes the downloads page next to the library instead of inside it, so the game list is never rendered there.
// The downloads page component gets patched to render the game list through a portal into a container
// that mirrors the library's left list, so the sidebar styles, width sync and resize behaviour apply to it as well.
(() => {
    const React = window.opener?.SP_REACT;
    const ReactDOM = window.opener?.SP_REACTDOM;
    if (!React || !ReactDOM) return;

    let libraryParts = null;
    let downloadsPatched = false;

    const findFiberDown = (fiber, predicate, depth = 0) => {
        for (let f = fiber; f && depth < 60; f = f.sibling) {
            if (predicate(f)) return f;
            const found = findFiberDown(f.child, predicate, depth + 1);
            if (found) return found;
        }
        return null;
    };

    // Steam's route switch with the downloads and the library route, exists on both pages
    const isRouteSwitch = fiber => {
        const children = fiber.memoizedProps?.children;
        return Array.isArray(children) && children.some(child => child?.props?.children?.type?.WrappedComponent);
    };

    // Render the library component once to get the game list and its wrappers, the library doesn't have to be open for it
    const getLibraryParts = () => {
        const fiber = findFiberDown(getFiber(document.querySelector(CssClassNames.MainBody)), isRouteSwitch);
        if (!fiber) return null;

        const libraryElement = fiber.memoizedProps.children.find(child => child?.props?.children?.type?.WrappedComponent).props.children;
        const library = libraryElement.type.WrappedComponent;
        const tree = library.prototype.render.call({ props: { ...libraryElement.props }, state: { loaded: true }, context: {} });

        let gameList = null;
        const walk = node => {
            if (!node || gameList || typeof node !== 'object') return;
            if (Array.isArray(node)) return node.forEach(walk);
            if (node.props?.bSmallMode === false) {
                gameList = node.type;
                return;
            }
            walk(node.props?.children);
        };
        walk(tree);
        if (!gameList) return null;

        const [keyHandler] = [].concat(tree.props.children);
        return { wrapper: tree.type, keyHandler: keyHandler.type, gameList };
    };

    const renderSidebar = () => React.createElement(libraryParts.wrapper, null,
        React.createElement(libraryParts.keyHandler, { key: 'keys' }),
        React.createElement(libraryParts.gameList, { key: 'games', bSmallMode: false }),
    );

    const createSidebarElements = () => {
        const sidebar = document.createElement('div');
        sidebar.className = `${CssClassNames.Library.Body.slice(1)} st-downloads-sidebar`;
        const width = getSidebarWidth();
        if (width !== null) sidebar.style.width = `${width}%`;

        const divider = document.createElement('div');
        divider.className = CssClassNames.Library.Divider.slice(1);

        return { sidebar, divider };
    };

    const attachSidebar = instance => {
        const elements = instance.stSidebarElements;
        if (!elements || elements.sidebar.isConnected) return;

        const rightPanel = document.querySelector(`${CssClassNames.MainBody} > ${CssClassNames.RightPanel}`);
        if (!rightPanel) return;

        rightPanel.before(elements.sidebar, elements.divider);
    };

    const patchDownloadsPage = downloadsPage => {
        const proto = downloadsPage.prototype;
        const { render, componentDidMount, componentDidUpdate, componentWillUnmount } = proto;

        proto.render = function (...args) {
            const result = render.apply(this, args);
            if (this.props.bInGamepadUI || !libraryParts) return result;

            this.stSidebarElements ??= createSidebarElements();
            return React.createElement(React.Fragment, null, result, ReactDOM.createPortal(renderSidebar(), this.stSidebarElements.sidebar));
        };

        proto.componentDidMount = function (...args) {
            attachSidebar(this);
            return componentDidMount?.apply(this, args);
        };

        proto.componentDidUpdate = function (...args) {
            attachSidebar(this);
            return componentDidUpdate?.apply(this, args);
        };

        proto.componentWillUnmount = function (...args) {
            this.stSidebarElements?.sidebar.remove();
            this.stSidebarElements?.divider.remove();
            return componentWillUnmount?.apply(this, args);
        };
    };

    // The downloads page component can only be found while it's open, so wait for it and patch it on the first visit
    const tryPatch = () => {
        if (downloadsPatched) return;

        try {
            libraryParts ??= getLibraryParts();
        } catch (error) {
            console.error('[SpaceTheme] Could not find the game list', error);
        }
        if (!libraryParts) return;

        const rightPanel = document.querySelector(`${CssClassNames.MainBody} > ${CssClassNames.RightPanel}`);
        const downloadsFiber = findFiberDown(getFiber(rightPanel), fiber =>
            fiber.tag === 1 && 'bOffline' in (fiber.memoizedProps || {}) && 'onShowRemoteClientMenu' in fiber.memoizedProps);
        if (!downloadsFiber) return;

        downloadsPatched = true;
        patchDownloadsPage(downloadsFiber.type);
        downloadsFiber.stateNode.forceUpdate();
    };

    let rafId = 0;
    const rootObserver = new MutationObserver(() => {
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
            rafId = 0;
            tryPatch();
        });
    });
    rootObserver.observe(document.body, {
        subtree: true,
        childList: true,
    });

    tryPatch();
})();



// Custom side panel resize behaviour
(async () => {
    const containerSelector = CssClassNames.WebkitRoot;
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

    const clickCallback = e => {
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
    };

    const moveCallback = e => {
        if (!isResizing) return;

        const dx = (e.clientX - startX) * resizeDirection;

        let newWidthPx = startWidthPx + dx;

        newWidthPx = Math.max(minWidthPx, newWidthPx);
        newWidthPx = Math.min(containerWidthPx, newWidthPx);

        const newWidthPercent = Math.min((newWidthPx / containerWidthPx) * 100, 50);

        body.style.width = `${newWidthPercent}%`;
    };
    const releaseCallback = () => {
        if (!isResizing) return;
        isResizing = false;

        const width = parseFloat(body.style.width);
        if (!Number.isNaN(width)) saveSidebarWidth(body, width);
    };

    const handleUpdate = () => {
        resizer.onmousedown = null;
        resizer.onpointerdown = null;
        resizer.onclick = null;

        resizer.addEventListener('mousedown', clickCallback);
        document.addEventListener("mousemove", moveCallback);
        document.addEventListener("mouseup", releaseCallback);
    }

    const handleSetup = async () => {
        container = await waitForElement(containerSelector);
        body = await waitForElement(panelBodySelector);
        resizer = await waitForElement(panelResizerSelector);
        applySidebarWidth(body);
    };

    const handleCleanup = () => {
        resizer.removeEventListener('mousedown', clickCallback);
        document.removeEventListener("mousemove", moveCallback);
        document.removeEventListener("mouseup", releaseCallback);
    };

    const containerTracker = createContainerTracker(panelSelector, {
        onSetup: handleSetup,
        onUpdate: handleUpdate,
        onCleanup: handleCleanup
    });

    const rootObserver = new MutationObserver(async () => await containerTracker.rebind());
    rootObserver.observe(document.body, {
        subtree: true,
        childList: true,
    });
    await containerTracker.rebind();
})();
