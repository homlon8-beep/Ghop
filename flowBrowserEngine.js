const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const config = require('./config');

class FlowBrowserEngine {
  constructor() {
    this.accountsFile = config.FLOW.ACCOUNTS_FILE;
    this.outputDir = config.OUTPUT_DIR;
  }

  loadSession() {
    if (process.env.FLOW_COOKIES_JSON) {
      try {
        const parsed = JSON.parse(process.env.FLOW_COOKIES_JSON);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {}
    }

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
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-sync',
        '--disable-translate',
        '--mute-audio',
        '--no-first-run',
        '--js-flags=--max-old-space-size=160',
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

  async submitPromptAndPollVideo(page, promptText, shotNum, capturedUrls, screenshotPath) {
    console.log(`\n[FlowBrowserEngine] 🎬 --- Generating Shot ${shotNum} in Veo 3.1 ---`);
    console.log(`   Prompt: "${promptText.slice(0, 110)}..."`);

    // Type prompt into contenteditable div
    const promptBox = await page.$('[role="textbox"][contenteditable="true"]');
    if (!promptBox) {
      throw new Error(`Prompt textbox not found for shot ${shotNum}`);
    }
    await promptBox.click();
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await new Promise(r => setTimeout(r, 300));

    await page.type('[role="textbox"][contenteditable="true"]', promptText, { delay: 10 });
    await new Promise(r => setTimeout(r, 600));

    // Submit generation (Press Enter & Click Arrow Button)
    console.log(`[FlowBrowserEngine] Submitting Shot ${shotNum} to Veo 3.1...`);
    await page.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 800));

    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button, [role="button"]')];
      for (const b of btns) {
        const text = (b.textContent || '').trim().toLowerCase();
        const label = (b.getAttribute('aria-label') || '').toLowerCase();
        const html = b.innerHTML.toLowerCase();
        if (label.includes('send') || label.includes('generate') || label.includes('submit') || label.includes('create') || html.includes('arrow_forward')) {
          b.click();
          return;
        }
      }
      const pb = document.querySelector('[role="textbox"][contenteditable="true"]');
      if (pb && pb.parentElement) {
        const cBtns = [...pb.parentElement.querySelectorAll('button, [role="button"]')];
        if (cBtns.length > 0) cBtns[cBtns.length - 1].click();
      }
    });

    // Baseline count of known video URLs before this shot finishes
    const initialUrlCount = capturedUrls.length;
    console.log(`[FlowBrowserEngine] Polling Veo 3.1 output for Shot ${shotNum} (up to 240s)...`);

    const startTime = Date.now();
    const maxWaitMs = 240000;
    let videoUrl = null;
    let loopCount = 0;

    while (Date.now() - startTime < maxWaitMs) {
      loopCount++;
      await new Promise(r => setTimeout(r, 3500));

      // 1. Check if a new video URL was captured via network
      if (capturedUrls.length > initialUrlCount) {
        videoUrl = capturedUrls[capturedUrls.length - 1];
        console.log(`[FlowBrowserEngine] Detected new video stream URL for Shot ${shotNum}: ${videoUrl.slice(0, 80)}`);
        break;
      }

      // 2. Click thumbnail cards on canvas to activate video player
      if (loopCount >= 2) {
        await page.evaluate(() => {
          const imgs = [...document.querySelectorAll('img')].filter(i => i.src && i.src.includes('flow-content.google'));
          if (imgs.length > 0) {
            const card = imgs[imgs.length - 1].closest('[role="button"], button') || imgs[imgs.length - 1];
            card.click();
          }
        });
      }

      // 3. Check for DOM video tags
      const domVideoUrl = await page.evaluate(() => {
        const vids = [...document.querySelectorAll('video')];
        for (const v of vids) {
          const src = v.currentSrc || v.src;
          if (src && src.includes('flow-content.google')) return src;
        }
        return null;
      });

      if (domVideoUrl && !capturedUrls.slice(0, initialUrlCount).includes(domVideoUrl)) {
        videoUrl = domVideoUrl;
        break;
      }
    }

    if (!videoUrl) {
      try { await page.screenshot({ path: screenshotPath }); } catch (e) {}
      throw new Error(`Shot ${shotNum} timed out waiting for Veo 3.1 video render`);
    }

    // Download Shot MP4
    const shotPath = path.join(this.outputDir, `shot_${shotNum}_${Date.now()}.mp4`);
    console.log(`[FlowBrowserEngine] Downloading Shot ${shotNum} from: ${videoUrl.slice(0, 80)}...`);

    try {
      const res = await fetch(videoUrl);
      const arrayBuf = await res.arrayBuffer();
      fs.writeFileSync(shotPath, Buffer.from(arrayBuf));
    } catch (e) {
      // In-page fallback
      const base64Data = await page.evaluate(async (url) => {
        const r = await fetch(url);
        const blob = await r.blob();
        return new Promise(resolve => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
      }, videoUrl);
      const clean = base64Data.replace(/^data:video\/\w+;base64,/, '');
      fs.writeFileSync(shotPath, Buffer.from(clean, 'base64'));
    }

    console.log(`[FlowBrowserEngine] ✅ Shot ${shotNum} downloaded: ${shotPath} (${fs.statSync(shotPath).size} bytes)`);
    return shotPath;
  }

  async generateVeoVideo(promptOrShots, options = {}) {
    const cookiesList = this.loadSession();
    if (!cookiesList || cookiesList.length === 0) {
      throw new Error('No authenticated Google Flow cookies found. Please provide session cookies.');
    }

    // Parse shot prompts
    let shot1Prompt = '';
    let shot2Prompt = null;

    if (typeof promptOrShots === 'string') {
      shot1Prompt = promptOrShots;
    } else if (Array.isArray(promptOrShots)) {
      shot1Prompt = promptOrShots[0] || '';
      shot2Prompt = promptOrShots[1] || null;
    } else if (typeof promptOrShots === 'object' && promptOrShots !== null) {
      shot1Prompt = promptOrShots.shot1 || promptOrShots.prompt || '';
      shot2Prompt = promptOrShots.shot2 || null;
      if (!shot1Prompt && promptOrShots.visualScenes) {
        shot1Prompt = promptOrShots.visualScenes[0]?.prompt || '';
        shot2Prompt = promptOrShots.visualScenes[1]?.prompt || null;
      }
    }

    if (!shot1Prompt) {
      throw new Error('No valid prompt provided for Veo 3.1 generation');
    }

    const browser = await this.launchBrowser();
    const page = await browser.newPage();
    const capturedUrls = [];

    page.on('response', res => {
      const u = res.url();
      const ct = res.headers()['content-type'] || '';
      if (
        (ct.includes('video/') || u.includes('.mp4') || u.includes('/video/')) &&
        !u.includes('banner') &&
        !u.includes('gstatic.com')
      ) {
        if (!capturedUrls.includes(u)) {
          console.log(`[Flow Captured Video URL] ${u.slice(0, 100)}`);
          capturedUrls.push(u);
        }
      }
    });

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

      console.log(`[FlowBrowserEngine] Navigating to https://flow.google.com/...`);
      await page.goto('https://flow.google.com/', {
        waitUntil: 'networkidle2',
        timeout: 45000
      });

      if (page.url().includes('accounts.google.com/ServiceLogin')) {
        await page.screenshot({ path: screenshotPath });
        throw new Error('Google session expired or rejected. Sign-in required.');
      }

      // Check for New project button if editor not mounted
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
          await new Promise(r => setTimeout(r, 4000));
        }
      }

      await page.waitForSelector('[role="textbox"][contenteditable="true"]', { timeout: 30000 });

      // Set Video mode & 9:16 vertical ratio
      console.log(`[FlowBrowserEngine] Setting Video mode & 9:16 vertical ratio...`);
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button, [role="button"]')];
        const settingsBtn = btns.find(b => /crop_|video|image/i.test(b.textContent || ''));
        if (settingsBtn) settingsBtn.click();
      });
      await new Promise(r => setTimeout(r, 500));

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
      await new Promise(r => setTimeout(r, 500));

      // 1. Generate Shot 1 (0-8s Setup & Hook)
      const shot1Path = await this.submitPromptAndPollVideo(page, shot1Prompt, 1, capturedUrls, screenshotPath);

      // 2. Generate Shot 2 (8-16s Climax & Twist) if specified
      let shot2Path = null;
      if (shot2Prompt) {
        try {
          await new Promise(r => setTimeout(r, 2000));
          shot2Path = await this.submitPromptAndPollVideo(page, shot2Prompt, 2, capturedUrls, screenshotPath);
        } catch (shot2Err) {
          console.warn(`[FlowBrowserEngine] Shot 2 generation issue (${shot2Err.message}). Proceeding with Shot 1 mastering.`);
        }
      }

      // 3. Close browser FIRST to free container RAM before running FFmpeg
      try {
        await browser.close();
        console.log(`[FlowBrowserEngine] Closed browser to free container memory before mastering.`);
      } catch (e) {}

      // 4. Master into Crystal-Clear 1080x1920 Full HD (16.0s exact, bicubic upscale, 30fps)
      console.log(`\n[FlowBrowserEngine] 🎛️ Mastering final 16-second Reel in Full HD 1080x1920 with FFmpeg...`);
      const finalOutputPath = path.join(this.outputDir, `veo_reel_master_${Date.now()}.mp4`);

      if (shot2Path && fs.existsSync(shot2Path)) {
        // True 2-Shot Narrative Concatenation (Shot 1 + Shot 2 = 16s exact, NO LOOPING)
        console.log(`[FlowBrowserEngine] 🎬 Concatenating Shot 1 + Shot 2 into true 16-second narrative film!`);
        const concatCmd = `ffmpeg -y -i "${shot1Path}" -i "${shot2Path}" -filter_complex "[0:v][1:v]concat=n=2:v=1[cv];[cv]scale=1080:1920:flags=bicubic,fps=30[outv]" -map "[outv]" -c:v libx264 -preset veryfast -crf 20 -profile:v high -level 4.2 -pix_fmt yuv420p -b:v 8M -maxrate 12M -bufsize 16M -g 60 -movflags +faststart "${finalOutputPath}"`;
        execSync(concatCmd, { stdio: 'ignore' });
      } else {
        // Single Shot Mastered to 1080x1920 with high-bitrate stream-loop to guarantee 16s
        console.log(`[FlowBrowserEngine] 🎬 Mastering Shot 1 into 1080x1920 Full HD Reel...`);
        const singleCmd = `ffmpeg -y -stream_loop 1 -i "${shot1Path}" -vf "scale=1080:1920:flags=bicubic,fps=30" -c:v libx264 -preset veryfast -crf 20 -profile:v high -level 4.2 -pix_fmt yuv420p -b:v 8M -maxrate 12M -bufsize 16M -g 60 -movflags +faststart "${finalOutputPath}"`;
        execSync(singleCmd, { stdio: 'ignore' });
      }

      if (!fs.existsSync(finalOutputPath) || fs.statSync(finalOutputPath).size < 1000) {
        throw new Error('FFmpeg mastering failed to produce valid 1080x1920 video');
      }

      const finalSize = fs.statSync(finalOutputPath).size;
      console.log(`[FlowBrowserEngine] 🎉 Mastered HD Reel Ready: ${finalOutputPath} (${finalSize} bytes, 1080x1920 @ 30fps)`);

      return {
        success: true,
        source: 'google-flow-veo-3.1',
        videoPath: finalOutputPath,
        durationSec: 16.0,
        width: 1080,
        height: 1920,
        isTwoShot: Boolean(shot2Path),
        shot1Path,
        shot2Path
      };
    } catch (err) {
      try {
        await page.screenshot({ path: screenshotPath });
      } catch (e) {}
      throw err;
    } finally {
      try {
        if (browser && browser.isConnected()) await browser.close();
      } catch (e) {}
    }
  }
}

module.exports = new FlowBrowserEngine();
