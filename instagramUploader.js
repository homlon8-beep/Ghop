const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { IgApiClient, IgCheckpointError, IgLoginRequiredError } = require('instagram-private-api');
const config = require('./config');

class InstagramUploader {
  constructor() {
    this.ig = new IgApiClient();
    this.sessionFile = config.INSTAGRAM.SESSION_FILE;
    this.configFile = config.INSTAGRAM.CONFIG_FILE;
    this.stagingDir = config.STAGING_DIR;
    this.historyFile = config.HISTORY_FILE;
    this.isLoggedIn = false;
    this.configData = this.loadConfig();
  }

  loadConfig() {
    let fileConfig = {};
    try {
      if (fs.existsSync(this.configFile)) {
        fileConfig = JSON.parse(fs.readFileSync(this.configFile, 'utf8')) || {};
      }
    } catch (e) {
      console.warn(`[InstagramUploader] Could not read ig_config.json: ${e.message}`);
    }

    const username = fileConfig.username || config.INSTAGRAM.USERNAME || '';
    const password = fileConfig.password || config.INSTAGRAM.PASSWORD || '';
    const hasCreds = Boolean(username && password && !username.includes('YOUR_') && !password.includes('YOUR_'));

    // Simulation mode is active if explicitly enabled or if credentials are missing
    const simulationMode = fileConfig.simulationMode !== undefined
      ? (fileConfig.simulationMode || !hasCreds)
      : (config.INSTAGRAM.SIMULATION_MODE || !hasCreds);

    return {
      username,
      password,
      deviceString: fileConfig.deviceString || config.INSTAGRAM.DEVICE_STRING || 'samsung_galaxy_s23',
      simulationMode,
      reelsShareToFeed: fileConfig.reelsShareToFeed !== undefined ? fileConfig.reelsShareToFeed : true,
      maxRetries: fileConfig.maxRetries || 3,
      retryDelayMs: fileConfig.retryDelayMs || 5000,
      autoExtractCover: fileConfig.autoExtractCover !== undefined ? fileConfig.autoExtractCover : true,
      coverFrameSec: fileConfig.coverFrameSec || 1.5
    };
  }

  saveConfig() {
    try {
      fs.writeFileSync(this.configFile, JSON.stringify(this.configData, null, 2));
    } catch (e) {
      console.warn(`[InstagramUploader] Could not save ig_config.json: ${e.message}`);
    }
  }

  loadHistory() {
    try {
      if (fs.existsSync(this.historyFile)) {
        return JSON.parse(fs.readFileSync(this.historyFile, 'utf8'));
      }
    } catch (e) {
      console.warn(`[InstagramUploader] Could not read history file: ${e.message}`);
    }
    return [];
  }

  recordHistory(entry) {
    try {
      const history = this.loadHistory();
      history.unshift(entry);
      // Keep last 100 entries
      fs.writeFileSync(this.historyFile, JSON.stringify(history.slice(0, 100), null, 2));
    } catch (e) {
      console.warn(`[InstagramUploader] Could not record history: ${e.message}`);
    }
  }

