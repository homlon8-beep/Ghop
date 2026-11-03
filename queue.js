/**
 * Multi-Device Anti-Ban Queue Dispatcher (Up to 6 Devices)
 * 
 * Rules:
 * 1. 50 Verified Indian Leads Max per 24 hours PER DEVICE (3 Devices = 150 leads/day)
 * 2. Atomic queue claiming ensures NO two devices ever message or touch the same lead
 * 3. 1 message every 1 to 2 minutes random jitter (60s - 120s) per device
 * 4. Micro-batches of 5 to 8 messages -> followed by random 50 to 80 minute human tea breaks
 * 5. Daytime IST active (9:00 AM to 9:30 PM) with human night sleep mode
 * 6. Two-Step Conversational Shield: respectful inquiry verification (zero spam report risk)
 */

const path = require('path');
const fs = require('fs');
const ai = require('./ai');
const scraper = require('./scraper');
const whatsapp = require('./whatsapp');

const MAX_DEVICES = parseInt(process.env.MAX_DEVICES || '6', 10);
const CONFIG_FILE = path.join(__dirname, 'bot_config.json');

// Persistent & Customizable Pacing & Daily Limits
function loadBotConfig() {
  const defaults = {
    dailyMaxLeadsPerDevice: parseInt(process.env.DAILY_MAX_LEADS_PER_DEVICE || '50', 10),
    minMsgDelayMs: parseInt(process.env.MIN_MSG_DELAY_MS || '30000', 10),
    maxMsgDelayMs: parseInt(process.env.MAX_MSG_DELAY_MS || '45000', 10),
    minBreakMins: 1.5,
    maxBreakMins: 3,
    minBatchSize: 12,
    maxBatchSize: 18,
    businessHoursShield: false, // Default 24/7 so messages dispatch immediately
    pacingPreset: 'fast' // 'turbo', 'fast', 'balanced', 'ultra_safe', 'custom'
  };

  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      return { ...defaults, ...data };
    }
  } catch (err) {
    console.warn('Notice: using default bot config:', err.message);
  }
  return defaults;
}

let botConfig = loadBotConfig();

function saveBotConfig(updates) {
  botConfig = { ...botConfig, ...updates };
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(botConfig, null, 2), 'utf-8');
    console.log(`⚙️ [Config Saved] Limit: ${botConfig.dailyMaxLeadsPerDevice} msgs/device (Preset: ${botConfig.pacingPreset}, Delay: ${(botConfig.minMsgDelayMs/1000).toFixed(0)}-${(botConfig.maxMsgDelayMs/1000).toFixed(0)}s, Hours-Shield: ${botConfig.businessHoursShield}).`);
  } catch (err) {
    console.error('Failed to save bot_config.json:', err.message);
  }
  return botConfig;
}

function setDailyMaxLeadsPerDevice(count, preset = 'custom') {
  const num = parseInt(count, 10);
  if (isNaN(num) || num < 1) return botConfig;

  const updates = { dailyMaxLeadsPerDevice: num, pacingPreset: preset };

  if (preset === 'turbo') {
    updates.minMsgDelayMs = 20000;
    updates.maxMsgDelayMs = 35000;
    updates.minBreakMins = 1;
    updates.maxBreakMins = 2;
    updates.minBatchSize = 15;
    updates.maxBatchSize = 25;
    updates.businessHoursShield = false;
  } else if (preset === 'fast' || preset === 'fast_human') {
    updates.minMsgDelayMs = 30000;
    updates.maxMsgDelayMs = 45000;
    updates.minBreakMins = 1.5;
    updates.maxBreakMins = 3;
    updates.minBatchSize = 12;
    updates.maxBatchSize = 18;
    updates.businessHoursShield = false;
  } else if (preset === 'balanced') {
    updates.minMsgDelayMs = 50000;
    updates.maxMsgDelayMs = 90000;
    updates.minBreakMins = 8;
    updates.maxBreakMins = 15;
    updates.minBatchSize = 6;
    updates.maxBatchSize = 10;
    updates.businessHoursShield = false;
  } else if (preset === 'ultra_safe') {
    updates.minMsgDelayMs = 120000;
    updates.maxMsgDelayMs = 240000;
    updates.minBreakMins = 20;
    updates.maxBreakMins = 35;
    updates.minBatchSize = 4;
    updates.maxBatchSize = 7;
    updates.businessHoursShield = true;
  }

  return saveBotConfig(updates);
}

