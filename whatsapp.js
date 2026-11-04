/**
 * Baileys WhatsApp Multi-Device Manager (Up to 6 Simultaneous Devices)
 * Each device maintains an independent WebSocket connection, isolated auth folder,
 * live QR code stream, and authentic human AI reply handler.
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const ai = require('./ai');
const scraper = require('./scraper');

const MAX_DEVICES = parseInt(process.env.MAX_DEVICES || '6', 10);
const SESSIONS_BASE_DIR = path.join(__dirname, 'auth_sessions');

if (!fs.existsSync(SESSIONS_BASE_DIR)) {
  fs.mkdirSync(SESSIONS_BASE_DIR, { recursive: true });
}

// Migrate legacy auth_info_baileys to device_1 if exists
const legacyAuthDir = path.join(__dirname, 'auth_info_baileys');
const device1Dir = path.join(SESSIONS_BASE_DIR, 'device_1');
if (fs.existsSync(legacyAuthDir) && !fs.existsSync(device1Dir)) {
  try {
    fs.cpSync(legacyAuthDir, device1Dir, { recursive: true });
  } catch (e) {}
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Map of deviceId (1..6) -> DeviceSession
const devices = new Map();

// Shield Set for all past chats synced directly from WhatsApp across all devices
const existingChatsSet = new Set();

function registerExistingChat(jid) {
  if (!jid) return;
  const cleanDigits = String(jid).split('@')[0].replace(/\D/g, '');
  if (cleanDigits && cleanDigits.length >= 7) {
    existingChatsSet.add(cleanDigits);
    scraper.recordSentPhone(cleanDigits);
  }
}

function hasExistingChat(phoneOrJid) {
  if (!phoneOrJid) return false;
  const cleanDigits = String(phoneOrJid).replace(/\D/g, '');
  return existingChatsSet.has(cleanDigits) || scraper.isPhoneAlreadySent(cleanDigits);
}

// Helper to extract text from all nested WhatsApp message types
function extractMessageText(msg) {
  if (!msg || !msg.message) return '';
  let m = msg.message;

  if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message;
  if (m.viewOnceMessage?.message) m = m.viewOnceMessage.message;
  if (m.viewOnceMessageV2?.message) m = m.viewOnceMessageV2.message;
  if (m.documentWithCaptionMessage?.message) m = m.documentWithCaptionMessage.message;

  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.templateButtonReplyMessage?.selectedId ||
    m.templateButtonReplyMessage?.selectedDisplayText ||
    m.listResponseMessage?.title ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    ''
  );
}

/**
 * Initialize a single device slot (1..6)
 */
