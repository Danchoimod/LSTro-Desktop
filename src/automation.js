const { chromium } = require('playwright');
const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');

const app = express();
app.use(cors());
app.use(bodyParser.json());

let sharedPage = null;
let sharedBrowser = null;
let isProcessing = false;
let shouldStop = false;
let selectedBranch = "2";
const dataQueue = [];

// WebSocket Server
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const clients = new Set();

function broadcast(message) {
    const data = JSON.stringify(message);
    for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    }
}

wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('[WS] Client connected');

    // Send current state
    sendCurrentQrToNewClient();

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            if (data.action === 'REQUEST_QR') {
                console.log('[WS] Frontend requested new QR');
                resendQrCode();
            }
        } catch (e) {
            console.error('[WS] Error parsing message:', e);
        }
    });

    ws.on('close', () => {
        clients.delete(ws);
    });
});

// Playwright Helpers
async function fillSelect2(page, containerSelector, searchText) {
    await page.waitForSelector(containerSelector, { state: 'visible', timeout: 5000 });
    await page.click(containerSelector);
    const searchInput = ".select2-container--open input.select2-search__field";
    await page.waitForSelector(searchInput, { state: 'visible', timeout: 3000 });
    await page.fill(searchInput, searchText);
    await new Promise(r => setTimeout(r, 500));

    const resultXpath = `//li[contains(@class, 'select2-results__option') and (normalize-space(text())='${searchText}' or contains(.,'${searchText}'))]`;
    await page.waitForSelector(resultXpath, { state: 'visible', timeout: 3000 });
    await page.click(resultXpath);

    try {
        await page.waitForSelector(".select2-container--open", { state: 'hidden', timeout: 2000 });
    } catch (e) {
        await page.keyboard.press("Escape");
    }
    console.log(`   [+] Selected: ${searchText}`);
}

async function selectDropdownHuman(page, selector, labelText) {
    try {
        console.log(`   [+] Selecting: ${labelText}`);
        await page.waitForSelector(`${selector}:not([disabled])`, { timeout: 15000 });
        await page.selectOption(selector, { label: labelText });
        await page.dispatchEvent(selector, "change");
        await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
        console.error(`   [!] Error selecting ${labelText}:`, e.message);
    }
}

async function autoFillLocationAndOpenForm() {
    if (!sharedPage) return;
    broadcast({ type: "SETUP_STARTED" });
    try {
        const isSelectionPage = await sharedPage.$("select#accomStay_cboPROVINCE_ID");
        if (!isSelectionPage) {
            console.log("[SYSTEM] Not on selection page. Navigating back...");
            await sharedPage.goto("https://dichvucong.bocongan.gov.vn/bo-cong-an/tiep-nhan-online/chon-truong-hop-ho-so?ma-thu-tuc-public=26346");
            await sharedPage.waitForLoadState("networkidle");
        }
        console.log(`\n[STEP 1] Setup Accommodation (Branch ${selectedBranch})`);
        await selectDropdownHuman(sharedPage, "select#accomStay_cboPROVINCE_ID", "Thành phố Cần Thơ");
        await selectDropdownHuman(sharedPage, "select#accomStay_cboADDRESS_ID", "Phường Long Tuyền");
        await selectDropdownHuman(sharedPage, "select#accomStay_cboACCOMMODATION_TYPE", "Nhà ngăn phòng cho thuê");

        let branchName = "";
        if (selectedBranch === "1") {
            await selectDropdownHuman(sharedPage, "select#accomStay_cboNAME", "Hộ Kinh Doanh Nhà Trọ Tâm An 1");
            branchName = "Hộ Kinh Doanh Nhà Trọ Tâm An 1";
        } else {
            await selectDropdownHuman(sharedPage, "select#accomStay_cboNAME", "NHÀ TRỌ TÂM AN 2");
            branchName = "NHÀ TRỌ TÂM AN 2";
        }

        broadcast({
            type: "BRANCH_SELECTED",
            branch: selectedBranch,
            message: `[OK] Selected: ${branchName}`
        });
    } catch (e) {
        broadcast({ type: "BRANCH_ERROR", message: e.message });
    }
}

