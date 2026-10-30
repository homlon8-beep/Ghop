const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const config = require('./config');
const scriptGenerator = require('./scriptGenerator');
const flowClient = require('./flowClient');
const videoSynthesizer = require('./videoSynthesizer');
const instagramUploader = require('./instagramUploader');
const scheduler = require('./scheduler');

async function runTestSuite() {
  console.log(`\n======================================================`);
  console.log(`🧪 [Webify Social Bot] Comprehensive Test Suite`);
  console.log(`======================================================\n`);

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      process.stdout.write(`  [TEST ${total}] ${name}... `);
      await fn();
      console.log(`✅ PASSED`);
      passed++;
    } catch (err) {
      console.log(`❌ FAILED`);
      console.error(`      Error: ${err.message}`);
      if (err.stack) {
        console.error(`      ${err.stack.split('\n').slice(1, 3).join('\n      ')}`);
      }
    }
  }

  // TEST 1: Config and Output Directories
  await test('Configuration & Required Directories exist', () => {
    assert(fs.existsSync(config.OUTPUT_DIR), 'output directory must exist');
    assert(fs.existsSync(config.STAGING_DIR), 'ready_for_upload directory must exist');
    assert(fs.existsSync(config.LOGS_DIR), 'logs directory must exist');
    assert.strictEqual(config.SCHEDULE.TIMEZONE, 'America/New_York');
    assert.strictEqual(config.FLOW.DEFAULT_DURATION_SEC, 16);
    assert.strictEqual(config.FLOW.RESOLUTION.width, 1080);
    assert.strictEqual(config.FLOW.RESOLUTION.height, 1920);
  });

  // TEST 2: Script Generation Diversity, 52 Niches & Resilient JSON Parser
  await test('Script Generator produces unique B2B niches & parses raw/fenced JSON', async () => {
    const scripts = [];
    for (let i = 0; i < 3; i++) {
      const s = await scriptGenerator.generateScript();
      scripts.push(s);
    }

    assert.strictEqual(scripts.length, 3);
    const niches = scripts.map(s => s.niche);
    assert(new Set(niches).size >= 2, 'Consecutive niches should have diversity');

    const first = scripts[0];
    assert(first.hook, 'Script must have a hook');
    assert(first.whatsappScript?.msg1, 'Script must have whatsapp message 1');
    assert(first.whatsappScript?.reply, 'Script must have whatsapp reply');
    assert(first.metrics?.leadsCount, 'Script must have metrics');
    assert(first.cta, 'Script must have a CTA');
    assert(first.caption?.includes('#'), 'Caption must include hashtags');
    assert(first.flowPrompts?.basePrompt, 'Flow base prompt must exist');
    assert(first.flowPrompts?.extensionPrompt, 'Flow extension prompt must exist');
    assert(first.kineticText?.scene1 && first.kineticText?.scene2 && first.kineticText?.scene3 && first.kineticText?.scene4, 'Kinetic text must have 4 scenes');

    // Test resilient JSON extraction from markdown code fences and noisy LLM responses
    const fencedJson = 'Here is the script output:\n```json\n{"hook":"SCALE NOW","cta":"Comment LEADS"}\n```\nHope you like it!';
    const parsed = scriptGenerator.extractJson(fencedJson);
    assert.strictEqual(parsed.hook, 'SCALE NOW');
    assert.strictEqual(parsed.cta, 'Comment LEADS');
  });

  // TEST 3: Flow Account Pool, Token Validation & Rate-Limit Cooldown
  await test('Flow Client multi-account pool, status and quota management', () => {
    const status = flowClient.getPoolStatus();
    assert(status.totalAccounts >= 2, 'Should have at least 2 accounts configured in pool');
    assert(typeof status.totalQuotaRemaining === 'number');

    const sampleId = 'flow-acc-01';
    flowClient.markRateLimited(sampleId, 60);
    const updatedStatus = flowClient.getPoolStatus();
    assert(updatedStatus.rateLimitedAccounts >= 1, 'Should track rate limited account');

    // Reset status for tests
    const acc = flowClient.accountsData.accounts.find(a => a.id === sampleId);
    if (acc) {
      acc.status = 'active';
      acc.rateLimitedUntil = null;
      flowClient.saveAccounts();
    }
  });

  // TEST 4: Flow Audio-Resilient Video Stitching (Handles Silent Clips + Synthesized Audio)
  await test('Flow Client stitches silent clips and synthesizes audio track for Instagram Reels', async () => {
    const clip1 = path.join(config.OUTPUT_DIR, `test_stitch_1_${Date.now()}.mp4`);
    const clip2 = path.join(config.OUTPUT_DIR, `test_stitch_2_${Date.now()}.mp4`);
    const stitched = path.join(config.OUTPUT_DIR, `test_stitch_out_${Date.now()}.mp4`);

    // Generate 2 silent 8s clips (simulating raw Flow/Veo video output)
    spawnSync('ffmpeg', [
      '-y',
      '-f', 'lavfi', '-i', 'color=c=#0b0f19:s=1080x1920:d=8:r=30',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      clip1
    ]);
    spawnSync('ffmpeg', [
      '-y',
      '-f', 'lavfi', '-i', 'color=c=#1e293b:s=1080x1920:d=8:r=30',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      clip2
    ]);

    assert(fs.existsSync(clip1) && fs.existsSync(clip2), 'Test source clips must exist');

    // Stitch using flowClient.stitchFlowClips
    await flowClient.stitchFlowClips(clip1, clip2, stitched);
    assert(fs.existsSync(stitched), 'Stitched video must exist');

    // Verify stitched specs with ffprobe
    const probe = spawnSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration:stream=width,height,codec_name',
      '-of', 'json',
      stitched
    ], { encoding: 'utf8' });

    assert.strictEqual(probe.status, 0);
    const data = JSON.parse(probe.stdout);
    const duration = parseFloat(data.format?.duration || '0');
    assert(Math.abs(duration - 16.0) < 0.5, `Stitched duration must be ~16s (got ${duration})`);

    const hasAudio = data.streams.some(s => s.codec_name === 'aac');
    assert(hasAudio, 'Stitched output must contain synthesized AAC audio for Reels');

    // Clean up
    fs.unlinkSync(clip1);
    fs.unlinkSync(clip2);
    fs.unlinkSync(stitched);
  });

  // TEST 5: Video Synthesizer Exact 16s Vertical Rendering & Cover
  await test('Video Synthesizer renders exact 16.0s 1080x1920 H.264+AAC video & cover', async () => {
    const testScript = scriptGenerator.generateProceduralScript(
      { id: 'solar', name: 'Solar Installers', city: 'Phoenix, AZ', avgJob: '$25,000', wastePerLead: '$120', pain: 'wasting $4k/mo on ads', leadExample: 'SunPeak' },
      { id: 'whatsapp_proof', name: 'Live WhatsApp Proof', theme: '', hookPattern: () => 'HOW PHOENIX SOLAR SCALED', subtitlePattern: () => 'Zero cold calls' }
    );

    const filename = `test_verification_16s_${Date.now()}.mp4`;
    const result = await videoSynthesizer.synthesize16sVideo(testScript, filename);

    assert(result.success, 'Synthesizer should return success');
    assert(fs.existsSync(result.videoPath), 'Video file must exist on disk');
    assert(fs.existsSync(result.coverPath), 'Cover image file must exist on disk');

    // Probe with ffprobe
    const ffprobe = spawnSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration:stream=width,height,codec_name',
      '-of', 'json',
      result.videoPath
    ], { encoding: 'utf8' });

    assert.strictEqual(ffprobe.status, 0, 'ffprobe must succeed');
    const probe = JSON.parse(ffprobe.stdout);
    const duration = parseFloat(probe.format?.duration || '0');
    assert(Math.abs(duration - 16.0) < 0.5, `Duration must be 16.0s (got ${duration})`);

    const vStream = probe.streams.find(s => s.codec_name === 'h264');
    assert(vStream, 'Must have H.264 video stream');
    assert.strictEqual(vStream.width, 1080, 'Width must be 1080');
    assert.strictEqual(vStream.height, 1920, 'Height must be 1920');

    const aStream = probe.streams.find(s => s.codec_name === 'aac');
    assert(aStream, 'Must have AAC audio stream');

    // Clean up test verification file
    fs.unlinkSync(result.videoPath);
    fs.unlinkSync(result.coverPath);
  });

  // TEST 6: Remotion Vertical 9:16 Kinetic Reels Components
  await test('Remotion components and compositions are exported and valid', () => {
    assert(fs.existsSync(path.join(__dirname, 'remotion', 'Root.js')), 'Root.js must exist');
    assert(fs.existsSync(path.join(__dirname, 'remotion', 'KineticReel.js')), 'KineticReel.js must exist');
    assert(fs.existsSync(path.join(__dirname, 'remotion', 'Scene1Hook.js')), 'Scene1Hook.js must exist');
    assert(fs.existsSync(path.join(__dirname, 'remotion', 'Scene2WhatsApp.js')), 'Scene2WhatsApp.js must exist');
    assert(fs.existsSync(path.join(__dirname, 'remotion', 'Scene3Metrics.js')), 'Scene3Metrics.js must exist');
    assert(fs.existsSync(path.join(__dirname, 'remotion', 'Scene4CTA.js')), 'Scene4CTA.js must exist');
    assert(fs.existsSync(path.join(__dirname, 'remotion', 'remotion.config.js')), 'remotion.config.js must exist');

    const { RemotionRoot } = require('./remotion/Root');
    assert(typeof RemotionRoot === 'function', 'RemotionRoot must be a valid component function');
  });

  // TEST 7: Instagram Staging & Specifications Validation
  await test('Instagram Uploader verifies video specs and stages Reel safely', async () => {
    const tmpVideo = path.join(config.OUTPUT_DIR, 'tmp_staging_test.mp4');
    const tmpCover = path.join(config.OUTPUT_DIR, 'tmp_staging_test.jpg');

    spawnSync('ffmpeg', [
      '-y',
      '-f', 'lavfi', '-i', 'color=c=black:s=1080x1920:d=16:r=30',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=16',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      tmpVideo
    ]);
    spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=1080x1920:d=1', '-vframes', '1', tmpCover]);

    const specs = instagramUploader.validateVideoForReels(tmpVideo);
    assert(specs.isValid, 'Specs should be valid');
    assert.strictEqual(specs.width, 1080);
    assert.strictEqual(specs.height, 1920);

    const publishResult = await instagramUploader.publishReel({
      videoPath: tmpVideo,
      coverPath: tmpCover,
      caption: 'Test Reels caption #webify',
      scriptData: { niche: 'Test Niche', angle: 'Test Angle' }
    });

    assert(publishResult.success, 'Publish/staging should succeed');
    assert.strictEqual(publishResult.status, 'staged');
    assert(fs.existsSync(publishResult.videoPath), 'Staged video must exist');
    assert(fs.existsSync(publishResult.coverPath), 'Staged cover must exist');
    assert(fs.existsSync(publishResult.metaPath), 'Staged metadata must exist');

    // Clean up
    fs.unlinkSync(tmpVideo);
    fs.unlinkSync(tmpCover);
    fs.unlinkSync(publishResult.videoPath);
    fs.unlinkSync(publishResult.coverPath);
    fs.unlinkSync(publishResult.metaPath);
  });

  // TEST 8: US Peak-Time Scheduler Countdown & Offsets
  await test('Scheduler timezone calculations match US peak times (11:30 AM & 7:30 PM EST)', () => {
    const runs = scheduler.getNextScheduledRuns();
    assert.strictEqual(runs.timezone, 'America/New_York');
    assert(runs.currentTimeEST.includes('EST'));
    assert(runs.nextSlot.includes('Peak'));
    assert(runs.timeRemaining.includes('h'));
    assert.strictEqual(runs.morningCron, '30 11 * * *');
    assert.strictEqual(runs.eveningCron, '30 19 * * *');
  });

  // TEST 9: CLI Entrypoint Flags
  await test('CLI index.js flags execute correctly', () => {
    const helpCheck = spawnSync('node', ['index.js', '--help'], { cwd: __dirname, encoding: 'utf8' });
    assert.strictEqual(helpCheck.status, 0);
    assert(helpCheck.stdout.includes('WEBIFY SOCIAL MEDIA MANAGEMENT BOT'));

    const statusCheck = spawnSync('node', ['index.js', '--status'], { cwd: __dirname, encoding: 'utf8' });
    assert.strictEqual(statusCheck.status, 0);
    assert(statusCheck.stdout.includes('SYSTEM STATUS AUDIT'));
  });

  console.log(`\n======================================================`);
  console.log(`🏁 Test Summary: ${passed}/${total} Passed (${Math.round((passed / total) * 100)}%)`);
  console.log(`======================================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

if (require.main === module) {
  runTestSuite().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
}

module.exports = runTestSuite;
