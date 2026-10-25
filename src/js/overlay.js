import { CssClassNames, waitForElement } from './utils.js';

const { Overlay } = CssClassNames;

// Home: these windows (overlay store type: window type) share the clock box under the time and show whenever nothing else is open
const homeWindows = { GameOverview: 'GameOverview', Notes: 'GameNotes' };

// Overlay windows are named "<type>_«id»_uid<game pid>", normal Steam windows end in "_uid0"
const [, windowType, uid] = window.name.match(/^(.+?)(?:_«[^»]*»)?(_uid[1-9]\d*)$/) ?? [];

if (windowType) {
    document.documentElement.classList.add('st-overlay-window', `st-overlay-${windowType}`);

    // SteamClient.Window methods only work when called on SteamClient.Window
    const windowApi = SteamClient.Window;
    const { MoveTo, ResizeTo } = windowApi;

    // Docked windows cover the clock box of the overlay page, home windows their slot in it (see overlay.custom.css)
    const place = () => {
        const overlayDocument = opener.g_PopupManager.GetExistingPopup(`desktopoverlay${uid}`)?.window.document;
        const area = overlayDocument?.querySelector(`[data-st-overlay-slot="${windowType}"]`) ?? overlayDocument?.querySelector(Overlay.Clock);
        if (!area) return;
        const { x, y, width, height } = area.getBoundingClientRect();
        windowApi.SetMinSize(0, 0);
        ResizeTo.call(windowApi, Math.round(width), Math.round(height), true);
        MoveTo.call(windowApi, Math.round(x), Math.round(y), true);
    };

    // Only real windows have a title bar, menus and the overlay page itself are left alone
    // Pinned windows can be dragged (see regular.css) and resized, Steam may size them again (fit to content);
    // docked ones only move and resize through place()
    let pinned;
    const update = () => {
        if (!document.querySelector('.title-area')) return;
        const isPinned = !!document.querySelector(Overlay.PinnedButton);
        if (isPinned === pinned) return;
        pinned = isPinned;
        const grip = pinned ? 16 : 0;
        windowApi.SetResizeGrip(grip, grip);
        if (pinned) {
            Object.assign(windowApi, { MoveTo, ResizeTo });
        } else {
            windowApi.MoveTo = windowApi.ResizeTo = () => {};
            place();
        }
    };
    // The window may already be rendered when this script loads
    update();
    new MutationObserver(update).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });

    const replace = () => pinned === false && place();
    window.addEventListener('resize', replace);
    // Sent by the overlay page once its clock box exists, for windows Steam restored before that
    window.addEventListener('st-overlay-ready', replace);
}

if (windowType === 'desktopoverlay') {
    waitForElement(Overlay.Clock).then(box => {
        const { appStore, SteamUIStore, g_PopupManager } = opener;
        const steamWindow = SteamUIStore.WindowStore.SteamUIWindows.find(w => w.BrowserWindow === window);
        const overlayStore = steamWindow.DesktopOverlay;
        const appid = steamWindow.MainRunningAppID;

        // Game hero for the overlay banner, custom heroes first; files that don't exist just don't paint
        const heroes = [...appStore.GetCustomHeroImageURLs(appStore.GetAppOverviewByAppID(appid)), `/assets/${appid}/library_hero.jpg`];
        document.documentElement.style.setProperty('--st-game-hero', heroes.map(url => `url("${new URL(url, opener.location.href)}")`).join(', '));

        box.insertAdjacentHTML('beforeend', `<div class="st-overlay-home">${Object.values(homeWindows).map(type => `<div data-st-overlay-slot="${type}"></div>`).join('')}</div>`);

        for (const popup of g_PopupManager.GetPopups()) {
            popup.window?.dispatchEvent(new popup.window.Event('st-overlay-ready'));
        }

        const isHome = type => type in homeWindows;
        const setWindowVisibility = overlayStore.SetWindowVisibility;
        const showHomeIfIdle = () => {
            const visibility = overlayStore.m_mapWindowVisibilityState;
            const busy = [...visibility].some(([type, state]) => state === 1 && !isHome(type) && !overlayStore.BWindowPinned(type));
            for (const type in homeWindows) {
                if (!overlayStore.BWindowPinned(type) && (visibility.get(type) === 1) === busy) setWindowVisibility.call(overlayStore, type, busy ? 0 : 1);
            }
        };

        // Only one window at a time (home counts as one), pinned windows stay open next to it
        overlayStore.SetWindowVisibility = function (type, state) {
            if (state === 1) {
                for (const [other, otherState] of this.m_mapWindowVisibilityState) {
                    if (otherState === 1 && other !== type && !this.BWindowPinned(other) && !(isHome(type) && isHome(other))) setWindowVisibility.call(this, other, 0);
                }
            }
            setWindowVisibility.call(this, type, state);
            showHomeIfIdle();
        };

        // Unpinned windows dock again as if they were just opened
        const setWindowPinned = overlayStore.SetWindowPinned;
        overlayStore.SetWindowPinned = function (type, pin) {
            setWindowPinned.call(this, type, pin);
            if (!pin && this.BWindowVisible(type)) this.SetWindowVisibility(type, 1);
        };

        // Each game starts on home, Steam would restore everything that was open last time
        overlayStore.SetWindowVisibility('GameOverview', 1);

        // Home button on top of the sidebar, made from the minimize button (hidden in overlay.custom.css)
        const sidebar = document.querySelector(Overlay.Sidebar);
        const home = sidebar.lastElementChild.cloneNode(true);
        const homeButton = home.querySelector('button');
        homeButton.classList.add('st-overlay-home-button');
        homeButton.querySelector('path').setAttribute('d', 'M18 4L3 16V32H14V23H22V32H33V16L18 4Z');
        homeButton.addEventListener('click', () => overlayStore.SetWindowVisibility('GameOverview', 1));
        sidebar.prepend(home);

        // Highlighted like the (hidden) game overview button
        const syncHomeButton = () => homeButton.classList.toggle(Overlay.ActiveButton.slice(1), !!sidebar.querySelector(`.GameOverview${Overlay.ActiveButton}`));
        syncHomeButton();
        new MutationObserver(syncHomeButton).observe(sidebar, { subtree: true, attributes: true, attributeFilter: ['class'] });
    });
}
