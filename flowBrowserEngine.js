const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const config = require('./config');

class FlowBrowserEngine {
  constructor() {
    this.accountsFile = config.FLOW.ACCOUNTS_FILE;
    this.outputDir = config.OUTPUT_DIR;
  }

  loadSession() {
    // 1. Check environment variable first (for Render cloud)
    if (process.env.FLOW_COOKIES_JSON) {
      try {
        const parsed = JSON.parse(process.env.FLOW_COOKIES_JSON);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {}
    }

    // 2. Check flow_accounts.json
    try {
      if (fs.existsSync(this.accountsFile)) {
        const data = JSON.parse(fs.readFileSync(this.accountsFile, 'utf8'));
        const acc = data.accounts?.[0];
        if (acc && acc.cookiesList && Array.isArray(acc.cookiesList)) {
          return acc.cookiesList;
        }
      }
    } catch (e) {
      console.warn(`[FlowBrowserEngine] Could not read accounts file: ${e.message}`);
    }

    // 3. Fallback to /sdcard/Download/cookies.json if on Termux
    const sdcardPath = '/sdcard/Download/cookies.json';
    try {
      if (fs.existsSync(sdcardPath)) {
        const raw = JSON.parse(fs.readFileSync(sdcardPath, 'utf8'));
        const allowedDomains = ['.google.com', 'google.com', 'flow.google.com', '.flow.google.com'];
        return raw.filter(c => allowedDomains.includes(c.domain));
      }
    } catch (e) {}

    return null;
  }

  async launchBrowser() {
    let executablePath;
    try {
      executablePath = await chromium.executablePath();
    } catch (e) {
      // Fallback paths on standard Linux/Termux if @sparticuz/chromium is unavailable
      const possiblePaths = [
        process.env.CHROME_PATH,
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium'
      ].filter(Boolean);
      executablePath = possiblePaths.find(p => fs.existsSync(p));
    }

    if (!executablePath) {
      throw new Error('Chromium executable not found. Ensure @sparticuz/chromium or system chrome is available.');
    }

    console.log(`[FlowBrowserEngine] Launching Chromium from: ${executablePath}`);

    const browser = await puppeteer.launch({
      executablePath,
      args: [
        ...chromium.args,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
        '--no-zygote',
        '--window-size=1280,800'
      ],
      defaultViewport: { width: 1280, height: 800 },
      headless: chromium.headless || true
    });

    return browser;
  }

  async generateVeoVideo(prompt, options = {}) {
    const cookiesList = this.loadSession();
    if (!cookiesList || cookiesList.length === 0) {
      throw new Error('No authenticated Google Flow cookies found. Please provide session cookies.');
    }

    const browser = await this.launchBrowser();
    const page = await browser.newPage();

    try {
      console.log(`[FlowBrowserEngine] Setting ${cookiesList.length} authenticated Google cookies...`);
      // Format cookies for Puppeteer
      const puppeteerCookies = cookiesList.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain.startsWith('.') ? c.domain : `.${c.domain}`,
        path: c.path || '/',
        secure: Boolean(c.secure),
        httpOnly: Boolean(c.httpOnly)
      }));

      await page.setCookie(...puppeteerCookies);

      // Navigate to Google Flow
      console.log(`[FlowBrowserEngine] Navigating to https://flow.google.com/...`);
      await page.goto('https://flow.google.com/', {
        waitUntil: 'networkidle2',
        timeout: 45000
      });

      // Verify authenticated session
      const pageTitle = await page.title();
      console.log(`[FlowBrowserEngine] Page loaded: "${pageTitle}" (${page.url()})`);

      // Check if redirected to login
      if (page.url().includes('accounts.google.com/ServiceLogin')) {
        throw new Error('Google session expired or rejected. Sign-in required.');
      }

      // Check for prompt box
      console.log(`[FlowBrowserEngine] Locating prompt editor...`);
      await page.waitForSelector('[role="textbox"][contenteditable="true"]', { timeout: 25000 });

      // Click settings to select Video mode and Veo 3.1
      console.log(`[FlowBrowserEngine] Configuring generation settings (Video Mode, Veo 3.1, 9:16)...`);
      const settingsBtn = await page.$('button:has-text("crop_")');
      if (settingsBtn) {
        await settingsBtn.click();
        await page.waitForTimeout(600);

        // Select Video Mode
        const videoModeBtn = await page.$('button:has-text("Video"), [role="button"]:has-text("Video")');
        if (videoModeBtn) {
          await videoModeBtn.click();
          await page.waitForTimeout(400);
        }

        // Select 9:16 vertical ratio
        const ratioBtn = await page.$('button:has-text("9:16"), [role="button"]:has-text("9:16")');
        if (ratioBtn) {
          await ratioBtn.click();
          await page.waitForTimeout(300);
        }

        // Close popover
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }

      // Focus prompt box and type prompt
      console.log(`[FlowBrowserEngine] Typing surreal prompt into Flow Veo 3.1...`);
      const promptBox = await page.$('[role="textbox"][contenteditable="true"]');
      await promptBox.click();
      await page.keyboard.down('Control');
      await page.keyboard.press('A');
      await page.keyboard.up('Control');
      await page.keyboard.press('Backspace');

      await page.type('[role="textbox"][contenteditable="true"]', prompt, { delay: 15 });
      await page.waitForTimeout(500);

      // Click Create button
      console.log(`[FlowBrowserEngine] Submitting generation to Google Veo 3.1...`);
      const createBtn = await page.$('button:has-text("Create")');
      if (!createBtn) {
        throw new Error('Could not find Create button on Flow page');
      }
      await createBtn.click();

      // Listen for video generation result
      console.log(`[FlowBrowserEngine] Generation queued. Waiting for Veo 3.1 video result (up to 180s)...`);

      let videoUrl = null;
      const startTime = Date.now();
      const maxWaitMs = 180000;

      while (Date.now() - startTime < maxWaitMs) {
        const videoSrc = await page.evaluate(() => {
          const vids = [...document.querySelectorAll('video')];
          const active = vids.find(v => (v.src && !v.src.includes('blob:')) || (v.currentSrc && !v.currentSrc.includes('blob:')));
          if (active) return active.src || active.currentSrc;

          // Check if download link or media redirect is available
          const links = [...document.querySelectorAll('a[download], button:has-text("Download")')];
          const dl = links.find(l => l.href && l.href.includes('media'));
          if (dl) return dl.href;

          return null;
        });

        if (videoSrc) {
          videoUrl = videoSrc;
          break;
        }

        await page.waitForTimeout(3000);
      }

      if (!videoUrl) {
        throw new Error('Timed out waiting for Flow Veo 3.1 generation output');
      }

      console.log(`[FlowBrowserEngine] ✅ Veo 3.1 Video generated: ${videoUrl}`);

      // Download the video
      const filename = `veo_reel_${Date.now()}.mp4`;
      const outputPath = path.join(this.outputDir, filename);

      const downloadRes = await page.evaluate(async (url) => {
        const res = await fetch(url);
        const blob = await res.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
      }, videoUrl);

      const base64Data = downloadRes.replace(/^data:video\/\w+;base64,/, '');
      fs.writeFileSync(outputPath, Buffer.from(base64Data, 'base64'));

      console.log(`[FlowBrowserEngine] Successfully downloaded Veo 3.1 video to: ${outputPath}`);

      return {
        success: true,
        source: 'google-flow-veo-3.1',
        videoPath: outputPath,
        durationSec: 8.0,
        prompt
      };
    } finally {
      await browser.close();
    }
  }
}

module.exports = new FlowBrowserEngine();
