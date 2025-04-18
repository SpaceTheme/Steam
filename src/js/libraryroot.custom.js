const waitForElement = (selector, parent = document) => {
  return new Promise((resolve) => {
    const el = parent.querySelector(selector);
    if (el) {
      resolve(el);
    }

    const observer = new MutationObserver(() => {
      const el = parent.querySelector(selector);
      if (el) {
        resolve(el);
        observer.disconnect();
      }
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
    });
  });
};

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