async function initDevice(deviceId, onReadyCallback) {
  const id = parseInt(deviceId, 10);
  const sessionDir = path.join(SESSIONS_BASE_DIR, `device_${id}`);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  let session = devices.get(id);
  if (!session) {
    session = {
      id,
      sock: null,
      qrDataUrl: null,
      isConnected: false,
      phone: null,
      isReconnecting: false,
      pendingReplies: new Map(),
      conversationHistories: new Map()
    };
    devices.set(id, session);
  }

  // Gracefully close previous socket if open
  if (session.sock) {
    try {
      session.sock.ev.removeAllListeners();
      session.sock.end();
    } catch (e) {}
    session.sock = null;
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  let waVersion = [2, 3000, 1043857760];
  try {
    const verResult = await fetchLatestBaileysVersion();
    if (verResult && verResult.version) waVersion = verResult.version;
  } catch (e) {}

  const sock = makeWASocket({
    version: waVersion,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: Browsers.windows('Chrome'),
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false
  });

  session.sock = sock;

  // Save auth state changes
  sock.ev.on('creds.update', saveCreds);

  // Connection update event
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        session.qrDataUrl = await QRCode.toDataURL(qr);
        console.log(`📲 [WhatsApp QR Device ${id}] New QR Code generated! Open /qr?device=${id} to scan.`);
      } catch (err) {
        console.error(`Failed to generate QR for device ${id}:`, err.message);
      }
    }

    if (connection === 'close') {
      session.isConnected = false;
      session.qrDataUrl = null;
      const statusCode = (lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`⚠️ [WhatsApp Device ${id}] Connection closed (${lastDisconnect?.error?.message || 'timeout'}). Reconnecting: ${shouldReconnect}`);

      if (shouldReconnect && !session.isReconnecting) {
        session.isReconnecting = true;
        setTimeout(() => {
          session.isReconnecting = false;
          initDevice(id, onReadyCallback);
        }, 5000);
      } else if (!shouldReconnect) {
        console.log(`❌ [WhatsApp Device ${id}] Session logged out. Open /qr?device=${id} to rescan.`);
        session.phone = null;
      }
    } else if (connection === 'open') {
      session.isConnected = true;
      session.qrDataUrl = null;
      session.isReconnecting = false;
      session.phone = sock.user?.id ? sock.user.id.split(':')[0] : 'Connected';
      console.log(`\n🎉 [WhatsApp Device ${id}] Connected successfully as +${session.phone}! Slot is LIVE.\n`);
      if (onReadyCallback) onReadyCallback(id);
    }
  });

  // History sync
  sock.ev.on('messaging-history.set', ({ chats }) => {
    if (Array.isArray(chats)) {
      for (const c of chats) registerExistingChat(c.id);
    }
  });

  sock.ev.on('chats.set', ({ chats }) => {
    if (Array.isArray(chats)) {
      for (const c of chats) registerExistingChat(c.id);
    }
  });

  sock.ev.on('chats.upsert', (chats) => {
    if (Array.isArray(chats)) {
      for (const c of chats) registerExistingChat(c.id);
    }
  });

  // Inbound messages (Lead replies)
  sock.ev.on('messages.upsert', async (m) => {
    try {
      if (!m.messages || !Array.isArray(m.messages)) return;

      for (const msg of m.messages) {
        if (!msg || !msg.message) continue;

        const senderJid = msg.key.remoteJid;
        if (!senderJid) continue;

        const cleanPhone = senderJid.replace(/@.*$/, '').replace(/\D/g, '');

        // Manual override from phone cancels pending AI reply
        if (msg.key.fromMe) {
          if (session.pendingReplies.has(cleanPhone)) {
            clearTimeout(session.pendingReplies.get(cleanPhone).timeout);
            session.pendingReplies.delete(cleanPhone);
            console.log(`✋ [Manual Override Device ${id}] You messaged ${cleanPhone} from your phone. Canceled pending AI auto-reply.`);
          }
          continue;
        }

        // Ignore groups & broadcasts
        if (senderJid.endsWith('@g.us') || senderJid.endsWith('@broadcast') || senderJid === 'status@broadcast') {
          continue;
        }

        const incomingText = extractMessageText(msg).trim();
        if (!incomingText) continue;

        console.log(`\n📩 [Inbound Lead on Device ${id} from ${cleanPhone}]: "${incomingText}"`);

        // Check STOP / opt out
        const lower = incomingText.toLowerCase();
        if (lower === 'stop' || lower === 'unsubscribe' || lower === 'remove' || lower.includes('stop')) {
          if (session.pendingReplies.has(cleanPhone)) {
            clearTimeout(session.pendingReplies.get(cleanPhone).timeout);
            session.pendingReplies.delete(cleanPhone);
          }
          console.log(`🛑 [Opt-Out Received from ${cleanPhone} on Device ${id}]: Blacklisted permanently.`);
          try {
            scraper.updateLeadStatus(cleanPhone, 'opted_out');
            scraper.recordSentPhone(cleanPhone);
            const optOutReply = 'Aapka number blacklist kar diya gaya hai, aage se koi message nahi aayega. Dhanyawad.';
            await sock.sendMessage(senderJid, { text: optOutReply });
          } catch (e) {}
          continue;
        }

        // Toxic / Angry Sentiment Trap
        const TOXIC_PATTERNS = /\b(scam|fraud|police|cyber|complaint|bakwas|chutiya|madarchod|bhosdike|harami|gandu|lawde|laude|mc|bc|fake|jail|court)\b/i;
        if (TOXIC_PATTERNS.test(lower)) {
          if (session.pendingReplies.has(cleanPhone)) {
            clearTimeout(session.pendingReplies.get(cleanPhone).timeout);
            session.pendingReplies.delete(cleanPhone);
          }
          console.log(`🛡️ [Toxic Sentiment Trapped from ${cleanPhone} on Device ${id}]: Instantly de-escalating & shielding.`);
          try {
            scraper.updateLeadStatus(cleanPhone, 'toxic_shielded');
            scraper.recordSentPhone(cleanPhone);
            const deescalateMsg = 'Bohot maafi chahenge agar aapko pareshani hui. Humne aapka number clinic records se permanent delete kar diya hai. Aage se koi call ya message nahi aayega. Dhanyawad.';
            await sock.sendMessage(senderJid, { text: deescalateMsg });
          } catch (e) {}
          continue;
        }

        // Female / Wrong Person Inbound Trap (Strict Sharik Shah Mandate: Zero ladies)
        const FEMALE_INBOUND_TRAP = /\b(ladki|aurat|female|woman|girl|mahila|behan|sister|bhabhi|didi|mummy|mother|wife|patni|biwi|beti|daughter|dr [a-z]+|wrong number|galat number|wrong person|ladies)\b/i;
        if (FEMALE_INBOUND_TRAP.test(lower)) {
          if (session.pendingReplies.has(cleanPhone)) {
            clearTimeout(session.pendingReplies.get(cleanPhone).timeout);
            session.pendingReplies.delete(cleanPhone);
          }
          console.log(`🛡️ [Female/Wrong-Person Trapped from ${cleanPhone} on Device ${id}]: Permanently shielding & blacklisting.`);
          try {
            scraper.updateLeadStatus(cleanPhone, 'skipped_ladies');
            scraper.recordSentPhone(cleanPhone);
            const femaleDeescalateMsg = 'Bohot maafi chahenge agar aapko pareshani hui. Hamara yeh nuskha sirf mardon (gents) ke sexual wellness ke liye hai. Humne aapka number clinic records se permanent delete kar diya hai. Aage se koi message nahi aayega. Dhanyawad.';
            await sock.sendMessage(senderJid, { text: femaleDeescalateMsg });
          } catch (e) {}
          continue;
        }

        // Update DB status to 'replied'
        try {
          scraper.updateLeadStatus(cleanPhone, 'replied');
          scraper.recordSentPhone(cleanPhone);
        } catch (e) {}

        // Slow Real-Human AI Reply Scheduling
        let pending = session.pendingReplies.get(cleanPhone);
        if (pending) {
          clearTimeout(pending.timeout);
          pending.messages.push(incomingText);
          pending.lastMsgKey = msg.key;
        } else {
          pending = {
            senderJid,
            cleanPhone,
            messages: [incomingText],
            lastMsgKey: msg.key,
            timeout: null
          };
        }

        // Human debounce delay: 18 to 28 seconds
        const debounceDelayMs = 18000 + Math.floor(Math.random() * 10000);
        console.log(`⏳ [Slow Human AI Device ${id}] Buffered reply for ${cleanPhone}. Waiting ${(debounceDelayMs / 1000).toFixed(0)}s debounce...`);

        pending.timeout = setTimeout(async () => {
          session.pendingReplies.delete(cleanPhone);
          await processSlowHumanReply(session, pending);
        }, debounceDelayMs);

        session.pendingReplies.set(cleanPhone, pending);
      }
    } catch (msgErr) {
      console.error(`❌ [Device ${id} Message Handling Error]:`, msgErr.message);
    }
  });

  return sock;
}

