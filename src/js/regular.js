import { waitForElement, createContainerTracker } from './utils.js';

// Move setting option input element into the title element for better styling
async function moveSettingsOptions() {
    const listSelector = '.aFxOaYcllWYkCfVYQJFs0';
    const cardSelector = '.eKmEXJCm_lgme24Fp_HWt';
    const elementSelector = '.PSZtxj2h3MlyYv-c9dgke';
    const titleSelector = '._2VcTlXFC64Jtg9gvtT6cmY';
    
    const moveElements = () => {
        const lists = document.querySelectorAll(listSelector);
        lists.forEach((list) => {
            const cards = list.querySelectorAll(cardSelector);
            cards.forEach((card) => {
                const elementToMove = card.querySelector(elementSelector);
                const title = card.querySelector(titleSelector);
                
                if (elementToMove && title && !title.contains(elementToMove)) {
                    title.appendChild(elementToMove);
                }
            });
        });
    };
    moveElements();
    
    const rootObserver = new MutationObserver(moveElements);
    rootObserver.observe(document.body, {
        subtree: true,
        childList: true
    });
}
moveSettingsOptions();