window.addEventListener('DOMContentLoaded', () => {
    const electronV = document.getElementById('electron-v');
    const chromeV = document.getElementById('chrome-v');
    const nodeV = document.getElementById('node-v');
    const testBtn = document.getElementById('test-btn');

    if (window.electronAPI) {
        electronV.innerText = window.electronAPI.electronVersion();
        chromeV.innerText = window.electronAPI.chromeVersion();
        nodeV.innerText = window.electronAPI.nodeVersion();
    }

    testBtn.addEventListener('click', () => {
        testBtn.innerText = 'Clicked!';
        testBtn.style.background = '#10b981';

        setTimeout(() => {
            testBtn.innerText = 'Test Interaction';
            testBtn.style.background = '';
        }, 2000);
    });
});
