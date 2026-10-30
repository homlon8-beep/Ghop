const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const surrealStoryEngine = require('./surrealStoryEngine');
const scriptGenerator = require('./scriptGenerator');
const flowClient = require('./flowClient');
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
      console.log(`[Step 1/3] Generating viral surreal script with Groq 120B memory...`);
      const storyData = await surrealStoryEngine.generateEpisode(forcePart);

      const scriptData = {
        ...storyData,
        niche: storyData.title,
        nicheId: `surreal_pt${storyData.part}_${Date.now()}`,
        caption: storyData.instagramCaption || storyData.caption,
        flowPrompts: {
          basePrompt: `${storyData.visualScenes?.[0]?.prompt || ''}, ${storyData.visualScenes?.[1]?.prompt || ''}`,
          extensionPrompt: `${storyData.visualScenes?.[2]?.prompt || ''}, ${storyData.visualScenes?.[3]?.prompt || ''}`
        }
      };

      this.state.status = 'generating_video';
      this.state.lastNiche = scriptData.title;
      this.saveState();

      // 2. Flow Video Generation (16-second exact with chaining or kinetic fallback)
      console.log(`\n[Step 2/3] Generating 16-second Reel video (Google Labs Flow multi-account / synthesis)...`);
      const videoResult = await flowClient.generate16sVideo(scriptData);

      this.state.status = shouldUpload ? 'publishing_reel' : 'staging_reel';
      this.saveState();

      // 3. Instagram Reels Publishing or Staging
      let publishResult;
      if (shouldUpload) {
        console.log(`\n[Step 3/3] Publishing 16-second Reel to Instagram...`);
        publishResult = await instagramUploader.publishReel({
          videoPath: videoResult.videoPath,
          coverPath: videoResult.coverPath,
          caption: scriptData.caption,
          scriptData
        });
      } else {
        console.log(`\n[Step 3/3] Staging 16-second Reel (Generate-only mode)...`);
        publishResult = {
          success: true,
          status: 'generated_staged',
          videoPath: videoResult.videoPath,
          coverPath: videoResult.coverPath
        };
      }

      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n======================================================`);
      console.log(`✅ [MorphVerse AI Bot] Cycle Completed Successfully in ${elapsedSec}s!`);
      console.log(`   Title: ${scriptData.title} (Part ${scriptData.part})`);
      console.log(`   Video: ${videoResult.resolution} | Duration: ${videoResult.durationSec}s`);
      console.log(`   Status: ${publishResult.status}`);
      console.log(`   Video Path: ${videoResult.videoPath}`);
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
