const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');

test('launch app and check title', async () => {
    const electronApp = await electron.launch({
        args: [path.join(__dirname, '../src/main.js')],
    });

    const window = await electronApp.firstWindow();

    // Check the title
    expect(await window.title()).toBe('LSTro - Electron + Playwright');

    // Check if main content is visible
    const heroText = await window.textContent('.hero h2');
    expect(heroText).toBe('Electron + Playwright');

    // Test interaction
    await window.click('#test-btn');
    const btnText = await window.textContent('#test-btn');
    expect(btnText).toBe('Clicked!');

    await electronApp.close();
});
