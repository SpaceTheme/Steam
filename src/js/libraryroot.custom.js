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




// Sidebar collections: every collection header and its games get their own div.st-collection, in normal flow so spacing from CSS works.
// Steam's list only renders the visible rows, absolutely positioned. Here every row keeps its place in the DOM, but only rows near the visible
// area are real, the others are empty placeholders (div.Panel[role="gridcell"]) with the row's measured height, so row CSS lays them out the same.
// Rendering every row would make each broad restyle (the theme's :has() rules, the mouse entering the sidebar) many times slower.
function wrapSidebarCollections(gamesContainer) {
    const React = window.opener?.SP_REACT;
    let fiber = getFiber(gamesContainer);
    while (fiber && !fiber.stateNode?.recomputeRowHeights) fiber = fiber.return;
    const list = fiber?.stateNode;
    while (fiber && !(fiber.stateNode && 'visibleRows' in fiber.stateNode)) fiber = fiber.return;
    const gameList = fiber?.stateNode;
    if (!React || !list || !gameList || Object.hasOwn(list, 'render')) return;

    const rowKey = row => `${row.strCollectionId}/${row.bIsCollection ? '' : row.appOverview.appid}`;
    let scroller = null;
    let rows = [];
    let range = [0, 50];
    let cells = new Map();
    let placeholders = new Map();
    const heights = new Map();
    const typeHeights = [26, 26]; // game, header: for rows that weren't real yet, Steam's row height until rows are measured
    let frame = 0;

    const setScroller = el => scroller = el;
    const getRowElements = () => scroller?.querySelectorAll('.st-collection > *') ?? [];

    list.render = function () {
        const { width, height, rowRenderer, onScroll } = this.props;
        rows = gameList.visibleRows;
        const nextCells = new Map();
        const nextPlaceholders = new Map();
        const collections = [];
        rows.forEach((row, index) => {
            if (row.bIsCollection || !collections.length) collections.push({ key: row.strCollectionId, cells: [] });
            const key = rowKey(row);

            if (index < range[0] || index > range[1]) {
                const rowHeight = heights.get(key) ?? typeHeights[row.bIsCollection ? 1 : 0];
                let placeholder = placeholders.get(key);
                if (placeholder?.props.style.height !== rowHeight) placeholder = React.createElement('div', { key, className: 'Panel', role: 'gridcell', style: { boxSizing: 'border-box', height: rowHeight } });
                nextPlaceholders.set(key, placeholder);
                collections.at(-1).cells.push(placeholder);
                return;
            }

            // Steam keys rows by index, so collapsing a collection would remount every row below it. Keys per game keep them mounted,
            // and a row's element is reused while everything Steam renders it from stays the same (the rows observe their game and the selection themselves).
            // The index is left out: Steam's game row only uses it to select itself on click, so the click looks up the current index instead
            const inputs = row.bIsCollection
                ? [row.rgStrNames[0], row.nTotalCollectionSize, row.nFilteredSize, row.bIsCollapsed, gameList.props.bInGamepadUI]
                : [row.appOverview, index + 1 === rows.length || rows[index + 1].bIsCollection, gameList.props.bInGamepadUI];
            let cell = cells.get(key);
            if (!cell || cell.inputs.some((input, i) => input !== inputs[i])) {
                const element = rowRenderer({ key, index, style: {}, isScrolling: false, isVisible: true, parent: this });
                const select = () => gameList.SelectIndex(gameList.visibleRows.findIndex(other => !other.bIsCollection && other.strCollectionId === row.strCollectionId && other.appOverview === row.appOverview));
                const children = React.cloneElement(element.props.children, row.bIsCollection ? { key: 'row' } : { key: 'row', onClick: select });
                // role like react-virtualized adds it, sidebar.css styles .Panel[role="gridcell"]
                // bDisabled: no full name popup, long names scroll instead. It only opened in flow layout because Steam measures the row against its parent
                cell = { inputs, element: React.cloneElement(element, { role: 'gridcell', bDisabled: true, children }) };
            }
            nextCells.set(key, cell);
            collections.at(-1).cells.push(cell.element);
        });
        cells = nextCells;
        placeholders = nextPlaceholders;

        return React.createElement('div', {
            ref: setScroller,
            className: 'ReactVirtualized__Grid ReactVirtualized__List',
            role: 'grid',
            tabIndex: 0,
            style: { width, height, overflowX: 'hidden', overflowY: 'auto' },
            onScroll: ({ currentTarget: { clientHeight, scrollHeight, scrollTop } }) => {
                onScroll({ clientHeight, scrollHeight, scrollTop });
                frame ||= requestAnimationFrame(updateRange);
            },
        }, React.createElement('div', { className: 'ReactVirtualized__Grid__innerScrollContainer', role: 'row' },
            collections.map(collection => React.createElement('div', { key: collection.key, className: 'st-collection' }, collection.cells))));
    };

    // Real rows: everything within a screen of the visible area, moved along once less than half a screen is left
    const updateRange = () => {
        cancelAnimationFrame(frame);
        frame = 0;
        const elements = getRowElements();
        if (!elements.length) return;

        const { top, bottom } = scroller.getBoundingClientRect();
        const screen = scroller.clientHeight;
        const indexAt = y => {
            let low = 0;
            let high = elements.length - 1;
            while (low < high) {
                const middle = (low + high) >> 1;
                if (elements[middle].getBoundingClientRect().bottom > y) high = middle;
                else low = middle + 1;
            }
            return low;
        };
        if (indexAt(top - screen / 2) >= range[0] && indexAt(bottom + screen / 2) <= range[1]) return;

        range = [indexAt(top - screen), indexAt(bottom + screen)];
        list.forceUpdate();
    };

    // After each render the real rows are measured for their placeholders
    list.componentDidUpdate = () => {
        const elements = getRowElements();
        const previousTypeHeights = typeHeights.join();
        for (let index = range[0]; index <= Math.min(range[1], elements.length - 1); index++) {
            const rowHeight = elements[index].getBoundingClientRect().height;
            heights.set(rowKey(rows[index]), rowHeight);
            typeHeights[rows[index].bIsCollection ? 1 : 0] = rowHeight;
        }
        if (typeHeights.join() !== previousTypeHeights) list.forceUpdate();
        updateRange();
    };

    // Same results as react-virtualized, but measured from the DOM (placeholders sit where their rows would)
    list.getOffsetForRow = ({ alignment = 'auto', index }) => {
        const row = getRowElements()[index];
        if (!row) return 0;

        const start = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
        const end = start + row.offsetHeight - scroller.clientHeight;
        const offset = alignment === 'start' ? start
            : alignment === 'end' ? end
            : alignment === 'center' ? (start + end) / 2
            : Math.min(Math.max(scroller.scrollTop, end), start);
        return Math.max(0, Math.min(offset, scroller.scrollHeight - scroller.clientHeight));
    };
    list.scrollToPosition = top => scroller && (scroller.scrollTop = top);
    list.scrollToRow = index => list.scrollToPosition(list.getOffsetForRow({ index }));
    list.forceUpdateGrid = () => list.forceUpdate();

    list.forceUpdate();
}



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

    // Attributes only get written when they change: every style/attribute write makes the browser re-check the theme's
    // body:has() rules, which restyles the icons of the whole game list
    const setHoverVariables = (item, overflow) => {
        if (item.style.getPropertyValue('--st-game-overflow') === (overflow > navTextOffset ? `${overflow}px` : '')) return;

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
        const widthContainer = separator && item.querySelector(widthContainerSelector);
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

        const games = [...gamesContainer.querySelectorAll(itemSelector)].map(item => {
            // Steam display status for the play/update/download icon in sidebar.css, the DOM only has it as text
            let fiber = getFiber(item);
            while (fiber && !fiber.memoizedProps?.item) fiber = fiber.return;
            const status = fiber?.memoizedProps.item.display_status;
            if (status !== undefined && item.dataset.stStatus !== String(status)) item.dataset.stStatus = status;

            const itemText = item.querySelector('span');
            return itemText && { item, itemText, separator: itemText.querySelector(separatorSelector) };
        }).filter(Boolean);

        // Reads and writes are batched, mixing them makes the browser lay out the whole game list once per game
        games.forEach(game => {
            if (!game.itemText.dataset.stHoverText) {
                game.hoverText = game.itemText.innerText;
                if (game.separator) game.hoverText += ` ${game.separator.textContent}`;
            }
            if (game.separator) game.padding = `${game.separator.offsetWidth + 4}px`;
        });
        games.forEach(({ itemText, hoverText, padding }) => {
            if (hoverText) itemText.dataset.stHoverText = hoverText;
            if (padding && itemText.style.paddingRight !== padding) itemText.style.setProperty('padding-right', padding);
        });
        games.forEach(game => game.overflow = Math.max(0, Math.ceil(getOverflowWidth(game.item, game.itemText, game.separator))));
        games.forEach(({ item, overflow }) => setHoverVariables(item, overflow));
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
        // The list's scroll container gets the new width/height when the sidebar is resized
        attrObserver.observe(gamesContainer.parentElement, { attributes: true, attributeFilter: ['style'] });

        childObserver = new MutationObserver(scheduleHoverUpdate);
        childObserver.observe(gamesContainer, { childList: true, subtree: true });
    };

    const containerTracker = createContainerTracker(gamesContainerSelector, {
        onCleanup: disconnectContainerObservers,
        onSetup: () => {
            wrapSidebarCollections(containerTracker.getContainer());
            bindContainerObservers();
        },
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
// React remounts the userpanel and the bottom bar (e.g. during startup), which drops the moved buttons,
// so this runs on every DOM change and only does work when something is missing.
const buildUserPanel = () => {
    const parent = document.querySelector(CssClassNames.UserPanel.Container);
    if (!parent) return;

    const existing = parent.querySelector('.userpanel-buttoncontainer');
    if (existing) {
        // The friends/family buttons live in Steam's bottom bar and come back there when it remounts
        for (const selector of [CssClassNames.UserPanel.FriendButton, CssClassNames.UserPanel.FamilyButton]) {
            const button = document.querySelector(selector);
            if (button && button.parentElement !== existing) existing.appendChild(button);
        }
        return;
    }

    const friendButton = document.querySelector(CssClassNames.UserPanel.FriendButton);
    const familyButton = document.querySelector(CssClassNames.UserPanel.FamilyButton);

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'userpanel-buttoncontainer';

    const buttons = parent.querySelectorAll(`div${CssClassNames.UserPanel.Container} > div`);
    const buttonsToMove = Array.from(buttons).filter((button) => {
        return button.querySelector(CssClassNames.UserPanel.Button);
    });

    buttonsToMove.forEach((button) => {
        buttonContainer.appendChild(button);
    });

    if (friendButton) {
        buttonContainer.appendChild(friendButton);
    }
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
};

(async () => {
    await waitForElement(CssClassNames.Library.Container); // wait for game panel to load first

    new MutationObserver(buildUserPanel).observe(document.body, { subtree: true, childList: true });
    buildUserPanel();
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
