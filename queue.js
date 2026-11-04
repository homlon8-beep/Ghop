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
    dailyMaxLeadsPerDevice: 50,
    afternoonTarget: 30, // 2:00 PM - 6:00 PM IST (30 msgs)
    nightTarget: 20,     // 8:30 PM - 11:30 PM IST (20 msgs)
    minMsgDelayMs: 45000,
    maxMsgDelayMs: 90000,
    minBreakMins: 14,
    maxBreakMins: 26,
    minClusterSize: 1,
    maxClusterSize: 3,
    businessHoursShield: true, // Strict 2-6 PM (30) & 8:30-11:30 PM (20) IST
    pacingPreset: 'extreme_human'
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
    console.log(`⚙️ [Config Saved] Limit: ${botConfig.dailyMaxLeadsPerDevice} msgs/device (Preset: ${botConfig.pacingPreset}, Afternoon: ${botConfig.afternoonTarget || 30}, Night: ${botConfig.nightTarget || 20}, Break: ${botConfig.minBreakMins}-${botConfig.maxBreakMins}m, Hours-Shield: ${botConfig.businessHoursShield}).`);
  } catch (err) {
    console.error('Failed to save bot_config.json:', err.message);
  }
  return botConfig;
}

function setDailyMaxLeadsPerDevice(count, preset = 'custom') {
  const num = parseInt(count, 10);
  if (isNaN(num) || num < 1) return botConfig;

  const updates = { dailyMaxLeadsPerDevice: num, pacingPreset: preset };

  if (preset === 'extreme_human') {
    updates.minMsgDelayMs = 45000;
    updates.maxMsgDelayMs = 90000;
    updates.minBreakMins = 14;
    updates.maxBreakMins = 26;
    updates.afternoonTarget = 30;
    updates.nightTarget = 20;
    updates.businessHoursShield = true;
  } else if (preset === 'turbo') {
    updates.minMsgDelayMs = 20000;
    updates.maxMsgDelayMs = 35000;
    updates.minBreakMins = 1;
    updates.maxBreakMins = 2;
    updates.businessHoursShield = false;
  } else if (preset === 'fast' || preset === 'fast_human') {
    updates.minMsgDelayMs = 30000;
    updates.maxMsgDelayMs = 45000;
    updates.minBreakMins = 1.5;
    updates.maxBreakMins = 3;
    updates.businessHoursShield = false;
  } else if (preset === 'balanced') {
    updates.minMsgDelayMs = 50000;
    updates.maxMsgDelayMs = 90000;
    updates.minBreakMins = 8;
    updates.maxBreakMins = 15;
    updates.businessHoursShield = false;
  } else if (preset === 'ultra_safe') {
    updates.minMsgDelayMs = 120000;
    updates.maxMsgDelayMs = 240000;
    updates.minBreakMins = 20;
    updates.maxBreakMins = 35;
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
    'afternoonTarget',
    'nightTarget',
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

function getRandomClusterLimit() {
  // Real human behavior: mostly 2 messages, occasionally 1 or 3
  const roll = Math.random();
  if (roll < 0.25) return 1;
  if (roll < 0.85) return 2;
  return 3;
}

function getRandomInClusterDelayMs() {
  // Realistic typing + reading pause inside a cluster: 45s to 90s
  const min = botConfig.minMsgDelayMs || 45000;
  const max = botConfig.maxMsgDelayMs || 90000;
  return Math.floor(min + Math.random() * (max - min + 1));
}

function getRandomClusterBreakMs() {
  // Deep random human break: 14 to 26 minutes (averages ~20 mins, exactly as LO requested)
  const minMins = botConfig.minBreakMins || 14;
  const maxMins = botConfig.maxBreakMins || 26;
  const mins = minMins + Math.random() * (maxMins - minMins);
  const jitterSecs = Math.floor(Math.random() * 60);
  return Math.floor(mins * 60 * 1000 + jitterSecs * 1000);
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

function getCurrentShiftInfo() {
  if (botConfig.businessHoursShield === false) {
    return {
      isActiveShift: true,
      currentShift: 'unrestricted',
      shiftName: 'Unrestricted 24/7',
      shiftMax: botConfig.dailyMaxLeadsPerDevice || 50
    };
  }

  const { hour, minute, dateStr } = getIndianTimeParts();
  const timeInMinutes = hour * 60 + minute;

  // Afternoon Shift: 2:00 PM (14:00) to 6:00 PM (18:00) -> 840 to 1080 mins
  const isAfternoon = (timeInMinutes >= 840 && timeInMinutes < 1080);

  // Night Shift: 8:30 PM (20:30) to 11:30 PM (23:30) -> 1230 to 1410 mins
  const isNight = (timeInMinutes >= 1230 && timeInMinutes < 1410);

  let currentShift = null;
  let shiftName = 'Off-Shift Rest';
  let shiftMax = 50;

  if (isAfternoon) {
    currentShift = 'afternoon';
    shiftName = 'Afternoon Clinic (2 PM - 6 PM IST)';
    shiftMax = botConfig.afternoonTarget || 30;
  } else if (isNight) {
    currentShift = 'night';
    shiftName = 'Night Shift (8:30 PM - 11:30 PM IST)';
    shiftMax = botConfig.nightTarget || 20;
  }

  return {
    isAfternoon,
    isNight,
    isActiveShift: (isAfternoon || isNight),
    currentShift,
    shiftName,
    shiftMax,
    hour,
    minute,
    timeInMinutes,
    dateStr
  };
}

function getNextShiftTimestamp() {
  const { hour, minute } = getIndianTimeParts();
  const timeInMinutes = hour * 60 + minute;
  const now = new Date();
  const istStr = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const istDate = new Date(istStr);
  const target = new Date(istDate);

  if (timeInMinutes < 840) {
    // Before 2:00 PM -> Next is 2:00 PM today
    target.setHours(14, 0, 0, 0);
  } else if (timeInMinutes >= 840 && timeInMinutes < 1230) {
    // Between 6:00 PM and 8:30 PM -> Next is 8:30 PM tonight
    target.setHours(20, 30, 0, 0);
  } else {
    // After 11:30 PM -> Next is 2:00 PM tomorrow
    target.setDate(target.getDate() + 1);
    target.setHours(14, 0, 0, 0);
  }

  const diffMs = target.getTime() - istDate.getTime();
  return Date.now() + Math.max(diffMs, 60000);
}

function isIndianClinicHours() {
  return getCurrentShiftInfo().isActiveShift;
}

function getNext2PmIstTimestamp() {
  return getNextShiftTimestamp();
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
      state.afternoonSentCount = 0;
      state.nightSentCount = 0;
      state.currentClusterCount = 0;
      state.currentClusterLimit = getRandomClusterLimit();
    }
    console.log(`🌅 [Extreme Human Engine] New calendar day. Reset daily outreach counters: 0/30 (Afternoon) + 0/20 (Night) = 0/${maxLimit} total per device.`);
  }
}

function getOrCreateDeviceState(deviceId) {
  let state = deviceStates.get(deviceId);
  if (!state) {
    state = {
      id: deviceId,
      currentClusterCount: 0,
      currentClusterLimit: getRandomClusterLimit(),
      dailySentCount: 0,
      afternoonSentCount: 0,
      nightSentCount: 0,
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
  console.log(`⚡ [Worker Device ${deviceId}] Started Extreme Human Dispatcher (30 afternoon 2-6 PM + 20 night 8:30-11:30 PM = ${maxDaily} total).`);

  // Stagger startup so all devices don't fire at the exact same second
  await sleep((deviceId - 1) * 15000);

  while (isRunning) {
    if (isPaused) {
      state.currentStatus = 'Paused by User';
      await sleep(5000);
      continue;
    }

    checkAndResetDailyCounters();

    const shift = getCurrentShiftInfo();
    const currentCap = botConfig.dailyMaxLeadsPerDevice || 50;

    // 1. Device Daily Cap Check (50 leads/day total)
    if (state.dailySentCount >= currentCap) {
      state.currentStatus = `Daily Cap Reached (${state.dailySentCount}/${currentCap}: 30 afternoon + 20 night). Resting safely until 2:00 PM IST tomorrow...`;
      state.nextActionTime = getNextShiftTimestamp();
      await sleep(60000);
      continue;
    }

    // 2. Strict Shift Enforcement (2:00 PM - 6:00 PM [30] & 8:30 PM - 11:30 PM [20] IST)
    if (botConfig.businessHoursShield !== false) {
      if (!shift.isActiveShift) {
        const nextTimeStr = formatIndiaTime(getNextShiftTimestamp());
        state.currentStatus = `🌙 Rest Mode (Active 2-6 PM [30 msgs] & 8:30-11:30 PM [20 msgs] IST). Next shift at ${nextTimeStr}...`;
        state.nextActionTime = getNextShiftTimestamp();
        await sleep(60000);
        continue;
      }

      // Check shift sub-allocations
      if (shift.isAfternoon && (state.afternoonSentCount || 0) >= (botConfig.afternoonTarget || 30)) {
        const nextTimeStr = formatIndiaTime(getNextShiftTimestamp());
        state.currentStatus = `Afternoon Shift Complete (${state.afternoonSentCount}/30 sent). Evening rest until 8:30 PM IST night shift (${nextTimeStr})...`;
        state.nextActionTime = getNextShiftTimestamp();
        await sleep(60000);
        continue;
      }

      if (shift.isNight && (state.nightSentCount || 0) >= (botConfig.nightTarget || 20)) {
        const nextTimeStr = formatIndiaTime(getNextShiftTimestamp());
        state.currentStatus = `Night Shift Complete (${state.nightSentCount}/20 sent). Full day quota reached. Sleeping until 2:00 PM IST tomorrow (${nextTimeStr})...`;
        state.nextActionTime = getNextShiftTimestamp();
        await sleep(60000);
        continue;
      }
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
        state.currentClusterCount = (state.currentClusterCount || 0) + 1;
        state.totalSentSession++;
        state.dailySentCount++;
        if (shift.isAfternoon) state.afternoonSentCount = (state.afternoonSentCount || 0) + 1;
        if (shift.isNight) state.nightSentCount = (state.nightSentCount || 0) + 1;
        state.consecutiveFailures = 0;
        sendSucceeded = true;
        const currentCap = botConfig.dailyMaxLeadsPerDevice || 50;
        const shiftInfoStr = shift.isAfternoon 
          ? `Afternoon: ${state.afternoonSentCount}/30` 
          : (shift.isNight ? `Night: ${state.nightSentCount}/20` : `Unrestricted: ${state.dailySentCount}/${currentCap}`);
        console.log(`✅ [Real WhatsApp Sent by Device ${deviceId} (${state.currentClusterCount}/${state.currentClusterLimit} in cluster)] To +${lead.phone}. Shift: ${shiftInfoStr}. Today: ${state.dailySentCount}/${currentCap}`);
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

    // 11. Extreme Human Pacing / Deep Random Pauses (like 2 now, 2 after 20 mins)
    if (sendSucceeded) {
      if (state.currentClusterCount >= state.currentClusterLimit) {
        const breakMs = getRandomClusterBreakMs();
        const breakMins = (breakMs / 60000).toFixed(1);
        state.nextActionTime = Date.now() + breakMs;
        state.currentStatus = `Cluster of ${state.currentClusterLimit} sent! Natural break (~${Math.round(breakMins)}m until ${formatIndiaTime(state.nextActionTime)})...`;
        console.log(`\n☕ [Extreme Human Break Device ${deviceId}] Sent cluster of ${state.currentClusterLimit}. Taking ${breakMins}-minute break until ${formatIndiaTime(state.nextActionTime)}...\n`);

        await sleep(breakMs);

        state.currentClusterCount = 0;
        state.currentClusterLimit = getRandomClusterLimit();
        console.log(`⚡ [Worker Device ${deviceId}] Break finished! Next cluster rolled: ${state.currentClusterLimit} leads.`);
      } else {
        // Natural human typing/reading hesitation inside the cluster (45s to 90s)
        const inClusterDelayMs = getRandomInClusterDelayMs();
        const delaySec = Math.round(inClusterDelayMs / 1000);
        state.nextActionTime = Date.now() + inClusterDelayMs;
        state.currentStatus = `Pacing inside cluster (${state.currentClusterCount}/${state.currentClusterLimit}). Next in ${delaySec}s...`;
        console.log(`⏳ [In-Cluster Delay Device ${deviceId}] Message ${state.currentClusterCount}/${state.currentClusterLimit}. Pausing ${delaySec}s before next...`);
        await sleep(inClusterDelayMs);
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
  const maxPerDev = botConfig.dailyMaxLeadsPerDevice || 50;
  console.log(`🚀 [Multi-Device Master Engine Active] Up to ${MAX_DEVICES} devices, ${maxPerDev} leads/day each (3 devices = ${maxPerDev * 3} leads/day).`);

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
      afternoonSentCount: s.afternoonSentCount || 0,
      afternoonTarget: botConfig.afternoonTarget || 30,
      nightSentCount: s.nightSentCount || 0,
      nightTarget: botConfig.nightTarget || 20,
      dailyMaxLeads: currentCap,
      currentClusterCount: s.currentClusterCount || 0,
      clusterSize: s.currentClusterLimit || 2,
      currentStatus: s.currentStatus,
      nextActionTime: formatIndiaTime(s.nextActionTime)
    });
  }

  const activeCount = connectedDevices.length;
  const dynamicTarget = activeCount > 0 ? activeCount * currentCap : 150;
  const shift = getCurrentShiftInfo();

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
    isDaytime: shift.isActiveShift,
    currentShift: shift.currentShift,
    shiftName: shift.shiftName,
    operatingHours: botConfig.businessHoursShield ? "2:00 PM - 6:00 PM (30) & 8:30 PM - 11:30 PM (20) IST" : "24/7 Human Dispatch",
    pacingPreset: botConfig.pacingPreset || 'extreme_human',
    minMsgDelayMs: botConfig.minMsgDelayMs,
    maxMsgDelayMs: botConfig.maxMsgDelayMs,
    businessHoursShield: botConfig.businessHoursShield,
    devices: devicesDetail,
    // Backwards compatibility shortcuts
    currentStatus: activeCount > 0 ? `${activeCount}/${MAX_DEVICES} Devices Active (${totalDailySent}/${dynamicTarget} Sent)` : 'Waiting for WhatsApp QR scan on /qr...',
    batchSize: 2,
    currentBatchCount: 0,
    nextActionTime: null
  };
}

function getBotConfig() {
  return botConfig;
}

module.exports = {
  startQueueWorker,
  pauseQueue,
  resumeQueue,
  getQueueState,
  loadBotConfig,
  saveBotConfig,
  getBotConfig,
  setDailyMaxLeadsPerDevice,
  updatePacingConfig
};