function abortIfStopped() {
    if (shouldStop) {
        const err = new Error("STOPPED_BY_USER");
        err.isStop = true;
        throw err;
    }
}

async function fillGuestData(taskItem) {
    if (!sharedPage) return;
    const { data, index } = taskItem;

    try {
        broadcast({ type: "PROCESSING", index });
        abortIfStopped();

        if (!(await sharedPage.isVisible("#addpersonLT"))) {
            await sharedPage.click("a#btnAddPersonLT");
            await sharedPage.waitForSelector("#addpersonLT", { state: 'visible', timeout: 5000 });
        }
        abortIfStopped();

        await sharedPage.fill("input#guest_txtCITIZENNAME", (data.ho_ten || '').toUpperCase(), { timeout: 3000 });
        await sharedPage.fill("input#guest_txtIDCARD_NUMBER", data.cccd || '', { timeout: 3000 });
        abortIfStopped();

        const dob = data.ngay_birth || data.ngay_sinh || '';
        if (dob) {
            await sharedPage.evaluate((dateVal) => {
                const el = document.getElementById('guest_txtDOB');
                if (el) {
                    el.value = dateVal;
                    if (window.jQuery && jQuery(el).data('datepicker')) { jQuery(el).datepicker('update', dateVal); }
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    el.blur();
                }
            }, dob);
        }
        abortIfStopped();

        await fillSelect2(sharedPage, "#select2-guest_cboGENDER_ID-container", data.gioi_tinh || '');
        abortIfStopped();
        await fillSelect2(sharedPage, "#select2-guest_cboCOUNTRY-container", data.quoc_gia || 'Cộng hòa xã hội chủ nghĩa Việt Nam');
        abortIfStopped();
        await fillSelect2(sharedPage, "#select2-guest_cboRDPROVINCE_ID-container", data.tinh || '');
        abortIfStopped();
        await fillSelect2(sharedPage, "#select2-guest_cboRDADDRESS_ID-container", data.xa || '');
        abortIfStopped();

        const nationality = data.quoc_tich || 'Việt Nam';
        await sharedPage.waitForSelector("#guest_mulNATIONALITY", { state: 'visible', timeout: 5000 });
        await sharedPage.evaluate((nat) => {
            const select = document.getElementById('guest_mulNATIONALITY');
            if (select) {
                for (let option of select.options) {
                    if (option.text.includes(nat) || option.text === nat) {
                        option.selected = true; break;
                    }
                }
                select.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, nationality);
        abortIfStopped();

        await fillSelect2(sharedPage, "#select2-guest_cboETHNIC_ID-container", data.dan_toc || 'Kinh');
        abortIfStopped();
        await fillSelect2(sharedPage, "#select2-guest_cboOCCUPATION-container", data.nghe_nghiep || 'Tự do');
        abortIfStopped();
        await sharedPage.fill("input#guest_txtROOM", data.so_phong || '', { timeout: 3000 });
        await sharedPage.fill("input#guest_txtPLACE_OF_WORK", data.noi_lam_viec || '', { timeout: 3000 });
        await sharedPage.fill("textarea#guest_txtREASON", data.ly_do || 'làm việc', { timeout: 3000 });
        await sharedPage.fill("textarea#guest_txtRDADDRESS", data.dia_chi_chi_tiet || '', { timeout: 3000 });
        abortIfStopped();

        if (data.thoi_gian_luu_tru) {
            await sharedPage.evaluate((sd) => {
                const el = document.getElementById('guest_txtSTART_DATE');
                if (el) el.value = sd;
            }, data.thoi_gian_luu_tru);
        }
        if (data.luu_tru_den) {
            await sharedPage.evaluate((ed) => {
                const el = document.getElementById('guest_txtEND_DATE');
                if (el) el.value = ed;
            }, data.luu_tru_den);
        }
        abortIfStopped();

        await sharedPage.focus("input#guest_txtCITIZENNAME");
        await sharedPage.evaluate(() => document.activeElement.blur());
        abortIfStopped();

        await sharedPage.click("#btnSaveNLT", { timeout: 3000 });
        console.log(`[SUCCESS] Saved: ${data.ho_ten}`);
        broadcast({ type: "COMPLETED", index });

        const delay = (ms) => new Promise(resolve => {
            const start = Date.now();
            const interval = setInterval(() => {
                if (shouldStop || Date.now() - start >= ms) {
                    clearInterval(interval);
                    resolve();
                }
            }, 100);
        });
        await delay(2000);
        abortIfStopped();

        try {
            await sharedPage.click("a#btnAddPersonLT", { timeout: 3000 });
            await sharedPage.waitForSelector("#addpersonLT", { state: 'visible', timeout: 10000 });
            await delay(1000);
        } catch (e) { }

    } catch (e) {
        if (e.isStop) {
            console.log(`[STOP] Aborted processing for ${data.ho_ten}`);
            return;
        }
        broadcast({ type: "ERROR", index });
        console.error(`[SKIP] Error for ${data.ho_ten}:`, e.message);
    }
}

async function processQueue() {
    isProcessing = true;
    shouldStop = false;
    while (dataQueue.length > 0) {
        if (shouldStop) {
            console.log("[SYSTEM] Automation stopped by user.");
            dataQueue.length = 0; // Clear the queue
            broadcast({ type: "STOPPED" });
            break;
        }
        const taskItem = dataQueue.shift();
        await fillGuestData(taskItem);
    }
    isProcessing = false;
}

app.post('/send-to-web', (req, res) => {
    const { items, branch } = req.body;
    if (branch) selectedBranch = branch;
    (items || []).forEach((item, idx) => {
        dataQueue.push({ index: idx, data: item });
    });
    if (!isProcessing) processQueue();
    res.json({ status: "started" });
});

app.post('/stop', (req, res) => {
    shouldStop = true;
    res.json({ status: "stopping" });
});

app.post('/set-branch', (req, res) => {
    const { branch } = req.body;
    if (branch) selectedBranch = branch;
    autoFillLocationAndOpenForm();
    res.json({ status: "success" });
});

async function extractQrCode(startMonitor = true) {
    if (!sharedPage) return false;
    try {
        await new Promise(r => setTimeout(r, 3000));
        const qrSelectors = ["img[alt='qr_images']", "img[src*='data:image']", "canvas"];

        let qrImageBase64 = null;
        for (const selector of qrSelectors) {
            try {
                const element = await sharedPage.waitForSelector(selector, { timeout: 3000 });
                if (element) {
                    qrImageBase64 = await sharedPage.evaluate((sel) => {
                        const el = document.querySelector(sel);
                        if (el && el.tagName === 'IMG') return el.src;
                        if (el && el.tagName === 'CANVAS') return el.toDataURL();
                        return null;
                    }, selector);
                    if (qrImageBase64) break;
                }
            } catch (e) { }
        }

        if (qrImageBase64) {
            broadcast({ type: "QR_CODE", data: qrImageBase64 });
            if (startMonitor) monitorQrExpiration();
            return true;
        }
        return false;
    } catch (e) { return false; }
}

async function monitorQrExpiration() {
    if (!sharedPage) return;
    try {
        const reloadSelectors = ["button:has-text('Tải lại')", "button:has(svg#ic_refresh)", "button.bg-red100"];
        let reloadButton = null;
        for (const selector of reloadSelectors) {
            try {
                reloadButton = await sharedPage.waitForSelector(selector, { state: 'visible', timeout: 300000 });
                if (reloadButton) break;
            } catch (e) { }
        }

        if (reloadButton) {
            broadcast({ type: "QR_EXPIRED" });
            await new Promise(r => setTimeout(r, 2000));
            await reloadButton.click();
            await new Promise(r => setTimeout(r, 3000));
            await extractQrCode(false);
            monitorQrExpiration();
        }
    } catch (e) { }
}

async function resendQrCode() {
    if (!sharedPage) return;
    const url = sharedPage.url();
    if (url.includes("dichvucong.bocongan.gov.vn") || url.includes("sso.dancuquocgia.gov.vn")) {
        const qrOk = await extractQrCode(false);
        if (!qrOk) {
            await sharedPage.reload();
            await new Promise(r => setTimeout(r, 2000));
            try {
                const loginBtn = await sharedPage.waitForSelector("div.login-IDP.BCA[onclick*='handleNoDomain']", { timeout: 5000 });
                if (loginBtn) {
                    await loginBtn.click();
                    await new Promise(r => setTimeout(r, 2000));
                    await extractQrCode();
                }
            } catch (e) { }
        }
    }
}

async function sendCurrentQrToNewClient() {
    if (!sharedPage) return;
    const url = sharedPage.url();
    if (url.includes("portal/p/home/thong-bao-luu-tru.html")) {
        broadcast({ type: "LOGIN_SUCCESS" });
    } else {
        await extractQrCode(false);
    }
}

async function waitForLoginSuccess() {
    if (!sharedPage) return;
    const targetUrl = "https://dichvucong.bocongan.gov.vn/bo-cong-an/tiep-nhan-online/chon-truong-hop-ho-so?ma-thu-tuc-public=26346";
    for (let i = 0; i < 60; i++) {
        const url = sharedPage.url();
        if (url.includes("dich-vu-cong/cong-dan") || url.includes("portal/p/home/thong-bao-luu-tru.html")) {
            broadcast({ type: "LOGIN_SUCCESS" });
            await new Promise(r => setTimeout(r, 2000));
            await sharedPage.goto(targetUrl);
            await sharedPage.waitForLoadState("networkidle");
            await autoFillLocationAndOpenForm();
            return true;
        }
        await new Promise(r => setTimeout(r, 2000));
    }
    return false;
}

async function handleQrExtraction() {
    let connected = false;
    let retries = 0;
    const maxRetries = 10;

    console.log("[SYSTEM] Connecting to Chrome via CDP (port 9222)...");

    while (!connected && retries < maxRetries) {
        try {
            sharedBrowser = await chromium.connectOverCDP("http://localhost:9222");
            connected = true;
        } catch (e) {
            retries++;
            console.log(`[SYSTEM] Waiting for Chrome... (Attempt ${retries}/${maxRetries})`);
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    if (!connected) {
        console.error("[ERROR] Could not connect to Chrome after several attempts.");
        return;
    }

    try {
        const contexts = sharedBrowser.contexts();
        const context = contexts.length > 0 ? contexts[0] : await sharedBrowser.newContext();
        const pages = context.pages();
        sharedPage = pages.length > 0 ? pages[0] : await context.newPage();

        console.log("[SYSTEM] Successfully connected to Chrome!");

        await sharedPage.goto("https://dichvucong.bocongan.gov.vn/bo-cong-an/tiep-nhan-online/chon-truong-hop-ho-so?ma-thu-tuc-public=26346");
        await sharedPage.waitForLoadState("networkidle");

        try {
            await sharedPage.waitForSelector("select#accomStay_cboPROVINCE_ID", { timeout: 3000 });
            broadcast({ type: "LOGIN_SUCCESS" });
            await autoFillLocationAndOpenForm();
            return;
        } catch (e) { }

        try {
            const loginBtn = await sharedPage.waitForSelector("div.login-IDP.BCA[onclick*='handleNoDomain']", { state: 'visible', timeout: 5000 });
            if (loginBtn) {
                await loginBtn.click();
                await new Promise(r => setTimeout(r, 2000));
                if (await extractQrCode()) await waitForLoginSuccess();
            }
        } catch (e) { }
    } catch (e) {
        console.error("[ERROR]", e.message);
    }
}

function startServer() {
    server.listen(8000, '0.0.0.0', () => {
        console.log(`[SERVER] Ready on port 8000`);
        handleQrExtraction();
    });
}

module.exports = { startServer };
