const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const config = require('./config');
const videoSynthesizer = require('./videoSynthesizer');

class FlowClient {
  constructor() {
    this.accountsFile = config.FLOW.ACCOUNTS_FILE;
    this.accountsData = this.loadAccounts();
    this.outputDir = config.OUTPUT_DIR;
  }

  loadAccounts() {
    try {
      if (fs.existsSync(this.accountsFile)) {
        const parsed = JSON.parse(fs.readFileSync(this.accountsFile, 'utf8'));
        if (parsed && Array.isArray(parsed.accounts)) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn(`[FlowClient] Could not read accounts file: ${e.message}`);
    }
    return {
      activeAccountIndex: 0,
      rotationStrategy: 'round-robin',
      accounts: []
    };
  }

  saveAccounts() {
    try {
      if (this.accountsData && Array.isArray(this.accountsData.accounts)) {
        fs.writeFileSync(this.accountsFile, JSON.stringify(this.accountsData, null, 2));
      }
    } catch (e) {
      console.warn(`[FlowClient] Could not save accounts file: ${e.message}`);
    }
  }

  getActiveAccounts() {
    const now = Date.now();
    return (this.accountsData.accounts || []).map(acc => {
      // If rate limited but cooldown has passed, restore to active
      if (acc.status === 'rate_limited' && acc.rateLimitedUntil && now > acc.rateLimitedUntil) {
        acc.status = 'active';
        acc.rateLimitedUntil = null;
      }
      return acc;
    }).filter(acc => acc.status === 'active' && acc.quotaRemaining > 0);
  }

  selectNextAccount() {
    const active = this.getActiveAccounts();
    if (active.length === 0) return null;

    // Filter out accounts that have clearly sample/placeholder tokens
    const validConfigured = active.filter(acc => {
      const hasRealBearer = acc.bearerToken && !acc.bearerToken.includes('SAMPLE') && !acc.bearerToken.includes('TODO');
      const hasRealCookies = acc.cookies && !acc.cookies.includes('sample_') && !acc.cookies.includes('TODO');
      const hasRealSession = acc.sessionToken && !acc.sessionToken.includes('sample_') && !acc.sessionToken.includes('TODO');
      return hasRealBearer || hasRealCookies || hasRealSession;
    });

    if (validConfigured.length === 0) return null;

    // Round-robin selection
    const idx = (this.accountsData.activeAccountIndex || 0) % validConfigured.length;
    const selected = validConfigured[idx];
    this.accountsData.activeAccountIndex = idx + 1;
    this.saveAccounts();
    return selected;
  }

  markRateLimited(accountId, cooldownSec = 900) {
    const acc = this.accountsData.accounts.find(a => a.id === accountId);
    if (acc) {
      acc.status = 'rate_limited';
      acc.rateLimitedUntil = Date.now() + cooldownSec * 1000;
      this.saveAccounts();
      console.warn(`[FlowClient] Account ${accountId} marked as rate-limited for ${cooldownSec}s.`);
    }
  }

  markExpired(accountId) {
    const acc = this.accountsData.accounts.find(a => a.id === accountId);
    if (acc) {
      acc.status = 'expired';
      this.saveAccounts();
      console.warn(`[FlowClient] Account ${accountId} token marked as expired. Refresh required.`);
    }
  }

  decrementQuota(accountId) {
    const acc = this.accountsData.accounts.find(a => a.id === accountId);
    if (acc) {
      acc.quotaRemaining = Math.max(0, (acc.quotaRemaining || 1) - 1);
      acc.totalGenerated = (acc.totalGenerated || 0) + 1;
      acc.lastUsed = new Date().toISOString();
      this.saveAccounts();
    }
  }

  getStatus() {
    return this.getPoolStatus();
  }

  getPoolStatus() {
    const accounts = this.accountsData.accounts || [];
    const active = accounts.filter(a => a.status === 'active' && a.quotaRemaining > 0);
    const rateLimited = accounts.filter(a => a.status === 'rate_limited');
    const expired = accounts.filter(a => a.status === 'expired');
    const totalRemaining = accounts.reduce((acc, a) => acc + (a.quotaRemaining || 0), 0);
    const totalGenerated = accounts.reduce((acc, a) => acc + (a.totalGenerated || 0), 0);

    return {
      totalAccounts: accounts.length,
      activeAccounts: active.length,
      rateLimitedAccounts: rateLimited.length,
      expiredAccounts: expired.length,
      totalQuotaRemaining: totalRemaining,
      totalGenerated,
      accounts: accounts.map(a => ({
        id: a.id,
        name: a.name,
        email: a.email,
        status: a.status,
        quotaRemaining: a.quotaRemaining,
        totalGenerated: a.totalGenerated,
        lastUsed: a.lastUsed
      }))
    };
  }

  /**
   * Helper to inspect if a video file has an active audio stream
   */
  hasAudioStream(filePath) {
    try {
      const probe = spawnSync('ffprobe', [
        '-v', 'error',
        '-select_streams', 'a',
        '-show_entries', 'stream=codec_name',
        '-of', 'json',
        filePath
      ], { encoding: 'utf8' });

      if (probe.status === 0) {
        const info = JSON.parse(probe.stdout || '{}');
        return Array.isArray(info.streams) && info.streams.length > 0;
      }
    } catch (e) {
      // ffprobe error or missing stream
    }
    return false;
  }

  /**
   * Polls asynchronous Flow/Veo operations until completion
   */
  async pollFlowOperation(operationId, account, maxWaitSec = 60) {
    const endpoint = `${account.endpoint || 'https://labs.google/fx/api/flow'}/operations/${operationId}`;
    const startTime = Date.now();
    const headers = { 'Content-Type': 'application/json' };
    if (account.bearerToken) headers['Authorization'] = `Bearer ${account.bearerToken}`;
    if (account.cookies) headers['Cookie'] = account.cookies;

    while ((Date.now() - startTime) < maxWaitSec * 1000) {
      await new Promise(r => setTimeout(r, 4000));
      try {
        const res = await fetch(endpoint, { headers, signal: AbortSignal.timeout(10000) });
        if (res.ok) {
          const data = await res.json();
          if (data.done || data.status === 'COMPLETED' || data.status === 'SUCCEEDED') {
            const url = data.response?.videoUrl || data.response?.downloadUrl || data.videoUrl || data.downloadUrl;
            if (url) return url;
          }
        }
      } catch (e) {
        // Continue polling
      }
    }
    return null;
  }

  /**
   * Generates base 8-second clip via Google Labs Flow / Veo API
   */
  async generateBaseClip(prompt, account) {
    const endpoint = account.endpoint || 'https://labs.google/fx/api/flow/generate';
    console.log(`[FlowClient] Requesting 8s base clip on account "${account.name}" (${account.id})...`);

    const headers = {
      'Content-Type': 'application/json'
    };
    if (account.bearerToken) {
      headers['Authorization'] = `Bearer ${account.bearerToken}`;
    }
    if (account.cookies) {
      headers['Cookie'] = account.cookies;
    }

    const payload = {
      prompt,
      aspectRatio: '9:16',
      durationSeconds: 8,
      model: 'veo-2.0',
      projectId: account.projectId || 'webify-social'
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60000)
    });