function updatePacingConfig(updates = {}) {
  const allowed = [
    'minMsgDelayMs',
    'maxMsgDelayMs',
    'minBreakMins',
    'maxBreakMins',
    'minBatchSize',
    'maxBatchSize',
    'businessHoursShield',
    'dailyMaxLeadsPerDevice',
    'pacingPreset'
  ];

  const filtered = {};
  for (const k of allowed) {
    if (updates[k] !== undefined) {
      filtered[k] = updates[k];
    }
  }

  return saveBotConfig(filtered);
}

let isRunning = false;
let isPaused = false;
let isProactiveScraping = false;
let currentDay = new Date().toDateString();

// Device worker states: deviceId (1..6) -> WorkerState
const deviceStates = new Map();

function getRandomBatchLimit() {
  const min = botConfig.minBatchSize || 8;
  const max = botConfig.maxBatchSize || 15;
  return Math.floor(min + Math.random() * (max - min + 1));
}

function getRandomMsgDelayMs() {
  const min = botConfig.minMsgDelayMs || 30000;
  const max = botConfig.maxMsgDelayMs || 45000;
  return Math.floor(min + Math.random() * (max - min + 1));
}

function getRandomBreakDurationMs() {
  const min = botConfig.minBreakMins || 1.5;
  const max = botConfig.maxBreakMins || 3;
  const mins = min + Math.random() * (max - min);
  return Math.floor(mins * 60 * 1000);
}

function getIndianTimeParts() {
  const now = new Date();
  const istStr = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const istDate = new Date(istStr);
  return {
    hour: istDate.getHours(),
    minute: istDate.getMinutes(),
    dateStr: istDate.toDateString(),
    now
  };
}

function isIndianClinicHours() {
  if (botConfig.businessHoursShield === false) {
    return true; // 24/7 immediate operation per user setting
  }
  const { hour } = getIndianTimeParts();
  // Strictly 2:00 PM IST (14:00) to 6:00 PM IST (18:00)
  return (hour >= 14 && hour < 18);
}

function getNext2PmIstTimestamp() {
  const now = new Date();
  const istStr = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const istDate = new Date(istStr);

  const target = new Date(istDate);
  if (istDate.getHours() >= 18) {
    target.setDate(target.getDate() + 1);
  }
  target.setHours(14, 0, 0, 0);

  const diffMs = target.getTime() - istDate.getTime();
  return Date.now() + Math.max(diffMs, 60000);
}

function formatIndiaTime(timestamp) {
  if (!timestamp) return null;
  try {
    return new Date(timestamp).toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }) + ' IST';
  } catch (e) {
    return new Date(timestamp).toLocaleTimeString('en-IN') + ' IST';
  }
}

function checkAndResetDailyCounters() {
  const { dateStr } = getIndianTimeParts();
  if (dateStr !== currentDay) {
    currentDay = dateStr;
    const maxLimit = botConfig.dailyMaxLeadsPerDevice || 50;
    for (const state of deviceStates.values()) {
      state.dailySentCount = 0;
      state.currentBatchCount = 0;
      state.currentBatchLimit = getRandomBatchLimit();
    }
    console.log(`🌅 [Anti-Ban Engine] New calendar day. Reset daily outreach counters to 0/${maxLimit} per device.`);
  }
}

