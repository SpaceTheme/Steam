import { waitForElement } from '../../../src/js/utils.js';

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

    const rootObserver = new MutationObserver(() => setupElements());

    rootObserver.observe(document.body, {
        subtree: true,
        childList: true,
    });

    setupElements();
}
syncUserpanelWidth();