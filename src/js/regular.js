import { waitForElement, createContainerTracker } from './utils.js';

// Move setting option input element into the title element for better styling
async function moveSettingsOptions() {
    const listSelector = '.aFxOaYcllWYkCfVYQJFs0, .MillenniumDesktopSidebar_EditorContent';
    const cardSelector = '.eKmEXJCm_lgme24Fp_HWt';
    const elementSelector = '.PSZtxj2h3MlyYv-c9dgke, ._2tALpM7z8naXJ35Pp5fNAG > ._1aw7cA3mAZfWt8idAlVJWi';
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

// Wrap the Millennium theme and plugin cards in their own div for grid styling
function wrapMillenniumCards() {
    const cardSelector = '.MillenniumThemes_ThemeItem, .MillenniumPlugins_PluginField';
    const wrapperClass = 'st-millennium-cards';

    // React still thinks the cards are children of the old parent, so send its DOM calls to the wrapper
    const patchParent = (parent) => {
        if (parent.stCardsPatched) return;
        parent.stCardsPatched = true;

        const { insertBefore, removeChild } = parent;
        parent.insertBefore = function (node, ref) {
            return ref && ref.parentNode !== this ? ref.parentNode.insertBefore(node, ref) : insertBefore.call(this, node, ref);
        };
        parent.removeChild = function (child) {
            return child.parentNode !== this ? child.parentNode.removeChild(child) : removeChild.call(this, child);
        };
    };

    const wrapCards = () => {
        document.querySelectorAll(`:is(${cardSelector}):not(.${wrapperClass} > *)`).forEach((card) => {
            let wrapper = card.previousElementSibling;
            if (!wrapper?.classList.contains(wrapperClass)) {
                wrapper = document.createElement('div');
                wrapper.className = wrapperClass;
                card.before(wrapper);
            }
            patchParent(card.parentElement);
            wrapper.appendChild(card);
        });
        document.querySelectorAll(`.${wrapperClass}:empty`).forEach((wrapper) => wrapper.remove());
    };
    wrapCards();

    const rootObserver = new MutationObserver(wrapCards);
    rootObserver.observe(document.body, {
        subtree: true,
        childList: true
    });
}
wrapMillenniumCards();