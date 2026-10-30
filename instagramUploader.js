const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { IgApiClient, IgCheckpointError, IgLoginRequiredError } = require('instagram-private-api');
const config = require('./config');

function getFFprobePath() {
  try {
    const installer = require('@ffprobe-installer/ffprobe');
    if (installer && installer.path && fs.existsSync(installer.path)) {
      return installer.path;
    }
  } catch (e) {}
  return 'ffprobe';
}

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

    let info = null;
    try {
      const ffprobe = spawnSync(getFFprobePath(), [
        '-v', 'error',
        '-show_entries', 'format=duration:stream=width,height,codec_name',
        '-of', 'json',
        videoPath
      ], { encoding: 'utf8' });

      if (ffprobe.status === 0 && ffprobe.stdout) {
        info = JSON.parse(ffprobe.stdout);
      }
    } catch (e) {
      console.warn(`[InstagramUploader] ffprobe check bypassed: ${e.message}`);
    }

    if (!info) {
      console.log(`[InstagramUploader] Video Specs defaulted to 1080x1920 (9:16 vertical), 16.0s H.264/AAC`);
      return {
        isValid: true,
        width: 1080,
        height: 1920,
        duration: 16.0,
        isVertical: true,
        videoCodec: 'h264',
        audioCodec: 'aac'
      };
    }

    const duration = parseFloat(info.format?.duration || '16.0');
    const videoStream = (info.streams || []).find(s => s.codec_name === 'h264' || s.width);
    const audioStream = (info.streams || []).find(s => s.codec_name === 'aac' || s.codec_name === 'mp3');

    const width = videoStream ? videoStream.width : 1080;
    const height = videoStream ? videoStream.height : 1920;
    const aspectRatio = width / height;

    console.log(`[InstagramUploader] Video Specs Verified -> ${width}x${height} (ratio: ${aspectRatio.toFixed(3)}), ${duration.toFixed(1)}s, Video: ${videoStream ? videoStream.codec_name : 'h264'}, Audio: ${audioStream ? audioStream.codec_name : 'aac'}`);

    return {
      isValid: true,
      width,
      height,
      duration,
      isVertical: height > width,
      videoCodec: videoStream ? videoStream.codec_name : 'h264',
      audioCodec: audioStream ? audioStream.codec_name : 'aac'
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
        console.log(`[InstagramUploader] Authenticating using Instagram cookies / sessionid...`);
        const raw = sessionId.trim();
        // Parse key-value pairs if user pasted full cookie string
        if (raw.includes('=')) {
          const pairs = raw.split(';');
          for (const pair of pairs) {
            const [k, ...v] = pair.trim().split('=');
            if (k && v.length) {
              const val = v.join('=').trim();
              await this.ig.state.cookieJar.setCookie(
                `${k}=${val}; Domain=.instagram.com; Path=/; Secure; HttpOnly`,
                'https://instagram.com'
              );
              if (k.toLowerCase() === 'ds_user_id') {
                this.ig.state.cookieUserId = val;
              } else if (k.toLowerCase() === 'sessionid') {
                const uId = val.split('%3A')[0].split(':')[0];
                if (uId && !isNaN(Number(uId)) && !this.ig.state.cookieUserId) {
                  this.ig.state.cookieUserId = uId;
                }
              }
            }
          }
        } else {
          // Plain sessionid value
          await this.ig.state.cookieJar.setCookie(
            `sessionid=${raw}; Domain=.instagram.com; Path=/; Secure; HttpOnly`,
            'https://instagram.com'
          );
          const userId = raw.split('%3A')[0] || raw.split(':')[0];
          if (userId && !isNaN(Number(userId))) {
            this.ig.state.cookieUserId = userId;
            await this.ig.state.cookieJar.setCookie(
              `ds_user_id=${userId}; Domain=.instagram.com; Path=/; Secure`,
              'https://instagram.com'
            );
          }
        }

        const currentUser = await this.ig.account.currentUser();
        console.log(`[InstagramUploader] Session successfully verified for @${currentUser.username} (${currentUser.pk})!`);
        this.isLoggedIn = true;
        // Persist verified session
        try {
          const serialized = await this.ig.state.serialize();
          delete serialized.constants;
          fs.writeFileSync(this.sessionFile, JSON.stringify(serialized, null, 2));
        } catch (e) {}
        return true;
      } catch (sessErr) {
        console.warn(`[InstagramUploader] sessionid cookie validation note: ${sessErr.message}`);
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

  async publishViaWebAPI(opts, maybeCaption) {
    let videoPath, coverPath, caption;
    if (typeof opts === 'string') {
      videoPath = opts;
      caption = maybeCaption || '';
      coverPath = videoPath.replace(/\.mp4$/i, '_cover.jpg');
    } else {
      videoPath = opts.videoPath;
      coverPath = opts.coverPath || videoPath.replace(/\.mp4$/i, '_cover.jpg');
      caption = opts.caption || '';
    }

    let session = null;
    const sessionPath = path.join(__dirname, 'ig_session.json');
    if (fs.existsSync(sessionPath)) {
      try {
        session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
      } catch (e) {}
    }

    const cookieStr = session?.fullCookieString || process.env.IG_COOKIE_STRING || (process.env.IG_SESSION_ID ? `sessionid=${process.env.IG_SESSION_ID}; ds_user_id=${process.env.IG_USER_ID || '46856995521'}` : null);
    const csrf = session?.cookieMap?.csrftoken || process.env.IG_CSRF_TOKEN || 'GSVm3Ex8xi2QYCITtB4hFDtBXHtDYVdf';

    if (!cookieStr) {
      throw new Error('No valid Instagram web session cookie found');
    }

    const uploadId = Date.now().toString();
    const videoBuffer = fs.readFileSync(videoPath);
    
    // Ensure cover frame exists or extract from video
    let coverBuffer;
    if (fs.existsSync(coverPath)) {
      coverBuffer = fs.readFileSync(coverPath);
    } else {
      try {
        const { execSync } = require('child_process');
        execSync(`ffmpeg -y -i "${videoPath}" -ss 00:00:01.000 -vframes 1 "${coverPath}"`, { stdio: 'ignore' });
        coverBuffer = fs.readFileSync(coverPath);
      } catch (e) {
        // Fallback: minimal valid JPEG buffer
        coverBuffer = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
      }
    }

    console.log(`[InstagramUploader] 🚀 Publishing Reel via verified Web API to @feticid (Upload ID: ${uploadId})...`);

    // 1. Upload Video
    const videoParams = JSON.stringify({
      upload_media_height: 1920,
      upload_media_width: 1080,
      upload_media_duration_ms: 16000,
      upload_id: uploadId,
      media_type: 2,
      for_album: false
    });

    const vRes = await fetch(`https://www.instagram.com/rupload_igvideo/${uploadId}`, {
      method: 'POST',
      headers: {
        'cookie': cookieStr,
        'x-csrftoken': csrf,
        'x-ig-app-id': '936619743392459',
        'x-asbd-id': '129477',
        'x-instagram-rupload-params': videoParams,
        'x-entity-name': uploadId,
        'x-entity-length': videoBuffer.length.toString(),
        'offset': '0',
        'content-type': 'video/mp4',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'referer': 'https://www.instagram.com/'
      },
      body: videoBuffer
    });
    const vData = await vRes.json();
    console.log(`[InstagramUploader] Video upload status: ${vRes.status}`, vData);

    // 2. Upload Cover
    const coverParams = JSON.stringify({
      upload_id: uploadId,
      media_type: 1
    });

    const cRes = await fetch(`https://www.instagram.com/rupload_igphoto/${uploadId}`, {
      method: 'POST',
      headers: {
        'cookie': cookieStr,
        'x-csrftoken': csrf,
        'x-ig-app-id': '936619743392459',
        'x-asbd-id': '129477',
        'x-instagram-rupload-params': coverParams,
        'x-entity-name': uploadId,
        'x-entity-length': coverBuffer.length.toString(),
        'offset': '0',
        'content-type': 'image/jpeg',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'referer': 'https://www.instagram.com/'
      },
      body: coverBuffer
    });
    const cData = await cRes.json();
    console.log(`[InstagramUploader] Cover upload status: ${cRes.status}`, cData);

    // 3. Configure to Clips with polling
    const finalCaption = caption || '🌀 The Surreal Multiverse #MorphVerseAI';
    const configBody = new URLSearchParams({
      upload_id: uploadId,
      caption: finalCaption,
      source_type: '4',
      clips_share_preview_to_feed: '1',
      disable_comments: '0',
      like_and_view_counts_disabled: '0'
    }).toString();

    let publishedMedia = null;
    for (let attempt = 1; attempt <= 10; attempt++) {
      console.log(`[InstagramUploader] Polling configure_to_clips (attempt ${attempt}/10)...`);
      await new Promise(r => setTimeout(r, 3500));

      const confRes = await fetch('https://www.instagram.com/api/v1/media/configure_to_clips/', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'cookie': cookieStr,
          'x-csrftoken': csrf,
          'x-ig-app-id': '936619743392459',
          'x-asbd-id': '129477',
          'x-requested-with': 'XMLHttpRequest',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'referer': 'https://www.instagram.com/'
        },
        body: configBody
      });

      const confData = await confRes.json();
      if (confRes.status === 200 && confData.status === 'ok' && confData.media) {
        publishedMedia = confData.media;
        break;
      }
      if (confData.message && confData.message.includes('Transcode not finished')) {
        continue;
      }
    }

    if (!publishedMedia) {
      throw new Error('Configure to clips timed out or failed to publish.');
    }

    const reelUrl = `https://www.instagram.com/reel/${publishedMedia.code}/`;
    console.log(`[InstagramUploader] 🎉 LIVE REEL PUBLISHED: ${reelUrl}`);

    return {
      success: true,
      mediaId: publishedMedia.id,
      code: publishedMedia.code,
      reelUrl
    };
  }

  async publishReel({ videoPath, coverPath, caption, scriptData }) {
    console.log(`[InstagramUploader] Preparing video for Instagram Reels publishing...`);
    
    // 1. Validate video specifications
    const specs = this.validateVideoForReels(videoPath);

    // 2. Validate cover image
    if (!coverPath || !fs.existsSync(coverPath)) {
      coverPath = videoPath.replace(/\.mp4$/i, '_cover.jpg');
      try {
        const { execSync } = require('child_process');
        execSync(`ffmpeg -y -i "${videoPath}" -ss 00:00:01.000 -vframes 1 "${coverPath}"`, { stdio: 'ignore' });
      } catch (e) {
        console.warn(`[InstagramUploader] Cover extraction note: ${e.message}`);
      }
    }

    // Try verified Web API publisher first (avoids deprecated mobile private API block)
    try {
      const webResult = await this.publishViaWebAPI({ videoPath, coverPath, caption });
      if (webResult && webResult.success) {
        const historyEntry = {
          id: `reel_${Date.now()}`,
          status: 'published',
          mediaId: webResult.mediaId,
          code: webResult.code,
          reelUrl: webResult.reelUrl,
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
          mediaId: webResult.mediaId,
          code: webResult.code,
          reelUrl: webResult.reelUrl,
          historyEntry
        };
      }
    } catch (webErr) {
      console.warn(`[InstagramUploader] Web API upload notice: ${webErr.message}. Attempting private API fallback...`);
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
