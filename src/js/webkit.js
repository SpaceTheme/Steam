import './webkit/community/friendsThatPlayed.js';
import { waitForElement } from './utils.js';

(async function() {
    // should work only on search page
    if (!window.location.pathname.startsWith('/search')) return;

    const containerParent = await waitForElement('.searchbar');
    const searchResultsRows = await waitForElement('#search_resultsRows');
    if (!containerParent) return;

    const btnContainer = document.createElement('div');
    btnContainer.className = 'st-search-view-toggle';

    const listBtn = document.createElement('div');
    listBtn.className = 'st-btn list';
    listBtn.innerHTML = `
        <svg></svg>
    `;

    const gridBtn = document.createElement('div');
    gridBtn.className = 'st-btn grid';
    gridBtn.innerHTML = `
        <svg></svg>
    `;

    btnContainer.appendChild(listBtn);
    btnContainer.appendChild(gridBtn);
    if (searchResultsRows && searchResultsRows.parentElement === containerParent) {
        containerParent.insertBefore(btnContainer, searchResultsRows);
    } else {
        containerParent.appendChild(btnContainer);
    }


    gridBtn.addEventListener('click', () => {
        document.body.classList.add('st-grid-view');
        localStorage.setItem('st-search-view', 'grid');
        gridBtn.classList.add('active');
        listBtn.classList.remove('active');
    });

    listBtn.addEventListener('click', () => {
        document.body.classList.remove('st-grid-view');
        localStorage.setItem('st-search-view', 'list');
        listBtn.classList.add('active');
        gridBtn.classList.remove('active');
    });

    if (localStorage.getItem('st-search-view') === 'list') {
        document.body.classList.remove('st-grid-view');
        listBtn.classList.add('active');
    } else {
        document.body.classList.add('st-grid-view');
        gridBtn.classList.add('active');
    }
    
    const parentObserver = new MutationObserver(() => {
        if (!document.body.contains(btnContainer)) {
            const rows = searchResultsRows;
            if (rows && rows.parentElement) {
                rows.parentElement.insertBefore(btnContainer, rows);
                return;
            }
            if (containerParent) {
                containerParent.appendChild(btnContainer);
            }
        }
    });

    parentObserver.observe(containerParent, {
        childList: true,
        subtree: true
    });
})();
