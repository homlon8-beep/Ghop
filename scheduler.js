const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const surrealStoryEngine = require('./surrealStoryEngine');
const scriptGenerator = require('./scriptGenerator');
const flowBrowserEngine = require('./flowBrowserEngine');
const instagramUploader = require('./instagramUploader');

class SocialBotScheduler {
  constructor() {
    this.stateFile = config.BOT_STATE_FILE;
    this.isExecuting = false;
    this.state = this.loadState();
    this.scheduledTasks = [];
  }

  loadState() {
    try {
      if (fs.existsSync(this.stateFile)) {
        return JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
      }
    } catch (e) {
      console.warn(`[Scheduler] Could not load state file: ${e.message}`);
    }
    return {
      status: 'idle',
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      lastRunAt: null,
      lastSlot: null,
      lastNiche: null,
      nextScheduledRun: null
    };
  }

  saveState() {
    try {
      fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
    } catch (e) {
      console.warn(`[Scheduler] Could not save state file: ${e.message}`);
    }
  }

  /**
   * Calculates next upcoming US Peak Times (11:30 AM EST and 7:30 PM EST)
   */
  getNextScheduledRuns() {
    const tz = config.SCHEDULE.TIMEZONE;
    const now = new Date();
    
    // Get current date parts in New York time
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false
    });
    
    const parts = formatter.formatToParts(now).reduce((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});

    const estHour = parseInt(parts.hour, 10) % 24;
    const estMinute = parseInt(parts.minute, 10);
    const estCurrentTotalMin = estHour * 60 + estMinute;

    const morningMin = 11 * 60 + 30; // 11:30 AM (690 mins)
    const eveningMin = 19 * 60 + 30; // 7:30 PM (1170 mins)

    let nextSlot = '';
    let minsUntil = 0;

    if (estCurrentTotalMin < morningMin) {
      nextSlot = 'Morning Peak (11:30 AM EST)';
      minsUntil = morningMin - estCurrentTotalMin;
    } else if (estCurrentTotalMin < eveningMin) {
      nextSlot = 'Evening Peak (7:30 PM EST)';
      minsUntil = eveningMin - estCurrentTotalMin;
    } else {
      nextSlot = 'Tomorrow Morning Peak (11:30 AM EST)';
      minsUntil = (24 * 60 - estCurrentTotalMin) + morningMin;
    }

    const hours = Math.floor(minsUntil / 60);
    const mins = minsUntil % 60;

    return {
      timezone: tz,
      currentTimeEST: `${String(estHour).padStart(2, '0')}:${String(estMinute).padStart(2, '0')} EST`,
      currentTimeLocal: now.toLocaleTimeString(),
      nextSlot,
      timeRemaining: `${hours}h ${mins}m`,
      morningCron: config.SCHEDULE.MORNING_CRON,
      eveningCron: config.SCHEDULE.EVENING_CRON
    };
  }

  /**
   * Executes a complete end-to-end autonomous post cycle:
   * 1. Generates unique surreal episodic script with Groq / story memory (Part 1 morning, Part 2 evening)
   * 2. Generates 16s video via Flow accounts (or kinetic synthesis engine)
   * 3. Publishes or stages Reel via Instagram private API
   * 4. Logs full audit record
   */
  async executeCycle(slotOrOptions = 'manual_trigger') {
    if (this.isExecuting) {
      console.warn(`[Scheduler] ⚠️ Post cycle already in progress. Skipping trigger.`);
      return { skipped: true, reason: 'cycle_in_progress' };
    }

    let slotName = 'manual_trigger';
    let forcePart = null;
    let shouldUpload = true;

    if (typeof slotOrOptions === 'string') {
      slotName = slotOrOptions;
      if (slotName.includes('morning')) {
        forcePart = 'part1';
      } else if (slotName.includes('evening')) {
        forcePart = 'part2';
      }
    } else if (typeof slotOrOptions === 'object' && slotOrOptions !== null) {
      slotName = slotOrOptions.slotName || slotOrOptions.slot || 'manual_trigger';
      forcePart = slotOrOptions.forcePart || null;
      shouldUpload = slotOrOptions.upload !== undefined ? slotOrOptions.upload : true;
    }

    this.isExecuting = true;
    const startTime = Date.now();
    console.log(`\n======================================================`);
    console.log(`🚀 [MorphVerse AI Bot] Starting Autonomous Reel Cycle [${slotName}]`);
    console.log(`   Time: ${new Date().toISOString()}`);
    console.log(`======================================================\n`);

    this.state.status = 'generating_script';
    this.saveState();

    try {
      // 1. Script Generation with Surreal Episodic Memory
      console.log(`[Step 1/3] Generating viral Indian meme script with Groq 120B memory...`);
      const storyData = await surrealStoryEngine.generateEpisode(forcePart);

      // Extract Shot 1 (0-8s Setup/Trigger) and Shot 2 (8-16s Climax/Explosion)
      const shot1Prompt = storyData.visualScenes?.[0]?.prompt || storyData.hook || 'Indian setting with chaotic meme action, 9:16 vertical 8k render';
      const shot2Prompt = storyData.visualScenes?.[1]?.prompt || 'Insane explosive escalation and cliffhanger freeze frame in Indian city, 9:16 vertical 8k render';

      const scriptData = {
        ...storyData,
        niche: storyData.title,
        nicheId: `desi_pt${storyData.part}_${Date.now()}`,
        caption: storyData.instagramCaption || storyData.caption,
        shot1Prompt,
        shot2Prompt
      };

      this.state.status = 'generating_video';
      this.state.lastNiche = scriptData.title;
      this.saveState();

      // 2. Google AI Pro Flow Veo 3.1 Two-Shot Video Generation & 1080p HD Mastering
      console.log(`\n[Step 2/3] Generating authentic Google Flow Veo 3.1 Two-Shot 16s Reel...`);
      console.log(`   Shot 1 Prompt: "${shot1Prompt.slice(0, 90)}..."`);
      console.log(`   Shot 2 Prompt: "${shot2Prompt.slice(0, 90)}..."`);
      const videoResult = await flowBrowserEngine.generateVeoVideo({
        shot1: shot1Prompt,
        shot2: shot2Prompt
      });

      this.state.status = shouldUpload ? 'publishing_reel' : 'staging_reel';
      this.saveState();

      // 3. Instagram Reels Publishing or Staging
      let publishResult;
      if (shouldUpload) {
        console.log(`\n[Step 3/3] Publishing Veo 3.1 Reel to Instagram @feticid...`);
        publishResult = await instagramUploader.publishViaWebAPI(videoResult.videoPath, scriptData.caption);
        instagramUploader.recordHistory({
          id: `reel_${Date.now()}`,
          status: 'published',
          mediaId: publishResult.mediaId,
          code: publishResult.code,
          reelUrl: publishResult.reelUrl,
          videoPath: videoResult.videoPath,
          caption: scriptData.caption,
          niche: scriptData.title,
          part: scriptData.part,
          source: 'google-flow-veo-3.1',
          timestamp: new Date().toISOString()
        });
      } else {
        console.log(`\n[Step 3/3] Staging Veo 3.1 Reel (Generate-only mode)...`);
        publishResult = {
          success: true,
          status: 'generated_staged',
          videoPath: videoResult.videoPath
        };
        instagramUploader.recordHistory({
          id: `reel_${Date.now()}`,
          status: 'generated_staged',
          videoPath: videoResult.videoPath,
          caption: scriptData.caption,
          niche: scriptData.title,
          part: scriptData.part,
          source: 'google-flow-veo-3.1',
          timestamp: new Date().toISOString()
        });
      }

      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n======================================================`);
      console.log(`✅ [MorphVerse AI Bot] Cycle Completed Successfully in ${elapsedSec}s!`);
      console.log(`   Title: ${scriptData.title} (Part ${scriptData.part})`);
      console.log(`   Veo Video: ${videoResult.videoPath}`);
      console.log(`   Reel: ${publishResult.reelUrl || 'Staged'}`);
      console.log(`======================================================\n`);

      // Update State
      this.state.status = 'idle';
      this.state.totalRuns = (this.state.totalRuns || 0) + 1;
      this.state.successfulRuns = (this.state.successfulRuns || 0) + 1;
      this.state.lastRunAt = new Date().toISOString();
      this.state.lastSlot = slotName;
      this.saveState();

      return {
        success: true,
        slotName,
        scriptData,
        videoResult,
        publishResult,
        elapsedSec
      };
    } catch (error) {
      console.error(`\n❌ [Scheduler] Error during autonomous cycle: ${error.message}`);
      console.error(error.stack);

      this.state.status = 'error';
      this.state.failedRuns = (this.state.failedRuns || 0) + 1;
      this.saveState();

      return {
        success: false,
        error: error.message
      };
    } finally {
      this.isExecuting = false;
    }
  }

  /**
   * Starts the 2x daily autonomous daemon
   */
  startAutonomousSchedule() {
    return this.startDaemon();
  }

  startDaemon() {
    if (this.scheduledTasks.length > 0) {
      console.warn(`[Scheduler] ⚠️ Daemon is already active with ${this.scheduledTasks.length} scheduled tasks.`);
      return;
    }

    console.log(`\n🤖 [Webify Social Bot Daemon] Initializing US Peak-Time Autonomous Scheduler...`);
    console.log(`   Timezone: ${config.SCHEDULE.TIMEZONE}`);
    console.log(`   Slot 1: ${config.SCHEDULE.MORNING_DESC} [Cron: ${config.SCHEDULE.MORNING_CRON}]`);
    console.log(`   Slot 2: ${config.SCHEDULE.EVENING_DESC} [Cron: ${config.SCHEDULE.EVENING_CRON}]`);

    const nextInfo = this.getNextScheduledRuns();
    console.log(`\n⏰ Current Time in EST: ${nextInfo.currentTimeEST}`);
    console.log(`⏳ Next Scheduled Post: ${nextInfo.nextSlot} (in ${nextInfo.timeRemaining})`);

    // Morning Peak: 11:30 AM EST
    const morningTask = cron.schedule(config.SCHEDULE.MORNING_CRON, async () => {
      console.log(`\n⏰ [CRON TRIGGER] 11:30 AM EST Morning Peak Arrived!`);
      await this.executeCycle('morning_peak_11_30_am_est');
    }, {
      timezone: config.SCHEDULE.TIMEZONE
    });

    // Evening Peak: 7:30 PM EST
    const eveningTask = cron.schedule(config.SCHEDULE.EVENING_CRON, async () => {
      console.log(`\n⏰ [CRON TRIGGER] 7:30 PM EST Evening Peak Arrived!`);
      await this.executeCycle('evening_peak_7_30_pm_est');
    }, {
      timezone: config.SCHEDULE.TIMEZONE
    });

    this.scheduledTasks.push(morningTask, eveningTask);
    console.log(`\n🟢 Daemon active. Running autonomously 2 times a day with zero human touch.\n`);

    // Register clean shutdown
    const cleanup = () => {
      console.log(`\n[Scheduler] Caught interrupt signal. Shutting down daemon...`);
      this.stopDaemon();
      process.exit(0);
    };
    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);
  }

  stopDaemon() {
    this.scheduledTasks.forEach(t => t.stop());
    this.scheduledTasks = [];
    console.log(`[Scheduler] Daemon stopped.`);
  }

  getStatus() {
    const nextInfo = this.getNextScheduledRuns();
    return {
      state: this.state,
      schedulerInfo: nextInfo,
      isExecuting: this.isExecuting
    };
  }
}

module.exports = new SocialBotScheduler();
