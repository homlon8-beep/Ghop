#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const config = require('./config');
const surrealStoryEngine = require('./surrealStoryEngine');
const flowClient = require('./flowClient');
const videoSynthesizer = require('./videoSynthesizer');
const instagramUploader = require('./instagramUploader');
const scheduler = require('./scheduler');

function printBanner() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║               MORPHVERSE AI • SURREAL REELS BOT                      ║
║     Autonomous 16-Second Viral Episodic Sagas & Dopamine Reels       ║
╚══════════════════════════════════════════════════════════════════════╝
`);
}

function printHelp() {
  printBanner();
  console.log(`Usage:
  node index.js [flag]

Flags:
  --post-now       Immediately triggers full autonomous cycle using memory continuity:
                   (Groq Episodic Script -> 16s Video -> Instagram Reel upload -> Log)
  
  --pt1            Forces generation of PART 1 (The Hook & Cliffhanger)
  
  --pt2            Forces generation of PART 2 (The Finale resolving Part 1's cliffhanger)
  
  --generate-only  Generates the 16s video, cover frame, script & caption without uploading
  
  --status         Displays Groq story memory, active saga, cliffhanger, next episode due,
                   Flow account pool, Instagram session, and scheduled times
  
  --daemon         Runs continuously as a background service, posting 2x daily autonomously
                   during US Instagram peak traffic hours (11:30 AM EST & 7:30 PM EST)
  
  --test           Executes comprehensive self-test verification suite
  
  --help           Displays this help screen
`);
}

async function handlePostNow() {
  printBanner();
  console.log(`[CLI] Triggering immediate end-to-end post cycle with episodic memory...`);
  const result = await scheduler.executeCycle('cli_post_now');
  if (result.success) {
    console.log(`\n🎉 Cycle Completed Successfully!`);
    console.log(`Title: ${result.scriptData.title} (Part ${result.scriptData.part})`);
    console.log(`Video File: ${result.videoResult.videoPath}`);
    console.log(`Cover File: ${result.videoResult.coverPath}`);
    console.log(`Status: ${result.publishResult.status}`);
  } else {
    console.error(`\n❌ Cycle encountered an issue: ${result.error}`);
    process.exit(1);
  }
}

async function handleSpecificPart(part) {
  printBanner();
  console.log(`[CLI] Generating PART ${part} specifically...`);
  const result = await scheduler.executeCycle({
    slotName: `cli_pt${part}`,
    forcePart: `part${part}`,
    upload: false
  });
  if (result.success) {
    console.log(`\n🎉 Part ${part} Created!`);
    console.log(`Title: ${result.scriptData.title}`);
    console.log(`Video File: ${result.videoResult.videoPath}`);
    console.log(`Cover File: ${result.videoResult.coverPath}`);
    console.log(`Caption:\n${result.scriptData.caption}`);
  } else {
    console.error(`\n❌ Error: ${result.error}`);
    process.exit(1);
  }
}

async function handleGenerateOnly() {
  printBanner();
  console.log(`[CLI] Running generation-only mode (No Instagram upload)...`);
  const result = await scheduler.executeCycle({
    slotName: 'cli_generate_only',
    upload: false
  });
  if (result.success) {
    console.log(`\n======================================================`);
    console.log(`✅ 16-Second Video & Assets Generated in ${result.elapsedSec}s!`);
    console.log(`   Title: ${result.scriptData.title} (Part ${result.scriptData.part})`);
    console.log(`   Video File: ${result.videoResult.videoPath}`);
    console.log(`   Cover File: ${result.videoResult.coverPath}`);
    console.log(`\n📝 Generated Instagram Caption:\n------------------------------------------------------`);
    console.log(result.scriptData.caption);
    console.log(`------------------------------------------------------\n`);
  } else {
    console.error(`\n❌ Error: ${result.error}`);
    process.exit(1);
  }
}

async function handleStatus() {
  printBanner();
  console.log(`🔍 [SYSTEM STATUS AUDIT]\n`);

  // 1. Groq Brain & Story Memory
  const mem = surrealStoryEngine.getMemoryStatus();
  console.log(`🧠 Groq Story Brain & Episodic Continuity:`);
  console.log(`   Active Series ID: ${mem.activeSeriesId}`);
  console.log(`   Current Saga: "${mem.currentStory.title}"`);
  console.log(`   Characters: ${mem.currentStory.characters.join(', ') || 'None'}`);
  console.log(`   Part 1 Summary: ${mem.currentStory.part1Summary || 'None'}`);
  console.log(`   Cliffhanger in Memory: "${mem.currentStory.cliffhanger || 'None'}"`);
  console.log(`   Last Uploaded Part: ${mem.lastUploadedPart ? 'Part ' + mem.lastUploadedPart : 'None'}`);
  console.log(`   Next Episode Due: ${mem.nextEpisodeDue ? mem.nextEpisodeDue.toUpperCase() : 'PART 1'}`);
  console.log(`   Total Completed Sagas: ${mem.totalCompletedSagas}`);

  // 2. Flow Accounts Pool
  const flowPool = flowClient.getPoolStatus();
  console.log(`\n📊 Google Labs Flow / Veo Multi-Account Pool:`);
  console.log(`   Total Accounts in Pool: ${flowPool.totalAccounts}`);
  console.log(`   Active Accounts: ${flowPool.activeAccounts}`);
  console.log(`   Total Quota Remaining: ${flowPool.totalQuotaRemaining}`);
  if (flowPool.accounts.length > 0) {
    flowPool.accounts.forEach((a, i) => {
      console.log(`     [${i + 1}] ${a.name} (${a.email || 'Cookie Session'}) - Status: ${a.status} - Quota: ${a.quotaRemaining} remaining`);
    });
  }

  // 3. Instagram Health
  const igStatus = instagramUploader.getStatus();
  console.log(`\n📸 Instagram Automation Status:`);
  console.log(`   Account: @${igStatus.configuredUsername || 'not_configured'}`);
  console.log(`   Persistent Session File: ${igStatus.hasPersistentSession ? 'Active (ig_session.json)' : 'None (login required or staged)'}`);
  console.log(`   Simulation / Staging Mode: ${igStatus.simulationMode ? 'Enabled' : 'Disabled (Live)'}`);
  console.log(`   Staged Reels Ready for Upload: ${igStatus.stagedReelsCount}`);

  // 4. Scheduler & US Peak Times
  const schedInfo = scheduler.getNextScheduledRuns();
  console.log(`\n⏰ US Peak-Time Autonomous Schedule (2x Daily):`);
  console.log(`   Timezone: ${schedInfo.timezone}`);
  console.log(`   Current EST Time: ${schedInfo.currentTimeEST}`);
  console.log(`   Slot 1: 11:30 AM EST (Morning Peak - Part 1 Hook)`);
  console.log(`   Slot 2: 7:30 PM EST (Evening Peak - Part 2 Finale)`);
  console.log(`   Next Upcoming Post: ${schedInfo.nextSlot} (in ${schedInfo.timeRemaining})\n`);
}

function handleDaemon() {
  printBanner();
  scheduler.startDaemon();
}

async function main() {
  const arg = process.argv[2] || '--help';

  switch (arg) {
    case '--post-now':
      await handlePostNow();
      break;
    case '--pt1':
      await handleSpecificPart(1);
      break;
    case '--pt2':
      await handleSpecificPart(2);
      break;
    case '--generate-only':
      await handleGenerateOnly();
      break;
    case '--status':
      await handleStatus();
      break;
    case '--daemon':
      handleDaemon();
      break;
    case '--test':
      await require('./test_bot')();
      break;
    case '--help':
    default:
      printHelp();
      break;
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal bot error:', err);
    process.exit(1);
  });
}

module.exports = { main };
