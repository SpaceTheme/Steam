(async function() {
    // should work only on search page
    if (!window.location.pathname.startsWith('/search')) return;

    const waitForElement = (selector, parent = document) => new Promise((resolve) => {
        const el = parent.querySelector(selector);
        if (el) resolve(el);

        const observer = new MutationObserver(() => {
            const el = parent.querySelector(selector);
            if (!el) return;
            resolve(el);
            observer.disconnect();
        });

        observer.observe(document.body, {
            subtree: true,
            childList: true,
        });
    });

    const searchResultsRows = await waitForElement('#search_resultsRows');
    const containerParent = document.getElementById('search_result_container');
    if (!containerParent) return;

    const btnContainer = document.createElement('div');
    btnContainer.className = 'st-search-view-toggle';
    btnContainer.style.display = 'flex';
    btnContainer.style.gap = '8px';
    btnContainer.style.marginBottom = '12px';
    btnContainer.style.justifyContent = 'flex-end';

    const listBtn = document.createElement('div');
    listBtn.className = 'st-btn-list';
    listBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M8 6.00067L21 6.00139M8 12.0007L21 12.0015M8 18.0007L21 18.0015M3.5 6H3.51M3.5 12H3.51M3.5 18H3.51M4 6C4 6.27614 3.77614 6.5 3.5 6.5C3.22386 6.5 3 6.27614 3 6C3 5.72386 3.22386 5.5 3.5 5.5C3.77614 5.5 4 5.72386 4 6ZM4 12C4 12.2761 3.77614 12.5 3.5 12.5C3.22386 12.5 3 12.2761 3 12C3 11.7239 3.22386 11.5 3.5 11.5C3.77614 11.5 4 11.7239 4 12ZM4 18C4 18.2761 3.77614 18.5 3.5 18.5C3.22386 18.5 3 18.2761 3 18C3 17.7239 3.22386 17.5 3.5 17.5C3.77614 17.5 4 17.7239 4 18Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
    `;
    listBtn.style.cursor = 'pointer';
    listBtn.style.padding = '6px';
    listBtn.style.borderRadius = '4px';
    listBtn.style.display = 'flex';
    listBtn.style.alignItems = 'center';
    listBtn.style.justifyContent = 'center';
    listBtn.style.transition = 'background 0.2s, color 0.2s';

    const gridBtn = document.createElement('div');
    gridBtn.className = 'st-btn-grid';
    gridBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 28 28">
            <path transform="translate(-104, -935)" fill="currentColor" fill-rule="evenodd" d="M128,935 L124,935 C121.791,935 120,936.791 120,939 L120,943 C120,945.209 121.791,947 124,947 L128,947 C130.209,947 132,945.209 132,943 L132,939 C132,936.791 130.209,935 128,935 L128,935 Z M128,951 L124,951 C121.791,951 120,952.791 120,955 L120,959 C120,961.209 121.791,963 124,963 L128,963 C130.209,963 132,961.209 132,959 L132,955 C132,952.791 130.209,951 128,951 L128,951 Z M112,951 L108,951 C105.791,951 104,952.791 104,955 L104,959 C104,961.209 105.791,963 108,963 L112,963 C114.209,963 116,961.209 116,959 L116,955 C116,952.791 114.209,951 112,951 L112,951 Z M112,935 L108,935 C105.791,935 104,936.791 104,939 L104,943 C104,945.209 105.791,947 108,947 L112,947 C114.209,947 116,945.209 116,943 L116,939 C116,936.791 114.209,935 112,935 L112,935 Z"></path>
        </svg>
    `;
    gridBtn.style.cursor = 'pointer';
    gridBtn.style.padding = '6px';
    gridBtn.style.borderRadius = '4px';
    gridBtn.style.display = 'flex';
    gridBtn.style.alignItems = 'center';
    gridBtn.style.justifyContent = 'center';
    gridBtn.style.transition = 'background 0.2s, color 0.2s';

    btnContainer.appendChild(listBtn);
    btnContainer.appendChild(gridBtn);
    containerParent.insertBefore(btnContainer, document.getElementById('search_resultsRows'));

    function updateStyles() {
        const isGrid = document.body.classList.contains('st-grid-view');
        
        const activeColor = '#ffffff';
        const activeBg = 'rgba(255, 255, 255, 0.2)';
        const inactiveColor = '#67707b';
        const inactiveBg = 'transparent';

        gridBtn.style.color = isGrid ? activeColor : inactiveColor;
        gridBtn.style.background = isGrid ? activeBg : inactiveBg;
        
        listBtn.style.color = !isGrid ? activeColor : inactiveColor;
        listBtn.style.background = !isGrid ? activeBg : inactiveBg;
    }

    gridBtn.addEventListener('click', () => {
        document.body.classList.add('st-grid-view');
        localStorage.setItem('st-search-view', 'grid');
        updateStyles();
    });

    listBtn.addEventListener('click', () => {
        document.body.classList.remove('st-grid-view');
        localStorage.setItem('st-search-view', 'list');
        updateStyles();
    });

    if (localStorage.getItem('st-search-view') === 'grid') {
        document.body.classList.add('st-grid-view');
    }
    updateStyles();
    
    const parentObserver = new MutationObserver(() => {
        if (!document.body.contains(btnContainer)) {
            const rows = document.getElementById('search_resultsRows');
            if (rows && rows.parentElement) {
                rows.parentElement.insertBefore(btnContainer, rows);
            }
        }
    });

    parentObserver.observe(containerParent, {
        childList: true,
        subtree: true
    });
})();
