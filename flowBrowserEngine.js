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
    const cacheDir = process.env.PUPPETEER_CACHE_DIR || path.join(__dirname, '.cache', 'puppeteer');
    console.log(`[FlowBrowserEngine] Launching Puppeteer with cacheDir: ${cacheDir}`);

    let executablePath = null;
    try {
      function findChrome(dir) {
        if (!fs.existsSync(dir)) return null;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) {
            const found = findChrome(full);
            if (found) return found;
          } else if (e.name === 'chrome' || e.name === 'chrome.exe' || e.name === 'chromium') {
            return full;
          }
        }
        return null;
      }
      executablePath = findChrome(cacheDir);
      if (executablePath) {
        console.log(`[FlowBrowserEngine] Found Chrome executable at: ${executablePath}`);
      }
    } catch (e) {
      console.warn(`[FlowBrowserEngine] Error finding chrome: ${e.message}`);
    }

    const launchOptions = {
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
    };
    if (executablePath) {
      launchOptions.executablePath = executablePath;
    }

    const browser = await puppeteer.launch(launchOptions);
    return browser;
  }

  async generateVeoVideo(prompt, options = {}) {
    const cookiesList = this.loadSession();
    if (!cookiesList || cookiesList.length === 0) {
      throw new Error('No authenticated Google Flow cookies found. Please provide session cookies.');
    }

    const browser = await this.launchBrowser();
    const page = await browser.newPage();

    // Log significant network events for debugging
    page.on('request', req => {
      const u = req.url();
      if (u.includes('aisandbox') || u.includes('flow') || u.includes('stream') || u.includes('generate')) {
        console.log(`[Flow Network REQ] ${req.method()} ${u.slice(0, 140)}`);
      }
    });

    let capturedVideoUrl = null;
    page.on('response', async res => {
      const u = res.url();
      const ct = res.headers()['content-type'] || '';
      if (ct.includes('video/') || u.includes('.mp4') || (u.includes('flow-content.google') && (u.includes('video') || u.includes('mp4')))) {
        console.log(`[Flow Captured Video URL] ${u.slice(0, 120)}`);
        capturedVideoUrl = u;
      }
      if (u.includes('aisandbox') || u.includes('stream') || u.includes('generate')) {
        console.log(`[Flow Network RES] ${res.status()} ${u.slice(0, 140)}`);
      }
    });

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

      // 5. Submit generation (Press Enter & Click Arrow Button)
      console.log(`[FlowBrowserEngine] Submitting generation to Veo 3.1...`);
      await page.keyboard.press('Enter');
      await new Promise(r => setTimeout(r, 800));

      const submitted = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button, [role="button"]')];

        for (const b of btns) {
          const text = (b.textContent || '').trim().toLowerCase();
          const label = (b.getAttribute('aria-label') || '').toLowerCase();
          const html = b.innerHTML.toLowerCase();

          if (label.includes('send') || label.includes('generate') || label.includes('submit') || label.includes('create')) {
            b.click();
            return true;
          }
          if (html.includes('arrow_forward') || html.includes('send') || html.includes('arrow_right')) {
            b.click();
            return true;
          }
        }

        const promptBox = document.querySelector('[role="textbox"][contenteditable="true"]');
        if (promptBox) {
          let container = promptBox.parentElement;
          for (let i = 0; i < 4 && container; i++) {
            const cBtns = [...container.querySelectorAll('button, [role="button"]')];
            if (cBtns.length > 0) {
              const lastBtn = cBtns[cBtns.length - 1];
              lastBtn.click();
              return true;
            }
            container = container.parentElement;
          }
        }

        return false;
      });

      console.log(`[FlowBrowserEngine] Submission triggered (submitBtnClicked: ${submitted}). Waiting for generation pipeline...`);
      await new Promise(r => setTimeout(r, 2000));
      try { await page.screenshot({ path: screenshotPath }); } catch (e) {}

      // 6. Monitor generation output (poll for video src or download link)
      console.log(`[FlowBrowserEngine] Polling Flow Veo 3.1 generation output (up to 300s)...`);

      let videoInfo = null;
      const startTime = Date.now();
      const maxWaitMs = 300000;
      let loopCount = 0;

      while (Date.now() - startTime < maxWaitMs) {
        loopCount++;
        if (loopCount % 3 === 0) {
          try { await page.screenshot({ path: screenshotPath }); } catch (e) {}
        }

        const progressInfo = await page.evaluate(() => {
          const texts = [...document.querySelectorAll('div, span, p')].map(e => e.textContent || '');
          const match = texts.find(t => /\b(\d+%\s*complete|generating|creating|rendering)\b/i.test(t));
          return match ? match.trim().slice(0, 80) : null;
        });

        if (progressInfo) {
          console.log(`[FlowBrowserEngine] Canvas status: "${progressInfo}"`);
        }

        // Check if captured directly via network response
        if (capturedVideoUrl) {
          console.log(`[FlowBrowserEngine] Detected video stream URL from network: ${capturedVideoUrl.slice(0, 80)}`);
          videoInfo = { type: 'url', url: capturedVideoUrl };
          break;
        }

        // Once card thumbnail appears and rendering is complete (or no progress percentage), click card to mount video player
        if (loopCount >= 2 && !progressInfo) {
          await page.evaluate(() => {
            const imgs = [...document.querySelectorAll('img')].filter(i => i.src && i.src.includes('flow-content.google'));
            if (imgs.length > 0) {
              const card = imgs[0].closest('[role="button"], button') || imgs[0].parentElement || imgs[0];
              card.click();
            } else {
              const playIcon = [...document.querySelectorAll('*')].find(el => el.textContent?.trim() === 'play_arrow');
              if (playIcon) playIcon.click();
            }
          });
          await new Promise(r => setTimeout(r, 1000));
        }

        const found = await page.evaluate(() => {
          // 1. Check for standard video elements
          const vids = [...document.querySelectorAll('video')];
          for (const v of vids) {
            const src = v.currentSrc || v.src || (v.querySelector('source') ? v.querySelector('source').src : null);
            if (src && src.length > 10) {
              return { type: src.startsWith('blob:') ? 'blob' : 'url', url: src };
            }
          }

          // 2. Check for download buttons or menu links
          const links = [...document.querySelectorAll('a[download], a[href*="media"], a[href*="video"]')];
          for (const l of links) {
            if (l.href) return { type: 'url', url: l.href };
          }

          return null;
        });

        if (found) {
          videoInfo = found;
          break;
        }

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

        await new Promise(r => setTimeout(r, 4000));
      }

      if (!videoInfo) {
        await page.screenshot({ path: screenshotPath });
        throw new Error('Timed out waiting for Flow Veo 3.1 generation output (300s). Screenshot captured.');
      }

      console.log(`[FlowBrowserEngine] ✅ Veo 3.1 Video located (${videoInfo.type}): ${videoInfo.url.slice(0, 80)}...`);

      const filename = `veo_reel_${Date.now()}.mp4`;
      const outputPath = path.join(this.outputDir, filename);

      const base64Data = await page.evaluate(async (url) => {
        const res = await fetch(url);
        const blob = await res.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
      }, videoInfo.url);

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
