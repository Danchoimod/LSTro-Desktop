const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const { startServer } = require('./automation');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 900,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false, // Set to false to match the old project structure if needed
        },
        title: "Quản lý Khai báo Lưu trú",
        autoHideMenuBar: true,
        icon: path.join(__dirname, 'renderer', 'assets', 'app_icon.ico')
    });

    // Load the login page from the renderer folder
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'login.html'));

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

let chromeProcess;

function startChrome() {
    console.log("Đang mở Chrome với Remote Debugging...");
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const userDataDir = 'C:\\temp\\automation_profile';

    chromeProcess = spawn(chromePath, [
        '--remote-debugging-port=9222',
        `--user-data-dir=${userDataDir}`,
        '--no-first-run',
        '--no-default-browser-check'
    ]);

    chromeProcess.on('error', (err) => {
        console.error("Lỗi khi mở Chrome:", err.message);
        console.log("MẸO: Đảm bảo Chrome được cài đặt tại C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
    });
}

// Start the automation server (Node.js version of main.py)
app.on('ready', () => {
    console.log("Starting Automation Server...");
    startChrome();
    startServer();
    createWindow();
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('quit', () => {
    if (chromeProcess) {
        chromeProcess.kill();
    }
});

app.on('activate', function () {
    if (mainWindow === null) {
        createWindow();
    }
});