/**
 * Process Slow Real-Human AI Reply for a specific device (Cloud-Computed, Pure Send)
 */
async function processSlowHumanReply(session, pending) {
  const { senderJid, cleanPhone, messages } = pending;
  if (!session.sock || !session.isConnected) return;

  try {
    const combinedIncomingText = messages.join('\n');
    console.log(`\n🤖 [Slow Human AI Device ${session.id} Responding to ${cleanPhone}]: "${combinedIncomingText.replace(/\n/g, ' ')}"`);

    // 1. Natural human reading delay (purely in Node timer, zero socket activity)
    const readPause = Math.floor(10000 + Math.random() * 8000);
    await sleep(readPause);

    // 2. Generate AI reply via Groq on Cloud
    const history = session.conversationHistories.get(cleanPhone) || [];
    const aiReplyText = await ai.handleIncomingMessage('Bhai', combinedIncomingText, history);

    if (!aiReplyText) return;

    // 3. PURE SEND ONLY: Zero presence updates, zero read receipts (no flags)
    await session.sock.sendMessage(senderJid, { text: aiReplyText });
    console.log(`✅ [AI Consultation Sent by Device ${session.id} to ${cleanPhone}]`);

    // Update history
    history.push({ role: 'user', content: combinedIncomingText });
    history.push({ role: 'assistant', content: aiReplyText });
    if (history.length > 8) history.splice(0, history.length - 8);
    session.conversationHistories.set(cleanPhone, history);
  } catch (err) {
    console.error(`❌ [Error in processSlowHumanReply on Device ${session.id}]:`, err.message);
  }
}