    if (res.status === 401 || res.status === 403) {
      this.markExpired(account.id);
      throw new Error(`Flow authentication failed (HTTP ${res.status}): Token expired`);
    }

    if (res.status === 429) {
      this.markRateLimited(account.id);
      throw new Error(`Flow quota rate-limited (HTTP 429)`);
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Flow API generation error (HTTP ${res.status}): ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    let videoUrl = data.videoUrl || data.downloadUrl || data.url || data.mediaUrl || null;
    const videoId = data.videoId || data.id || data.operationId || `flow_base_${Date.now()}`;

    // If API returned an async operation instead of direct URL, poll for completion
    if (!videoUrl && (data.operationId || data.name || data.status === 'PENDING')) {
      const opId = data.operationId || data.name || videoId;
      console.log(`[FlowClient] Generation queued asynchronously. Polling operation ${opId}...`);
      videoUrl = await this.pollFlowOperation(opId, account);
    }

    return {
      videoId,
      videoUrl,
      durationSec: 8
    };
  }

  /**
   * Chains and extends base video by 8 seconds to hit the exact 16-second mark using Flow's new chaining feature
   */
  async extendClip(parentVideoId, extensionPrompt, account) {
    const endpoint = `${account.endpoint || 'https://labs.google/fx/api/flow'}/extend`;
    console.log(`[FlowClient] Chaining 8s extension from parentVideoId "${parentVideoId}"...`);

    const headers = {
      'Content-Type': 'application/json'
    };
    if (account.bearerToken) {
      headers['Authorization'] = `Bearer ${account.bearerToken}`;
    }
    if (account.cookies) {
      headers['Cookie'] = account.cookies;
    }

    const payload = {
      parentVideoId,
      prompt: extensionPrompt,
      mode: 'continuation_chain',
      durationSeconds: 8,
      aspectRatio: '9:16',
      targetDurationSeconds: 16
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60000)
    });

    if (res.status === 401 || res.status === 403) {
      this.markExpired(account.id);
      throw new Error(`Flow authentication failed during extension: Token expired`);
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Flow API extension error (HTTP ${res.status}): ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    let videoUrl = data.videoUrl || data.downloadUrl || data.url || data.mediaUrl || null;
    let fullChainedUrl = data.full16sUrl || data.chainedVideoUrl || null;
    const videoId = data.videoId || data.id || data.operationId || `flow_ext_${Date.now()}`;

    // Poll if operation is asynchronous
    if (!videoUrl && !fullChainedUrl && (data.operationId || data.name)) {
      const opId = data.operationId || data.name || videoId;
      console.log(`[FlowClient] Extension queued asynchronously. Polling operation ${opId}...`);
      const polledUrl = await this.pollFlowOperation(opId, account);
      if (polledUrl) {
        fullChainedUrl = polledUrl;
      }
    }

    return {
      videoId,
      videoUrl,
      fullChainedUrl,
      durationSec: 8
    };
  }

  /**
   * Concatenates two 8s clips into a seamless 16s video with FFmpeg
   * Automatically handles audio streams: if silent, synthesizes high-energy electronic pulse track
   */
  async stitchFlowClips(clip1Path, clip2Path, outputPath) {
    console.log(`[FlowClient] Stitching base and chained extension into exact 16.0s video...`);

    const hasAudio1 = this.hasAudioStream(clip1Path);
    const hasAudio2 = this.hasAudioStream(clip2Path);

    let args;
    if (hasAudio1 && hasAudio2) {
      // Both clips have audio streams -> concat video and audio
      args = [
        '-y',
        '-i', clip1Path,
        '-i', clip2Path,
        '-filter_complex', '[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[outv][outa]',
        '-map', '[outv]',
        '-map', '[outa]',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-pix_fmt', 'yuv420p',
        '-t', '16.0',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        outputPath
      ];
    } else {
      // Flow clips are silent or missing audio: concat video streams and synthesize high-energy electronic pulse
      console.log(`[FlowClient] Flow clips have no audio stream. Synthesizing background electronic pulse for Instagram Reels...`);
      const audioFilter = videoSynthesizer.generateAudioFilter();
      args = [
        '-y',
        '-i', clip1Path,
        '-i', clip2Path,
        '-f', 'lavfi', '-i', audioFilter,
        '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[outv]',
        '-map', '[outv]',
        '-map', '2:a',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-pix_fmt', 'yuv420p',
        '-t', '16.0',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        outputPath
      ];
    }

    await new Promise((resolve, reject) => {
      const proc = spawn('ffmpeg', args);
      let stderr = '';
      proc.stderr.on('data', chunk => {
        stderr += chunk.toString();
      });

      proc.on('close', code => {
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve();
        } else {
          reject(new Error(`Failed to stitch Flow clips (exit code: ${code}):\n${stderr.slice(-400)}`));
        }
      });
      proc.on('error', reject);
    });

    return outputPath;
  }

  /**
   * Master generation entry point:
   * 1. Attempts Flow multi-account pool with base clip + 8s chaining extension
   * 2. Seamlessly falls back to the native 1080x1920 16-second vertical kinetic reels engine if no Flow account is active/configured
   */
  async generate16sVideo(scriptData) {
    const account = this.selectNextAccount();

    if (account) {
      try {
        console.log(`[FlowClient] Using Flow Account: ${account.name} (Quota remaining: ${account.quotaRemaining})`);
        const baseResult = await this.generateBaseClip(scriptData.flowPrompts.basePrompt, account);
        const extResult = await this.extendClip(baseResult.videoId, scriptData.flowPrompts.extensionPrompt, account);

        this.decrementQuota(account.id);

        // If Flow returned a single stitched 16s URL or separate clips
        const timestamp = Date.now();
        const finalVideoPath = path.join(this.outputDir, `flow_reel_${scriptData.nicheId}_${timestamp}.mp4`);
        const coverPath = path.join(this.outputDir, `flow_reel_${scriptData.nicheId}_${timestamp}_cover.jpg`);

        if (extResult.fullChainedUrl) {
          console.log(`[FlowClient] Downloading unified 16s Flow video from ${extResult.fullChainedUrl}...`);
          const res = await fetch(extResult.fullChainedUrl);
          const buf = Buffer.from(await res.arrayBuffer());
          fs.writeFileSync(finalVideoPath, buf);
        } else if (baseResult.videoUrl && extResult.videoUrl) {
          // Download both and stitch
          const clip1 = path.join(this.outputDir, `tmp_base_${timestamp}.mp4`);
          const clip2 = path.join(this.outputDir, `tmp_ext_${timestamp}.mp4`);
          const res1 = await fetch(baseResult.videoUrl);
          fs.writeFileSync(clip1, Buffer.from(await res1.arrayBuffer()));
          const res2 = await fetch(extResult.videoUrl);
          fs.writeFileSync(clip2, Buffer.from(await res2.arrayBuffer()));
          await this.stitchFlowClips(clip1, clip2, finalVideoPath);
          if (fs.existsSync(clip1)) fs.unlinkSync(clip1);
          if (fs.existsSync(clip2)) fs.unlinkSync(clip2);
        }

        // Validate that a non-empty video file was created
        if (!fs.existsSync(finalVideoPath) || fs.statSync(finalVideoPath).size === 0) {
          throw new Error('Flow generation did not produce a downloadable video file');
        }

        await videoSynthesizer.extractCoverFrame(finalVideoPath, coverPath, 1.5);

        return {
          success: true,
          source: 'google-labs-flow',
          accountId: account.id,
          videoPath: finalVideoPath,
          coverPath,
          durationSec: 16.0,
          resolution: '1080x1920 (9:16 vertical)',
          createdAt: new Date().toISOString()
        };
      } catch (err) {
        console.warn(`[FlowClient] Flow API generation encountered an issue (${err.message}). Engaging autonomous kinetic synthesis engine.`);
      }
    } else {
      console.log(`[FlowClient] No live authenticated Flow accounts in pool (or tokens expired/refreshing). Engaging autonomous kinetic synthesis engine.`);
    }

    // High-Aesthetic Local Synthesis Fallback
    const synthResult = await videoSynthesizer.synthesize16sVideo(scriptData);
    return {
      ...synthResult,
      source: 'autonomous-kinetic-synthesis'
    };
  }
}

module.exports = new FlowClient();