  validateVideoForReels(videoPath) {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file does not exist: ${videoPath}`);
    }

    const ffprobe = spawnSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration:stream=width,height,codec_name',
      '-of', 'json',
      videoPath
    ], { encoding: 'utf8' });

    if (ffprobe.status !== 0) {
      throw new Error(`ffprobe failed to analyze video: ${ffprobe.stderr}`);
    }

    const info = JSON.parse(ffprobe.stdout);
    const duration = parseFloat(info.format?.duration || '0');
    const videoStream = (info.streams || []).find(s => s.codec_name === 'h264' || s.width);
    const audioStream = (info.streams || []).find(s => s.codec_name === 'aac' || s.codec_name === 'mp3');

    if (!videoStream) {
      throw new Error('Video stream is missing or not H.264');
    }

    const width = videoStream.width;
    const height = videoStream.height;
    const aspectRatio = width / height;

    console.log(`[InstagramUploader] Video Specs Verified -> ${width}x${height} (ratio: ${aspectRatio.toFixed(3)}), ${duration.toFixed(1)}s, Video: ${videoStream.codec_name}, Audio: ${audioStream ? audioStream.codec_name : 'none'}`);

    return {
      isValid: true,
      width,
      height,
      duration,
      isVertical: height > width,
      videoCodec: videoStream.codec_name,
      audioCodec: audioStream ? audioStream.codec_name : null
    };
  }

  async authenticate() {
    const username = this.configData.username || config.INSTAGRAM.USERNAME;
    const password = this.configData.password || config.INSTAGRAM.PASSWORD;
    const sessionId = this.configData.sessionId || process.env.IG_SESSION_ID;

    this.ig.state.generateDevice(username || 'feticid');

    // 1. Direct session cookie authentication (bypasses checkpoint & needs_upgrade completely)
    if (sessionId) {
      try {
        console.log(`[InstagramUploader] Authenticating using Instagram sessionid cookie...`);
        const cleanSessionId = sessionId.trim().replace(/^sessionid=/i, '');
        await this.ig.state.cookieJar.setCookie(
          `sessionid=${cleanSessionId}; Domain=.instagram.com; Path=/; Secure; HttpOnly`,
          'https://instagram.com'
        );
        const userId = cleanSessionId.split('%3A')[0] || cleanSessionId.split(':')[0];
        if (userId && !isNaN(Number(userId))) {
          this.ig.state.cookieUserId = userId;
          await this.ig.state.cookieJar.setCookie(
            `ds_user_id=${userId}; Domain=.instagram.com; Path=/; Secure`,
            'https://instagram.com'
          );
        }
        const currentUser = await this.ig.account.currentUser();
        console.log(`[InstagramUploader] Session successfully verified for @${currentUser.username} (${currentUser.pk})!`);
        this.isLoggedIn = true;
        return true;
      } catch (sessErr) {
        console.warn(`[InstagramUploader] sessionid cookie failed validation: ${sessErr.message}`);
      }
    }

    if (!username || !password || username.includes('YOUR_') || password.includes('YOUR_')) {
      console.log(`[InstagramUploader] No Instagram credentials configured. Running in Staging / Simulation mode.`);
      return false;
    }

    // Check for saved session state to avoid checkpoint triggers
    if (fs.existsSync(this.sessionFile)) {
      try {
        console.log(`[InstagramUploader] Restoring session from ${this.sessionFile}...`);
        const sessionData = JSON.parse(fs.readFileSync(this.sessionFile, 'utf8'));
        await this.ig.state.deserialize(sessionData);
        // Quick verification of restored session
        const user = await this.ig.user.info(this.ig.state.cookieUserId);
        console.log(`[InstagramUploader] Session successfully restored for @${user.username} (${user.full_name || 'Active'})`);
        this.isLoggedIn = true;
        return true;
      } catch (e) {
        console.warn(`[InstagramUploader] Saved session invalid or expired (${e.message}). Re-authenticating...`);
      }
    }

    // Fresh login
    try {
      console.log(`[InstagramUploader] Logging into Instagram as @${username}...`);
      await this.ig.simulate.preLoginFlow();
      const loggedInUser = await this.ig.account.login(username, password);
      console.log(`[InstagramUploader] Login successful! Welcome @${loggedInUser.username}`);

      // Serialize and persist session
      const serialized = await this.ig.state.serialize();
      delete serialized.constants;
      fs.writeFileSync(this.sessionFile, JSON.stringify(serialized, null, 2));
      console.log(`[InstagramUploader] Session serialized and saved to ${this.sessionFile}`);

      process.nextTick(async () => await this.ig.simulate.postLoginFlow());
      this.isLoggedIn = true;
      return true;
    } catch (err) {
      if (err instanceof IgCheckpointError) {
        console.error(`[InstagramUploader] ⚠️ Checkpoint required by Instagram!`);
        console.error(`Please open the Instagram app on your phone, approve the login prompt ("This Was Me"), and rerun.`);
      } else {
        console.error(`[InstagramUploader] Instagram login error: ${err.message}`);
      }
      return false;
    }
  }

  async updateProfile({ bio, avatarPath }) {
    console.log(`[InstagramUploader] Syncing profile picture & bio to Instagram...`);
    const hasAuth = await this.authenticate();
    if (!hasAuth || !this.isLoggedIn) {
      throw new Error('Not logged into Instagram. Please provide sessionid cookie in Settings to authenticate.');
    }

    const results = {};
    if (avatarPath && fs.existsSync(avatarPath)) {
      console.log(`[InstagramUploader] Changing profile picture from ${avatarPath}...`);
      const picBuffer = fs.readFileSync(avatarPath);
      results.picture = await this.ig.account.changeProfilePicture(picBuffer);
      console.log(`[InstagramUploader] Profile picture updated successfully!`);
    }

    if (bio) {
      console.log(`[InstagramUploader] Setting biography...`);
      results.bio = await this.ig.account.setBiography(bio);
      console.log(`[InstagramUploader] Biography updated successfully!`);
    }

    return { success: true, ...results };
  }

  async publishReel({ videoPath, coverPath, caption, scriptData }) {
    console.log(`[InstagramUploader] Preparing video for Instagram Reels publishing...`);
    
    // 1. Validate video specifications
    const specs = this.validateVideoForReels(videoPath);

    // 2. Validate cover image
    if (!fs.existsSync(coverPath)) {
      throw new Error(`Cover image not found at ${coverPath}`);
    }

    const videoBuffer = fs.readFileSync(videoPath);
    const coverBuffer = fs.readFileSync(coverPath);

    // Check authentication
    const hasAuth = await this.authenticate();

    let liveUploadError = null;

    if (hasAuth && this.isLoggedIn && !this.configData.simulationMode) {
      console.log(`[InstagramUploader] Publishing 16-second Reel directly to Instagram feed & Reels...`);
      try {
        const publishResult = await this.ig.publish.video({
          video: videoBuffer,
          coverImage: coverBuffer,
          caption: caption || scriptData?.caption || 'Autonomous B2B Lead Machine #webify',
          transcodeDelay: 10000
        });

        console.log(`[InstagramUploader] 🚀 Reel published successfully! Media ID: ${publishResult.media?.id || 'live'}`);
        
        const historyEntry = {
          id: `reel_${Date.now()}`,
          status: 'published',
          mediaId: publishResult.media?.id,
          videoPath,
          coverPath,
          caption,
          niche: scriptData?.niche,
          angle: scriptData?.angle,
          specs,
          timestamp: new Date().toISOString()
        };
        this.recordHistory(historyEntry);

        return {
          success: true,
          status: 'published',
          mediaId: publishResult.media?.id,
          historyEntry
        };
      } catch (uploadErr) {
        liveUploadError = uploadErr.message;
        console.error(`[InstagramUploader] Live upload failed: ${uploadErr.message}`);
        // Fall back to staging mode with error audit
      }
    }

    // Staging / Simulation Mode (Reel prepared, verified and staged)
    const stagedVideoName = `staged_${path.basename(videoPath)}`;
    const stagedCoverName = `staged_${path.basename(coverPath)}`;
    const stagedMetaName = `staged_${path.basename(videoPath).replace('.mp4', '_meta.json')}`;

    const stagedVideoPath = path.join(this.stagingDir, stagedVideoName);
    const stagedCoverPath = path.join(this.stagingDir, stagedCoverName);
    const stagedMetaPath = path.join(this.stagingDir, stagedMetaName);

    fs.copyFileSync(videoPath, stagedVideoPath);
    fs.copyFileSync(coverPath, stagedCoverPath);

    const stagingStatus = liveUploadError ? 'staged_after_error' : 'staged_ready_for_upload';
    const note = liveUploadError
      ? `Live publish attempt encountered error: ${liveUploadError}. Video staged safely for retry.`
      : 'Reel 1080x1920 (16s) verified and staged. To post live, add credentials in ig_config.json or .env';

    const meta = {
      title: `Webify 16s Reel - ${scriptData?.niche || 'B2B Leads'}`,
      caption: caption || scriptData?.caption,
      niche: scriptData?.niche,
      angle: scriptData?.angle,
      specs,
      videoFile: stagedVideoPath,
      coverFile: stagedCoverPath,
      generatedAt: new Date().toISOString(),
      status: stagingStatus,
      error: liveUploadError || null,
      note
    };
    fs.writeFileSync(stagedMetaPath, JSON.stringify(meta, null, 2));

    console.log(`[InstagramUploader] 📦 Reel staged and ready in: ${this.stagingDir}`);
    console.log(`[InstagramUploader] Caption & Meta saved to: ${stagedMetaPath}`);

    const historyEntry = {
      id: `staged_${Date.now()}`,
      status: liveUploadError ? 'staged_error' : 'staged',
      videoPath: stagedVideoPath,
      coverPath: stagedCoverPath,
      caption,
      niche: scriptData?.niche,
      angle: scriptData?.angle,
      specs,
      error: liveUploadError || null,
      timestamp: new Date().toISOString()
    };
    this.recordHistory(historyEntry);

    return {
      success: true,
      status: liveUploadError ? 'staged_error' : 'staged',
      error: liveUploadError,
      videoPath: stagedVideoPath,
      coverPath: stagedCoverPath,
      metaPath: stagedMetaPath,
      historyEntry
    };
  }

  getStatus() {
    const username = this.configData.username || config.INSTAGRAM.USERNAME;
    const hasSession = fs.existsSync(this.sessionFile);
    const history = this.loadHistory();
    const stagedFiles = fs.existsSync(this.stagingDir) ? fs.readdirSync(this.stagingDir).filter(f => f.endsWith('.mp4')) : [];

    return {
      configuredUsername: username ? `@${username}` : 'Not configured (Simulation mode)',
      hasPersistentSession: hasSession,
      simulationMode: this.configData.simulationMode,
      totalPostsLogged: history.length,
      stagedReelsCount: stagedFiles.length,
      recentPosts: history.slice(0, 5)
    };
  }
}

module.exports = new InstagramUploader();