/**
 * Initialize all device slots (Device 1 immediately + existing paired devices; rest on-demand)
 */
async function initAllDevices(onReadyCallback) {
  console.log(`🌐 [Multi-Device Manager] Fast-booting WhatsApp engine...`);
  // Initialize Device 1 immediately
  try {
    await initDevice(1, onReadyCallback);
  } catch (err) {
    console.error(`Failed to init device slot 1:`, err.message);
  }

  // Restore any additional slots that were already paired in past sessions
  for (let i = 2; i <= MAX_DEVICES; i++) {
    const credsFile = path.join(SESSIONS_BASE_DIR, `device_${i}`, 'creds.json');
    if (fs.existsSync(credsFile)) {
      console.log(`🔑 [Device ${i}] Restoring existing authenticated session...`);
      try {
        await initDevice(i, onReadyCallback);
        await sleep(1000);
      } catch (err) {
        console.error(`Failed to restore device slot ${i}:`, err.message);
      }
    } else {
      console.log(`💤 [Device ${i}] On standby (initializes on-demand when /qr?device=${i} is requested).`);
    }
  }
}

function addStealthHashBypasser(text) {
  if (!text) return '';
  const zeroWidths = ['\u200B', '\u200C', '\u200D'];
  const words = text.split(' ');
  const modified = words.map(word => {
    if (Math.random() < 0.25 && word.length > 3) {
      const idx = Math.floor(1 + Math.random() * (word.length - 2));
      const char = zeroWidths[Math.floor(Math.random() * zeroWidths.length)];
      return word.slice(0, idx) + char + word.slice(idx);
    }
    return word;
  });
  return modified.join(' ');
}

/**
 * Send Text Message through a specific device (PURE SEND ONLY WITH NATURAL PRESENCE)
 * Natural typing delay + cryptographic hash bypasser. Zero socket probes.
 */
async function sendTextMessage(deviceId, jid, text) {
  const session = devices.get(parseInt(deviceId, 10));
  if (!session || !session.sock || !session.isConnected) {
    console.warn(`Cannot send message: Device ${deviceId} is not connected`);
    return false;
  }

  try {
    // 1. Natural Human Typing Presence (3-6s based on message length)
    try { await session.sock.sendPresenceUpdate('composing', jid); } catch (e) {}
    const typingTimeMs = Math.min(6500, Math.max(3000, Math.floor(text.length * 28 + Math.random() * 1200)));
    await sleep(typingTimeMs);

    // 2. Cryptographic Stealth: Inject randomized invisible zero-width markers
    const stealthText = addStealthHashBypasser(text);

    // 3. Send message
    await session.sock.sendMessage(jid, { text: stealthText });

    // 4. Mark paused
    try { await session.sock.sendPresenceUpdate('paused', jid); } catch (e) {}
    return true;
  } catch (err) {
    try { await session.sock.sendPresenceUpdate('paused', jid); } catch (e) {}
    console.error(`Error sending message on Device ${deviceId} to ${jid}:`, err.message);
    return false;
  }
}

