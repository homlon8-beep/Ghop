const fs = require('fs');
const path = require('path');
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
    const puppeteer = require('puppeteer');
    console.log(`[FlowBrowserEngine] Launching Puppeteer bundled Chrome...`);
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--single-process',
        '--window-size=1280,800'
      ],
      defaultViewport: { width: 1280, height: 800 }
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

    // Capture screenshot on error for debugging
    const screenshotPath = path.join(this.outputDir, 'flow_debug_screenshot.png');

    try {
      console.log(`[FlowBrowserEngine] Setting ${cookiesList.length} authenticated Google cookies...`);
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

      const pageTitle = await page.title();
      console.log(`[FlowBrowserEngine] Page loaded: "${pageTitle}" (${page.url()})`);

      if (page.url().includes('accounts.google.com/ServiceLogin')) {
        await page.screenshot({ path: screenshotPath });
        throw new Error('Google session expired or rejected. Sign-in required.');
      }

      // 1. Check if on Dashboard and click "New project"
      const hasPromptBox = await page.$('[role="textbox"][contenteditable="true"]');
      if (!hasPromptBox) {
        console.log(`[FlowBrowserEngine] Inside dashboard. Clicking "New project" button...`);
        const clickedNewProject = await page.evaluate(() => {
          const btns = [...document.querySelectorAll('button, [role="button"]')];
          const newProjectBtn = btns.find(b => /new project/i.test(b.textContent || ''));
          if (newProjectBtn) {
            newProjectBtn.click();
            return true;
          }
          return false;
        });

        if (clickedNewProject) {
          console.log(`[FlowBrowserEngine] Clicked "New project". Waiting for editor to mount...`);
          await new Promise(r => setTimeout(r, 4000));
        }
      }

      // 2. Wait for prompt editor
      console.log(`[FlowBrowserEngine] Waiting for prompt editor to mount...`);
      await page.waitForSelector('[role="textbox"][contenteditable="true"]', { timeout: 30000 });

      // 3. Select Video mode & 9:16 ratio via DOM evaluation
      console.log(`[FlowBrowserEngine] Setting Video mode & 9:16 vertical ratio...`);
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button, [role="button"]')];
        const settingsBtn = btns.find(b => /crop_|video|image/i.test(b.textContent || ''));
        if (settingsBtn) settingsBtn.click();
      });

      await new Promise(r => setTimeout(r, 600));

      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button, [role="button"], [role="menuitem"], [role="option"]')];
        const videoBtn = btns.find(b => /video/i.test(b.textContent || '') && !/image/i.test(b.textContent || ''));
        if (videoBtn) videoBtn.click();
      });

      await new Promise(r => setTimeout(r, 400));

      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button, [role="button"], [role="menuitem"], [role="option"]')];
        const ratioBtn = btns.find(b => /9:16/i.test(b.textContent || ''));
        if (ratioBtn) ratioBtn.click();
      });

      await page.keyboard.press('Escape');
      await new Promise(r => setTimeout(r, 400));

      // 4. Type prompt into contenteditable div
      console.log(`[FlowBrowserEngine] Entering prompt into Veo 3.1...`);
      const promptBox = await page.$('[role="textbox"][contenteditable="true"]');
      await promptBox.click();
      await page.keyboard.down('Control');
      await page.keyboard.press('A');
      await page.keyboard.up('Control');
      await page.keyboard.press('Backspace');

      await page.type('[role="textbox"][contenteditable="true"]', prompt, { delay: 10 });
      await new Promise(r => setTimeout(r, 500));

      // 5. Submit generation (Click Create)
      console.log(`[FlowBrowserEngine] Clicking "Create" button...`);
      const submitted = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button, [role="button"]')];
        const createBtn = btns.find(b => /create/i.test(b.textContent || '') && !b.disabled && b.getAttribute('aria-disabled') !== 'true');
        if (createBtn) {
          createBtn.click();
          return true;
        }
        return false;
      });

      if (!submitted) {
        await page.screenshot({ path: screenshotPath });
        throw new Error('Create button not clickable or prompt was rejected by Flow.');
      }

      // 6. Monitor generation output (poll for video src or download link)
      console.log(`[FlowBrowserEngine] Video generation submitted to Veo 3.1! Polling output (up to 180s)...`);

      let videoUrl = null;
      const startTime = Date.now();
      const maxWaitMs = 180000;

      while (Date.now() - startTime < maxWaitMs) {
        const found = await page.evaluate(() => {
          // Check for video tag
          const vids = [...document.querySelectorAll('video')];
          for (const v of vids) {
            const src = v.currentSrc || v.src;
            if (src && !src.startsWith('blob:')) return src;
          }

          // Check for download button or media link
          const links = [...document.querySelectorAll('a[download], a[href*="media"], button')];
          const dl = links.find(l => (l.href && l.href.includes('media')) || /download/i.test(l.textContent || ''));
          if (dl && dl.href) return dl.href;

          return null;
        });

        if (found) {
          videoUrl = found;
          break;
        }

        // Check for error markers
        const errorText = await page.evaluate(() => {
          const body = document.body.textContent || '';
          if (/unusual activity|rate limit/i.test(body)) return 'Rate limited by Google Flow';
          if (/insufficient credits|no credits/i.test(body)) return 'Out of Google Flow credits';
          if (/violates|content policy/i.test(body)) return 'Prompt blocked by Google content policy';
          return null;
        });

        if (errorText) {
          await page.screenshot({ path: screenshotPath });
          throw new Error(`Google Flow reported: ${errorText}`);
        }

        await new Promise(r => setTimeout(r, 3000));
      }

      if (!videoUrl) {
        await page.screenshot({ path: screenshotPath });
        throw new Error('Timed out waiting for Flow Veo 3.1 generation output (180s). Screenshot captured.');
      }

      console.log(`[FlowBrowserEngine] ✅ Veo 3.1 Video generated: ${videoUrl}`);

      const filename = `veo_reel_${Date.now()}.mp4`;
      const outputPath = path.join(this.outputDir, filename);

      // Download the video stream inside browser session
      const base64Data = await page.evaluate(async (url) => {
        const res = await fetch(url);
        const blob = await res.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
      }, videoUrl);

      const cleanBase64 = base64Data.replace(/^data:video\/\w+;base64,/, '');
      fs.writeFileSync(outputPath, Buffer.from(cleanBase64, 'base64'));

      console.log(`[FlowBrowserEngine] Successfully downloaded Veo 3.1 video to: ${outputPath} (${fs.statSync(outputPath).size} bytes)`);

      return {
        success: true,
        source: 'google-flow-veo-3.1',
        videoPath: outputPath,
        durationSec: 8.0,
        prompt
      };
    } catch (err) {
      try {
        await page.screenshot({ path: screenshotPath });
      } catch (e) {}
      throw err;
    } finally {
      await browser.close();
    }
  }
}

module.exports = new FlowBrowserEngine();