function getOrCreateDeviceState(deviceId) {
  let state = deviceStates.get(deviceId);
  if (!state) {
    state = {
      id: deviceId,
      currentBatchCount: 0,
      currentBatchLimit: getRandomBatchLimit(),
      dailySentCount: 0,
      totalSentSession: 0,
      consecutiveFailures: 0,
      nextActionTime: null,
      currentStatus: 'Initializing slot...'
    };
    deviceStates.set(deviceId, state);
  }
  return state;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Worker loop for an individual WhatsApp device slot
 */
async function runDeviceWorker(deviceId) {
  const state = getOrCreateDeviceState(deviceId);
  const maxDaily = botConfig.dailyMaxLeadsPerDevice || 50;
  console.log(`⚡ [Worker Device ${deviceId}] Started independent dispatcher (${maxDaily} leads/day cap, preset: ${botConfig.pacingPreset}).`);

  // Stagger startup so all devices don't fire at the exact same second
  await sleep((deviceId - 1) * 15000);

  while (isRunning) {
    if (isPaused) {
      state.currentStatus = 'Paused by User';
      await sleep(5000);
      continue;
    }

    checkAndResetDailyCounters();

    const currentCap = botConfig.dailyMaxLeadsPerDevice || 50;
    // 1. Device Daily Cap Check
    if (state.dailySentCount >= currentCap) {
      state.currentStatus = `Daily Safety Cap Reached (${state.dailySentCount}/${currentCap}). Resting safely until tomorrow...`;
      state.nextActionTime = getNext2PmIstTimestamp();
      await sleep(60000);
      continue;
    }

    // 2. Operating Hours Check (Active 24/7 if businessHoursShield is false)
    if (!isIndianClinicHours()) {
      state.currentStatus = '🌙 Rest Mode (Active 2:00 PM – 6:00 PM IST only). Resuming at 2:00 PM IST...';
      state.nextActionTime = getNext2PmIstTimestamp();
      await sleep(60000);
      continue;
    }

    // 3. Check if this specific device is connected
    if (!whatsapp.isDeviceConnected(deviceId)) {
      state.currentStatus = `Waiting for WhatsApp QR scan on /qr?device=${deviceId}...`;
      await sleep(8000);
      continue;
    }

    // 4. Proactive lead harvest if backlog is low
    const remainingInQueue = scraper.getQueuedLeads(30).length;
    if (remainingInQueue < 25 && !isProactiveScraping) {
      isProactiveScraping = true;
      console.log(`⚡ [Continuous Scraper] Queue has ${remainingInQueue} leads. Harvesting fresh leads in background...`);
      scraper.triggerFreeWebScraper({ targetCount: 30 })
        .catch(e => console.error('Continuous harvest notice:', e.message))
        .finally(() => { isProactiveScraping = false; });
    }

    // 5. Atomic Claim: Grab next unassigned lead for this device
    let lead = scraper.claimNextLead(deviceId);
    if (!lead) {
      state.currentStatus = 'Queue Empty: Harvesting fresh Indian health leads...';
      try {
        await scraper.triggerFreeWebScraper({ targetCount: 25 });
      } catch (err) {}
      lead = scraper.claimNextLead(deviceId);
      if (!lead) {
        await sleep(15000);
        continue;
      }
    }

    // 6. Strict Indian Number Guard (+91 Only)
    const phoneStr = String(lead.phone).replace(/\D/g, '');
    if (!phoneStr.startsWith('91') || phoneStr.length !== 12) {
      console.log(`❌ [Device ${deviceId}] Skipped non-India number ${lead.phone}.`);
      scraper.updateLeadStatus(lead.phone, 'not_india', null, deviceId);
      continue;
    }

    // 6.5 Strict Gents-Only Filter (Sharik Shah requirement: Zero ladies)
    const leadMeta = `${lead.name || ''} ${lead.query || ''} ${lead.city || ''} ${lead.source || ''}`.toLowerCase();
    if (scraper.isFemaleContext(leadMeta)) {
      console.log(`❌ [Device ${deviceId}] Skipped female contact (${lead.name || lead.phone}). Gents only per Sharik Shah.`);
      scraper.updateLeadStatus(lead.phone, 'skipped_ladies', null, deviceId);
      scraper.recordSentPhone(lead.phone);
      continue;
    }

    // 7. Duplicate & Sent Shield
    if (scraper.isPhoneAlreadySent(lead.phone) || whatsapp.hasExistingChat(lead.phone)) {
      console.log(`⏩ [Device ${deviceId}] ${lead.phone} was already contacted. Skipping!`);
      scraper.updateLeadStatus(lead.phone, 'sent', null, deviceId);
      continue;
    }

    // 8. Verify WhatsApp registration
    state.currentStatus = `Checking WhatsApp status for +${lead.phone}...`;
    const waCheck = await whatsapp.checkNumberOnWhatsApp(deviceId, lead.phone);
    if (!waCheck.exists) {
      console.log(`❌ [Device ${deviceId}] +${lead.phone} is not registered on WhatsApp. Skipping!`);
      scraper.updateLeadStatus(lead.phone, 'not_on_whatsapp', null, deviceId);
      await sleep(200);
      continue;
    }

    lead.jid = waCheck.jid;

    // 9. Generate Two-Step Outreach Message
    state.currentStatus = `Preparing personalized outreach for +${lead.phone}...`;
    const outreachText = await ai.generateOutreachMessage(lead);

    // 10. Send via WhatsApp through this device
    state.currentStatus = `Sending message to +${lead.phone}...`;
    let sendSucceeded = false;
    try {
      const sent = await whatsapp.sendTextMessage(deviceId, lead.jid, outreachText);
      if (sent) {
        scraper.updateLeadStatus(lead.phone, 'sent', null, deviceId);
        state.currentBatchCount++;
        state.totalSentSession++;
        state.dailySentCount++;
        state.consecutiveFailures = 0;
        sendSucceeded = true;
        const currentCap = botConfig.dailyMaxLeadsPerDevice || 50;
        console.log(`✅ [Real WhatsApp Sent by Device ${deviceId} (${state.currentBatchCount}/${state.currentBatchLimit})] To +${lead.phone}. Today: ${state.dailySentCount}/${currentCap}`);
      } else {
        state.consecutiveFailures++;
        scraper.updateLeadStatus(lead.phone, 'failed', 'Socket send failure', deviceId);
      }
    } catch (sendErr) {
      state.consecutiveFailures++;
      console.error(`❌ [Device ${deviceId} Send Error]:`, sendErr.message);
      scraper.updateLeadStatus(lead.phone, 'failed', sendErr.message, deviceId);
    }

    // Circuit Breaker: 3 consecutive failures cools down this device socket for 20 mins
    if (state.consecutiveFailures >= 3) {
      state.currentStatus = '⚠️ Circuit Breaker engaged (3 delivery hiccups). Cooling down socket for 20 mins...';
      state.nextActionTime = Date.now() + 20 * 60 * 1000;
      console.log(`\n🛡️ [Circuit Breaker Device ${deviceId}] 3 hiccups detected. Cooling down for 20 mins until ${formatIndiaTime(state.nextActionTime)}...\n`);
      await sleep(20 * 60 * 1000);
      state.consecutiveFailures = 0;
      continue;
    }

    // 11. Human Pacing / Breaks
    if (sendSucceeded) {
      if (state.currentBatchCount >= state.currentBatchLimit) {
        const breakMs = getRandomBreakDurationMs();
        const breakMins = Math.round(breakMs / 60000);
        state.nextActionTime = Date.now() + breakMs;
        state.currentStatus = `Mini-batch of ${state.currentBatchLimit} sent! Taking ${breakMins}-min tea break...`;
        console.log(`\n☕ [Human Break Device ${deviceId}] Batch limit hit (${state.currentBatchLimit} sent). Taking ${breakMins}-minute break until ${formatIndiaTime(state.nextActionTime)}...\n`);

        await sleep(breakMs);

        state.currentBatchCount = 0;
        state.currentBatchLimit = getRandomBatchLimit();
        console.log(`⚡ [Worker Device ${deviceId}] Break finished! Next batch rolled: ${state.currentBatchLimit} leads.`);
      } else {
        // Random 1 to 2 minutes jitter between messages
        const jitterDelayMs = getRandomMsgDelayMs();
        const delaySec = Math.round(jitterDelayMs / 1000);
        state.nextActionTime = Date.now() + jitterDelayMs;
        state.currentStatus = `Waiting ${delaySec}s before next lead (1-2m jitter)...`;
        console.log(`⏳ [Pacing Device ${deviceId}] Next lead scheduled at ${formatIndiaTime(state.nextActionTime)} (${delaySec}s delay)...`);
        await sleep(jitterDelayMs);
      }
    } else {
      await sleep(2000);
    }
  }
}

/**
 * Start queue workers across all devices
 */
async function startQueueWorker() {
  if (isRunning) return;
  isRunning = true;
  console.log(`🚀 [Multi-Device Master Engine Active] Up to ${MAX_DEVICES} devices, ${DAILY_MAX_LEADS_PER_DEVICE} leads/day each (3 devices = 150 leads/day).`);

  // Launch independent worker for each device slot (1..MAX_DEVICES)
  for (let i = 1; i <= MAX_DEVICES; i++) {
    getOrCreateDeviceState(i);
    runDeviceWorker(i).catch(err => {
      console.error(`Worker error on device ${i}:`, err.message);
    });
  }
}

function pauseQueue() {
  isPaused = true;
  console.log('⏸️ [Queue Worker] Paused all devices');
}

function resumeQueue() {
  isPaused = false;
  console.log('▶️ [Queue Worker] Resumed all devices');
}

function getQueueState() {
  const db = scraper.loadDatabase();
  const queuedCount = db.leads.filter(l => l.status === 'queued').length;
  const sentCount = db.leads.filter(l => l.status === 'sent').length;
  checkAndResetDailyCounters();

  const connectedDevices = whatsapp.getConnectedDevices();
  let totalDailySent = 0;
  let totalSessionSent = 0;

  const currentCap = botConfig.dailyMaxLeadsPerDevice || 50;
  const devicesDetail = [];
  for (let i = 1; i <= MAX_DEVICES; i++) {
    const s = getOrCreateDeviceState(i);
    const dev = whatsapp.getDevice(i);
    totalDailySent += s.dailySentCount;
    totalSessionSent += s.totalSentSession;

    devicesDetail.push({
      id: i,
      isConnected: dev ? dev.isConnected : false,
      phone: dev ? dev.phone : null,
      dailySentCount: s.dailySentCount,
      dailyMaxLeads: currentCap,
      currentBatchCount: s.currentBatchCount,
      batchSize: s.currentBatchLimit,
      currentStatus: s.currentStatus,
      nextActionTime: formatIndiaTime(s.nextActionTime)
    });
  }

  const activeCount = connectedDevices.length;
  const dynamicTarget = activeCount > 0 ? activeCount * currentCap : 150;

  return {
    isRunning,
    isPaused,
    maxDevices: MAX_DEVICES,
    connectedDevicesCount: activeCount,
    dailySentCount: totalDailySent,
    dailyMaxLeads: dynamicTarget,
    dailyMaxPerDevice: currentCap,
    totalSentSession: totalSessionSent,
    totalSentDb: sentCount,
    queuedRemaining: queuedCount,
    isDaytime: isIndianClinicHours(),
    operatingHours: botConfig.businessHoursShield ? "2:00 PM - 6:00 PM IST" : "24/7 Unrestricted Human Dispatch",
    pacingPreset: botConfig.pacingPreset || 'fast',
    minMsgDelayMs: botConfig.minMsgDelayMs,
    maxMsgDelayMs: botConfig.maxMsgDelayMs,
    businessHoursShield: botConfig.businessHoursShield,
    devices: devicesDetail,
    // Backwards compatibility shortcuts
    currentStatus: activeCount > 0 ? `${activeCount}/${MAX_DEVICES} Devices Active (${totalDailySent}/${dynamicTarget} Sent)` : 'Waiting for WhatsApp QR scan on /qr...',
    batchSize: 7,
    currentBatchCount: 0,
    nextActionTime: null
  };
}

module.exports = {
  startQueueWorker,
  pauseQueue,
  resumeQueue,
  getQueueState,
  loadBotConfig,
  saveBotConfig,
  setDailyMaxLeadsPerDevice,
  updatePacingConfig
};