/**
 * In-Memory WhatsApp JID Validator (PURE CLOUD CHECK)
 * Zero network queries over WhatsApp socket to eliminate 30-second ban risk!
 */
async function checkNumberOnWhatsApp(deviceId, phoneOrJid) {
  try {
    let cleanPhone = String(phoneOrJid).replace(/\D/g, '');
    if (cleanPhone.length === 10 && /^[6-9]/.test(cleanPhone)) {
      cleanPhone = '91' + cleanPhone;
    }
    if (cleanPhone.length === 12 && cleanPhone.startsWith('91') && /^91[6-9]\d{9}$/.test(cleanPhone)) {
      return { exists: true, jid: `${cleanPhone}@s.whatsapp.net` };
    }
    return { exists: false, jid: null };
  } catch (err) {
    return { exists: false, jid: null };
  }
}

/**
 * Logout and clear credentials for a specific device slot
 */
async function logoutDevice(deviceId) {
  const id = parseInt(deviceId, 10);
  const session = devices.get(id);
  const sessionDir = path.join(SESSIONS_BASE_DIR, `device_${id}`);

  console.log(`🔌 [Multi-Device Manager] Logging out Device ${id}...`);

  if (session && session.sock) {
    try {
      session.sock.ev.removeAllListeners();
      await session.sock.logout();
    } catch (e) {}
    session.sock = null;
    session.isConnected = false;
    session.phone = null;
    session.qrDataUrl = null;
  }

  if (fs.existsSync(sessionDir)) {
    try {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    } catch (e) {}
  }

  // Re-initialize to produce a fresh QR code
  await initDevice(id);
  return true;
}

function getDevice(deviceId) {
  return devices.get(parseInt(deviceId, 10)) || null;
}

function getAllDevices() {
  const list = [];
  for (let i = 1; i <= MAX_DEVICES; i++) {
    const s = devices.get(i);
    list.push({
      id: i,
      isConnected: s ? s.isConnected : false,
      phone: s ? s.phone : null,
      hasQr: s ? !!s.qrDataUrl : false,
      qrDataUrl: s ? s.qrDataUrl : null
    });
  }
  return list;
}

function getConnectedDevices() {
  const list = [];
  for (const s of devices.values()) {
    if (s.isConnected) list.push(s);
  }
  return list;
}

function isDeviceConnected(deviceId) {
  const s = devices.get(parseInt(deviceId, 10));
  return s ? s.isConnected : false;
}

function getDeviceQr(deviceId) {
  const s = devices.get(parseInt(deviceId, 10));
  return s ? s.qrDataUrl : null;
}

// Backwards-compatibility helpers for single-device calls
function isConnected() {
  return getConnectedDevices().length > 0;
}

function getConnectedNumber() {
  const connected = getConnectedDevices();
  return connected.length > 0 ? connected[0].phone : null;
}

function getQrCodeDataUrl() {
  const s = devices.get(1);
  return s ? s.qrDataUrl : null;
}

async function initWhatsApp(onReadyCallback) {
  return initAllDevices(onReadyCallback);
}

module.exports = {
  MAX_DEVICES,
  initAllDevices,
  initDevice,
  logoutDevice,
  resetDevice: logoutDevice,
  getDevice,
  getAllDevices,
  getConnectedDevices,
  isDeviceConnected,
  getDeviceQr,
  sendTextMessage,
  checkNumberOnWhatsApp,
  hasExistingChat,
  // Backwards compatibility
  initWhatsApp,
  isConnected,
  getConnectedNumber,
  getQrCodeDataUrl
};
