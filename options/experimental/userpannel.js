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
    loadingDiv.id = 'loading-div';

    // Text
    const textDiv = document.createElement('div');
    textDiv.className = 'loading-text';
    textDiv.innerText = 'Loading Steam interface';

    // Radial Loader
    const loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'radial-loader';

    loadingDiv.appendChild(loadingIndicator);
    loadingDiv.appendChild(textDiv);

    // Apply to body
    document.body.appendChild(loadingDiv);

    // Timer
    setTimeout(() => {
        document.body.removeChild(loadingDiv);
    }, 3000);
};

// Patch to body
waitForElement('.Rp8QOGJ2DypeDniMnRBhr').then(() => {
    if (!document.getElementById('loading-div')) {
        createLoadingDiv();
    }
});



// Move Elements
(async () => {
    var gameListSidebar = await waitForElement('._3x1HklzyDs4TEjACrRO2tB');


    // Userpannel
    var userPannel = await waitForElement('._3cykd-VfN_xBxf3Qxriccm._1-9sir4j_KQiMqdkZjQN0u');
    var downloadBar = await waitForElement('._1_yS5UP7el0aN4vntx3dx');
    var friendButton = await waitForElement('._1TdaAqMFadi0UTqilrkelR')
    var parent = await waitForElement('._3cykd-VfN_xBxf3Qxriccm');

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'userpannel-buttoncontainer';
  
    const buttons = parent.querySelectorAll('div._3cykd-VfN_xBxf3Qxriccm > div');
    const buttonsToMove = Array.from(buttons).filter((button) => {
        return button.querySelector('._2Szzh5sKyGgnLUR870zbDE');
    });
  
    buttonsToMove.forEach((button) => {
        buttonContainer.appendChild(button);
    });
  
    gameListSidebar.appendChild(downloadBar);
    gameListSidebar.appendChild(userPannel);
    buttonContainer.appendChild(friendButton);
    parent.appendChild(buttonContainer);


    // Download bar
    //var downloadingText = await waitForElement('._1sCy-pm412Smb0wJx0W-4');
    //var downloadingIconDiv = await waitForElement('._2VtAqT03BpBsVdmxwptn9D ._1KrJ3sFAqPBN9mfpaNTU5F');
    
    //downloadingIconDiv.appendChild(downloadingText);
})();