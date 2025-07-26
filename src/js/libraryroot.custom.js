const waitForElement = (selector, parent = document) => new Promise((resolve) => {
    const el = parent.querySelector(selector);
    if (el) {
        resolve(el);
    }

    const observer = new MutationObserver(() => {
        const el = parent.querySelector(selector);
        if (!el) {
            return;
        }

        resolve(el);
        observer.disconnect();
    });

    observer.observe(document.body, {
        subtree: true,
        childList: true,
    });
});




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

  const sourceEl = await waitForElement(sourceClass);
  const targetEl = await waitForElement(targetClass);

  const setWidth = () => {
    const width = sourceEl.style.width;
    if (width) {
      targetEl.style.width = width;
    }
  };

  const removeWidth = () => {
    targetEl.style.removeProperty('width');
  };

  const handleTargetDisplayChange = () => {
    if (targetEl.style.display === 'none') {
      setWidth();
    } else {
      removeWidth();
    }
  };

  // Initial check
  handleTargetDisplayChange();

  // Watch for style changes on source
  const sourceObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
        if (targetEl.style.display === 'none') {
          setWidth();
        }
      }
    }
  });

  sourceObserver.observe(sourceEl, {
    attributes: true,
    attributeFilter: ['style'],
  });

  // Watch for style changes on target (especially display)
  const targetObserver = new MutationObserver((mutations) => {
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
}

syncWidthIfTargetHidden();