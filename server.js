/**
 * Webify Social Media Management Bot - Express Server & Cloud Dashboard
 * Runs 24/7 on Render or local port 3002.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { config, updateConfig } = require('./config');
const flowClient = require('./flowClient');
const surrealStoryEngine = require('./surrealStoryEngine');
const scriptGenerator = require('./scriptGenerator');
const videoSynthesizer = require('./videoSynthesizer');
const instagramUploader = require('./instagramUploader');
const scheduler = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── BACKGROUND SCHEDULER AUTOSTART ─────────────────────────────
console.log('🚀 [Webify Social Server] Initializing 24/7 background scheduler...');
scheduler.startAutonomousSchedule();

// Keepalive self-ping every 10 minutes to prevent Render free-tier sleep
setInterval(() => {
  const renderUrl = process.env.RENDER_EXTERNAL_URL || 'https://webify-autonomous-bot.onrender.com';
  fetch(`${renderUrl}/health`).catch(() => {});
}, 10 * 60 * 1000);

// ─── API ENDPOINTS ──────────────────────────────────────────────

// Health check endpoint for Render zero-downtime monitoring
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// System Status & Health Matrix
app.get('/api/status', (req, res) => {
  try {
    const flowStatus = flowClient.getStatus();
    const igStatus = instagramUploader.getStatus();
    const schedStatus = scheduler.getStatus();
    const storyStatus = surrealStoryEngine.getMemoryStatus();

    let history = [];
    if (fs.existsSync(config.paths.historyFile)) {
      try {
        history = JSON.parse(fs.readFileSync(config.paths.historyFile, 'utf8'));
      } catch (e) {}
    }

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      flow: flowStatus,
      instagram: igStatus,
      scheduler: schedStatus,
      story: storyStatus,
      groqConfig: {
        model: surrealStoryEngine.groqModel,
        hasKey: Boolean(surrealStoryEngine.groqApiKey)
      },
      recentHistory: history.slice(-10).reverse(),
      outputCount: fs.existsSync(config.paths.outputDir)
        ? fs.readdirSync(config.paths.outputDir).filter(f => f.endsWith('.mp4')).length
        : 0,
      stagedCount: fs.existsSync(config.paths.readyDir)
        ? fs.readdirSync(config.paths.readyDir).filter(f => f.endsWith('.mp4')).length
        : 0,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Story Engine Memory Status
app.get('/api/story-status', (req, res) => {
  res.json({
    success: true,
    story: surrealStoryEngine.getMemoryStatus(),
    groqConfig: {
      model: surrealStoryEngine.groqModel,
      hasKey: Boolean(surrealStoryEngine.groqApiKey)
    }
  });
});

// 1-Tap Clipboard Copier Helper
app.get('/copy', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'copy.html'));
});

// Trigger Part 1 (Morning Hook & Cliffhanger)
app.post('/api/generate-pt1', async (req, res) => {
  try {
    console.log('⚡ [Dashboard Trigger] Manual PART 1 requested...');
    const shouldUpload = Boolean(req.body && req.body.upload);
    const result = await scheduler.executeCycle({
      slot: 'morning',
      forcePart: 'part1',
      upload: shouldUpload
    });
    res.json({ success: true, result });
  } catch (err) {
    console.error('❌ Part 1 trigger failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Trigger Part 2 (Evening Finale Resolution from Memory)
app.post('/api/generate-pt2', async (req, res) => {
  try {
    console.log('⚡ [Dashboard Trigger] Manual PART 2 requested...');
    const shouldUpload = Boolean(req.body && req.body.upload);
    const result = await scheduler.executeCycle({
      slot: 'evening',
      forcePart: 'part2',
      upload: shouldUpload
    });
    res.json({ success: true, result });
  } catch (err) {
    console.error('❌ Part 2 trigger failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save Groq Settings
app.post('/api/save-groq', (req, res) => {
  try {
    const { apiKey, model } = req.body;
    if (apiKey) {
      process.env.GROQ_API_KEY = apiKey.trim();
      surrealStoryEngine.groqApiKey = apiKey.trim();
      
      const envPath = path.join(__dirname, '.env');
      let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
      if (env.includes('GROQ_API_KEY=')) {
        env = env.replace(/GROQ_API_KEY=.*(\r?\n|$)/g, `GROQ_API_KEY=${apiKey.trim()}\n`);
      } else {
        env += `\nGROQ_API_KEY=${apiKey.trim()}`;
      }
      fs.writeFileSync(envPath, env.trim() + '\n');
    }
    if (model) {
      process.env.GROQ_MODEL = model.trim();
      surrealStoryEngine.groqModel = model.trim();
    }
    res.json({ success: true, message: 'Groq settings saved successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Full Video History
app.get('/api/history', (req, res) => {
  try {
    let history = [];
    if (fs.existsSync(config.paths.historyFile)) {
      history = JSON.parse(fs.readFileSync(config.paths.historyFile, 'utf8'));
    }
    // Return newest entries first directly
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Trigger 1-Click Autonomous Reel Cycle (Generate & Publish)
app.post('/api/post-now', async (req, res) => {
  try {
    console.log('⚡ [Dashboard Trigger] Manual POST NOW triggered from web UI...');
    // Non-blocking trigger or await result
    const result = await scheduler.executeCycle({ upload: true });
    res.json({ success: true, result });
  } catch (err) {
    console.error('❌ Post now failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Trigger 1-Click Generate Only (Create & Preview in Browser without posting)
app.post('/api/generate-only', async (req, res) => {
  try {
    console.log('🎬 [Dashboard Trigger] Manual GENERATE ONLY triggered from web UI...');
    const result = await scheduler.executeCycle({ upload: false });
    res.json({ success: true, result });
  } catch (err) {
    console.error('❌ Generate only failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

let activeFlowJob = null;
const flowLogs = [];

// Intercept console.log to keep rolling logs
const origLog = console.log;
console.log = function(...args) {
  const line = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
  if (line.includes('[Flow') || line.includes('[IG') || line.includes('Veo')) {
    flowLogs.push(`[${new Date().toISOString()}] ${line}`);
    if (flowLogs.length > 200) flowLogs.shift();
  }
  origLog.apply(console, args);
};

// Async background generator (non-blocking)
app.all('/api/start-veo-generation', async (req, res) => {
  if (activeFlowJob && activeFlowJob.status === 'running') {
    return res.json({ success: true, message: 'Generation already running', job: activeFlowJob });
  }

  const prompt = (req.body && req.body.prompt) || req.query.prompt || 'a glowing neon rubber ball bouncing off city rooftops with colorful sparkles, 3d cartoon physics, 9:16 vertical video';
  
  activeFlowJob = {
    id: `job_${Date.now()}`,
    prompt,
    status: 'running',
    startedAt: new Date().toISOString(),
    result: null,
    igResult: null,
    error: null
  };

  res.json({ success: true, message: 'Flow Veo 3.1 generation started in background', job: activeFlowJob });

  // Run asynchronously without blocking HTTP
  (async () => {
    try {
      console.log(`[Flow] Starting background Veo 3.1 generation for job: ${activeFlowJob.id}`);
      const flowBrowserEngine = require('./flowBrowserEngine');
      const result = await flowBrowserEngine.generateVeoVideo(prompt);
      activeFlowJob.status = 'generated';
      activeFlowJob.result = result;

      // Auto-publish to Instagram
      console.log('[Flow] Auto-publishing to Instagram @feticid...');
      const instagramUploader = require('./instagramUploader');
      const caption = `When the chai tapri ascends into the stratosphere... ☕🚀 #MorphVerse #Veo3 #AIAnimation #SurrealCinema #NuclearBombReee`;
      const igResult = await instagramUploader.publishViaWebAPI(result.videoPath, caption);
      activeFlowJob.status = 'completed';
      activeFlowJob.igResult = igResult;
      console.log('[Flow] Published successfully to Instagram:', JSON.stringify(igResult));
    } catch (err) {
      console.error('[Flow] Background generation error:', err.message);
      activeFlowJob.status = 'failed';
      activeFlowJob.error = err.message;
    }
  })();
});

// Non-blocking trigger for autonomous post cycle
app.post('/api/start-autonomous-cycle', (req, res) => {
  const forcePart = req.body?.part || null;
  const slot = req.body?.slot || 'auto';

  if (activeFlowJob && activeFlowJob.status === 'running') {
    return res.status(409).json({ success: false, message: 'A generation job is already active', job: activeFlowJob });
  }

  activeFlowJob = {
    id: `cycle_${Date.now()}`,
    type: 'autonomous_story_cycle',
    forcePart,
    slot,
    status: 'running',
    startedAt: new Date().toISOString(),
    result: null,
    igResult: null,
    error: null
  };

  res.json({ success: true, message: 'Autonomous story cycle initiated in background', job: activeFlowJob });

  (async () => {
    try {
      console.log(`[Scheduler] Starting non-blocking autonomous cycle (Job: ${activeFlowJob.id})...`);
      const cycleResult = await scheduler.executeCycle({ slot, forcePart, upload: true });
      if (cycleResult.success) {
        activeFlowJob.status = 'completed';
        activeFlowJob.result = cycleResult.videoResult;
        activeFlowJob.igResult = cycleResult.publishResult;
        console.log(`[Scheduler] Autonomous cycle completed successfully!`);
      } else {
        activeFlowJob.status = 'failed';
        activeFlowJob.error = cycleResult.error;
      }
    } catch (err) {
      activeFlowJob.status = 'failed';
      activeFlowJob.error = err.message;
      console.error(`[Scheduler] Autonomous cycle error:`, err.message);
    }
  })();
});

// Flow job status and logs
app.get('/api/flow-job-status', (req, res) => {
  res.json({
    job: activeFlowJob,
    logs: flowLogs.slice(-60)
  });
});

// View Flow debug screenshot
app.get('/api/flow-debug-screenshot', (req, res) => {
  const p = path.join(config.OUTPUT_DIR, 'flow_debug_screenshot.png');
  if (fs.existsSync(p)) {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(p);
  } else {
    res.status(404).send('No debug screenshot found');
  }
});

// Serve generated video directly
app.get('/api/latest-video', (req, res) => {
  if (activeFlowJob && activeFlowJob.result && activeFlowJob.result.videoPath && fs.existsSync(activeFlowJob.result.videoPath)) {
    return res.sendFile(activeFlowJob.result.videoPath);
  }
  // Check output directory for latest .mp4
  const files = fs.readdirSync(config.OUTPUT_DIR).filter(f => f.endsWith('.mp4'));
  if (files.length > 0) {
    const latest = files.sort((a, b) => fs.statSync(path.join(config.OUTPUT_DIR, b)).mtime - fs.statSync(path.join(config.OUTPUT_DIR, a)).mtime)[0];
    return res.sendFile(path.join(config.OUTPUT_DIR, latest));
  }
  res.status(404).send('No video generated yet');
});

// Test Flow Browser Engine Directly (Synchronous with long timeout)
app.get('/api/test-flow-direct', async (req, res) => {
  const logs = [];
  function log(...args) {
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
    console.log(msg);
    logs.push(msg);
  }

  try {
    log('🚀 [Test Flow Direct] Starting direct Google Flow Veo 3.1 generation test...');
    const flowBrowserEngine = require('./flowBrowserEngine');
    const prompt = req.query.prompt || 'a glowing neon rubber ball bouncing off city rooftops with colorful sparkles, 3d cartoon physics, 9:16 vertical video';
    
    log('Prompt:', prompt);
    const result = await flowBrowserEngine.generateVeoVideo(prompt);
    log('Generation succeeded!', result);

    let igResult = null;
    const shouldUpload = req.query.upload !== 'false';
    if (shouldUpload && result.videoPath && fs.existsSync(result.videoPath)) {
      log('📤 Auto-publishing authentic Veo 3.1 Reel to Instagram @feticid...');
      const instagramUploader = require('./instagramUploader');
      const caption = `When the chai tapri ascends into the stratosphere... ☕🚀 #MorphVerse #Veo3 #AIAnimation #SurrealCinema #NuclearBombReee`;
      igResult = await instagramUploader.publishViaWebAPI(result.videoPath, caption);
      log('Instagram publish result:', igResult);
    }

    res.json({ success: true, logs, result, igResult });
  } catch (err) {
    log('❌ Generation error:', err.message);
    res.status(500).json({ success: false, logs, error: err.message, stack: err.stack });
  }
});

// Save / Update Google Labs Flow Accounts
app.post('/api/save-flow-accounts', (req, res) => {
  try {
    const { accounts } = req.body;
    if (!Array.isArray(accounts)) {
      return res.status(400).json({ success: false, error: 'Expected accounts array' });
    }

    const payload = {
      activeAccountIndex: 0,
      rotationStrategy: 'round-robin',
      accounts: accounts.map((acc, i) => ({
        id: acc.id || `flow-acc-${String(i + 1).padStart(2, '0')}`,
        name: acc.name || `Flow Account ${i + 1}`,
        email: acc.email || '',
        bearerToken: acc.bearerToken || '',
        cookies: acc.cookies || '',
        sessionToken: acc.sessionToken || '',
        quotaRemaining: Number(acc.quotaRemaining) || 50,
        status: 'active'
      }))
    };

    fs.writeFileSync(config.paths.flowAccountsFile, JSON.stringify(payload, null, 2));
    flowClient.reloadAccounts();

    console.log(`✅ [Flow Config] Saved ${payload.accounts.length} Flow accounts successfully.`);
    res.json({ success: true, message: `Saved ${payload.accounts.length} Flow accounts.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save / Update Instagram Credentials & Session
app.post('/api/save-ig', async (req, res) => {
  try {
    const { username, password, simulationMode, sessionId } = req.body;

    const igConfig = {
      username: (username || '').trim(),
      password: (password || '').trim(),
      sessionId: (sessionId || '').trim(),
      simulationMode: Boolean(simulationMode),
      updatedAt: new Date().toISOString()
    };

    fs.writeFileSync(path.join(__dirname, 'ig_config.json'), JSON.stringify(igConfig, null, 2));

    // Update .env file
    const envPath = path.join(__dirname, '.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    
    if (igConfig.username) {
      if (envContent.includes('IG_USERNAME=')) {
        envContent = envContent.replace(/IG_USERNAME=.*(\r?\n|$)/g, `IG_USERNAME=${igConfig.username}\n`);
      } else {
        envContent += `\nIG_USERNAME=${igConfig.username}`;
      }
      process.env.IG_USERNAME = igConfig.username;
    }
    
    if (igConfig.password) {
      if (envContent.includes('IG_PASSWORD=')) {
        envContent = envContent.replace(/IG_PASSWORD=.*(\r?\n|$)/g, `IG_PASSWORD=${igConfig.password}\n`);
      } else {
        envContent += `\nIG_PASSWORD=${igConfig.password}`;
      }
      process.env.IG_PASSWORD = igConfig.password;
    }

    if (igConfig.sessionId) {
      if (envContent.includes('IG_SESSION_ID=')) {
        envContent = envContent.replace(/IG_SESSION_ID=.*(\r?\n|$)/g, `IG_SESSION_ID=${igConfig.sessionId}\n`);
      } else {
        envContent += `\nIG_SESSION_ID=${igConfig.sessionId}`;
      }
      process.env.IG_SESSION_ID = igConfig.sessionId;
    }

    fs.writeFileSync(envPath, envContent.trim() + '\n');
    instagramUploader.configData = instagramUploader.loadConfig();

    console.log(`✅ [IG Config] Updated credentials for @${igConfig.username || 'feticid'}`);
    res.json({ success: true, message: `Instagram configuration saved successfully!` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Sync Profile Picture & Biography to Instagram Live
app.post('/api/sync-profile', async (req, res) => {
  try {
    console.log('🎨 [Dashboard Trigger] Syncing profile picture & bio to Instagram live...');
    const avatarPath = path.join(__dirname, 'public', 'avatar.jpg');
    const bioText = "🌀 The Surreal Multiverse\n🏀 Where everyday things transform into insanity\n🍿 Daily Sagas: Pt 1 Morning • Pt 2 Evening\n👇 Watch till the end!";
    const result = await instagramUploader.updateProfile({ bio: bioText, avatarPath });
    res.json({ success: true, result });
  } catch (err) {
    console.error('❌ Sync profile failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Stream Video files directly to browser player
app.get('/api/video/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  let filePath = path.join(config.paths.outputDir, filename);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(config.paths.readyDir, filename);
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Video not found');
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

// Stream Cover images directly to browser
app.get('/api/cover/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(config.paths.outputDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Cover image not found');
  }

  res.setHeader('Content-Type', 'image/jpeg');
  fs.createReadStream(filePath).pipe(res);
});

// Catch-all to serve index.html for dashboard SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🚀 [MorphVerse AI Dashboard] Running live at:`);
  console.log(`👉 http://localhost:${PORT}`);
  console.log(`📱 Cloud / Local IP: http://0.0.0.0:${PORT}`);
  console.log(`======================================================\n`);
});
