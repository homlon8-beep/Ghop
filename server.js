/**
 * Web Dashboard & Control Server for Render.com (Multi-Device Edition)
 * Supports up to 6 simultaneous WhatsApp accounts (3 devices = 150 leads/24h)
 * Provides /qr multi-device switching, live lead queue controls, and CSV export
 */

require('dotenv').config();

// Global Process Crash Shield
process.on('uncaughtException', (err) => {
  console.error('🛡️ [Crash Shield - Uncaught Exception]:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('🛡️ [Crash Shield - Unhandled Rejection]:', reason);
});

const express = require('express');
const path = require('path');
const XLSX = require('xlsx');
const whatsapp = require('./whatsapp');
const scraper = require('./scraper');
const queue = require('./queue');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Anti-Sleep Keep-Alive State & Auto-Host Detection
let detectedBaseUrl = (process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || '').replace(/\/$/, '');
let keepAliveTimer = null;
let lastPingStatus = 'Pending first ping';
let lastPingTime = 'Never';

function startKeepAliveEngine(targetUrl) {
  if (!targetUrl || keepAliveTimer) return;
  detectedBaseUrl = targetUrl.replace(/\/$/, '');
  console.log(`📡 [Anti-Sleep Keep-Alive] Engaged for: ${detectedBaseUrl}`);
  console.log(`⏱️ [Anti-Sleep Keep-Alive] Pinging ${detectedBaseUrl}/ping every 3 minutes to stop Render Free sleep.`);

  const runPing = async () => {
    try {
      const res = await fetch(`${detectedBaseUrl}/ping`, {
        headers: { 'User-Agent': 'Render-AntiSleep-Heartbeat/3.0' },
        signal: AbortSignal.timeout(10000)
      });
      lastPingStatus = `HTTP ${res.status} OK`;
      lastPingTime = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' IST';
      console.log(`💓 [Anti-Sleep Heartbeat] Pinged ${detectedBaseUrl}/ping -> ${lastPingStatus} at ${lastPingTime}`);
    } catch (err) {
      lastPingStatus = `Warn: ${err.message}`;
      console.warn('⚠️ [Heartbeat Notice]:', err.message);
    }
  };

  setTimeout(runPing, 5000);
  keepAliveTimer = setInterval(runPing, 3 * 60 * 1000);
}

app.use((req, res, next) => {
  if (!detectedBaseUrl) {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers['host'] || req.get('host');
    if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
      const resolved = `${proto}://${host}`;
      console.log(`🌐 [Host Auto-Detected] Inbound host captured: ${resolved}`);
      startKeepAliveEngine(resolved);
    }
  }
  next();
});

app.get('/healthz', (req, res) => res.status(200).send('OK'));
app.get('/ping', (req, res) => res.status(200).send('pong'));

/**
 * Multi-Device QR Linking Page (/qr?device=X)
 */
app.get('/qr', (req, res) => {
  const selectedId = parseInt(req.query.device || '1', 10);
  const clampedId = Math.max(1, Math.min(whatsapp.MAX_DEVICES, selectedId));
  const device = whatsapp.getDevice(clampedId);
  const allDevices = whatsapp.getAllDevices();

  const isConnected = device ? device.isConnected : false;
  const phone = device ? device.phone : null;
  const qrDataUrl = device ? device.qrDataUrl : null;

  let bodyContent = '';

  if (isConnected) {
    bodyContent = `
      <div class="card connected">
        <div class="icon">✅</div>
        <h2>Device ${clampedId} Connected!</h2>
        <p class="phone">+${phone}</p>
        <p class="desc">This WhatsApp device is active and sending outreach (50 leads/day limit).</p>
        <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
          <a href="/" class="btn btn-green">Go to Dashboard</a>
          <form method="POST" action="/api/devices/${clampedId}/logout" style="margin: 0;">
            <button type="submit" class="btn btn-red" onclick="return confirm('Disconnect Device ${clampedId}?');">🔌 Disconnect / Relink</button>
          </form>
        </div>
      </div>
    `;
  } else if (qrDataUrl) {
    bodyContent = `
      <div class="card">
        <h2>Link Device ${clampedId}</h2>
        <p class="subtitle">Open WhatsApp on Phone ${clampedId} > Linked Devices > Link a Device</p>
        <div class="qr-box">
          <img src="${qrDataUrl}" alt="WhatsApp QR Code for Device ${clampedId}" class="qr-img" />
        </div>
        <p class="refresh-hint">QR automatically refreshes every 5 seconds.</p>
      </div>
      <script>
        setTimeout(() => { window.location.reload(); }, 5000);
      </script>
    `;
  } else {
    bodyContent = `
      <div class="card">
        <div class="spinner"></div>
        <h2>Initializing Device ${clampedId} Socket...</h2>
        <p class="desc">Generating a fresh QR code, please wait a moment...</p>
      </div>
      <script>
        setTimeout(() => { window.location.reload(); }, 4000);
      </script>
    `;
  }

  // Device Tabs Bar
  const tabsHtml = allDevices.map(d => {
    const isCurrent = d.id === clampedId;
    const label = d.isConnected ? `Device ${d.id} (● +${d.phone ? d.phone.slice(-4) : 'OK'})` : `Device ${d.id} (📱 Link)`;
    const bgClass = d.isConnected ? 'tab-online' : 'tab-offline';
    const activeClass = isCurrent ? 'tab-active' : '';
    return `<a href="/qr?device=${d.id}" class="tab-btn ${bgClass} ${activeClass}">${label}</a>`;
  }).join('');

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Link WhatsApp Devices - Bemisaal Wellness</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        body { background: #090d16; color: #fff; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1.5rem; }
        .wrapper { max-width: 540px; width: 100%; text-align: center; }
        .header-nav { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
        .back-link { color: #38bdf8; text-decoration: none; font-size: 0.9rem; font-weight: 600; }
        .tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin-bottom: 1.5rem; }
        .tab-btn { padding: 0.65rem 0.5rem; border-radius: 10px; text-decoration: none; font-size: 0.8rem; font-weight: 700; border: 1px solid #1e293b; background: #131c2e; color: #94a3b8; transition: all 0.2s; }
        .tab-btn.tab-online { border-color: #059669; color: #6ee7b7; background: #064e3b25; }
        .tab-btn.tab-active { border-color: #38bdf8; background: #0284c725; color: #fff; }
        .card { background: #131c2e; border: 1px solid #1e293b; border-radius: 20px; padding: 2.25rem 1.75rem; width: 100%; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
        .card.connected { border-color: #059669; }
        h2 { font-size: 1.4rem; margin-bottom: 0.4rem; color: #f8fafc; }
        .subtitle { color: #94a3b8; font-size: 0.85rem; margin-bottom: 1.25rem; }
        .qr-box { background: #fff; padding: 1rem; border-radius: 16px; display: inline-block; margin-bottom: 1.25rem; }
        .qr-img { width: 240px; height: 240px; display: block; }
        .phone { font-size: 1.25rem; font-weight: 700; color: #34d399; margin: 0.5rem 0 1rem; }
        .desc { color: #94a3b8; font-size: 0.9rem; line-height: 1.5; margin-bottom: 1.5rem; }
        .btn { display: inline-block; padding: 0.65rem 1.25rem; border-radius: 8px; font-weight: 600; text-decoration: none; border: none; cursor: pointer; font-size: 0.9rem; }
        .btn-green { background: #059669; color: #fff; }
        .btn-red { background: #dc2626; color: #fff; }
        .refresh-hint { font-size: 0.8rem; color: #64748b; }
        .spinner { width: 40px; height: 40px; border: 4px solid #1e293b; border-top-color: #38bdf8; border-radius: 50%; animation: spin 1s infinite linear; margin: 0 auto 1.25rem; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="header-nav">
          <a href="/" class="back-link">← Back to Dashboard</a>
          <span style="color: #64748b; font-size: 0.85rem;">Slot <strong>${clampedId}</strong> of ${whatsapp.MAX_DEVICES}</span>
        </div>
        <div class="tabs">
          ${tabsHtml}
        </div>
        ${bodyContent}
      </div>
    </body>
    </html>
  `);
});

/**
 * Main Web Dashboard (/)
 */
app.get('/', (req, res) => {
  const state = queue.getQueueState();
  const scraperStats = scraper.getScraperStats();
  const totalShielded = scraper.getTotalShieldedCount ? scraper.getTotalShieldedCount() : 0;
  const hotLeads = scraper.getHotRepliedLeads ? scraper.getHotRepliedLeads() : [];
  const allLeads = scraper.getAllDiscoveredLeads ? scraper.getAllDiscoveredLeads('all') : [];

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="refresh" content="8">
      <title>Bemisaal Wellness — Multi-Device Lead Engine</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        body { background: #090d16; color: #f1f5f9; padding: 1.5rem; }
        .container { max-width: 860px; margin: 0 auto; }
        header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #1e293b; padding-bottom: 1.25rem; margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem; }
        h1 { font-size: 1.45rem; color: #38bdf8; }
        .status-badge { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.9rem; border-radius: 9999px; font-size: 0.85rem; font-weight: 700; text-decoration: none; }
        .status-badge.online { background: #064e3b; color: #6ee7b7; border: 1px solid #059669; }
        .status-badge.offline { background: #7f1d1d; color: #fca5a5; border: 1px solid #dc2626; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
        .stat-card { background: #131c2e; border: 1px solid #1e293b; border-radius: 14px; padding: 1.25rem; text-align: center; }
        .stat-val { font-size: 1.7rem; font-weight: 800; color: #38bdf8; margin-top: 0.35rem; }
        .stat-label { font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
        .section-box { background: #131c2e; border: 1px solid #1e293b; border-radius: 14px; padding: 1.5rem; margin-bottom: 1.5rem; }
        h3 { font-size: 1.1rem; margin-bottom: 1rem; color: #f8fafc; }
        .btn-group { display: flex; gap: 0.75rem; flex-wrap: wrap; }
        .btn { padding: 0.65rem 1.25rem; border-radius: 8px; font-weight: 600; text-decoration: none; border: none; cursor: pointer; font-size: 0.9rem; }
        .btn-green { background: #0284c7; color: #fff; }
        .btn-blue { background: #2563eb; color: #fff; }
        .btn-outline { background: transparent; border: 1px solid #334155; color: #cbd5e1; }
        textarea { width: 100%; height: 90px; background: #090d16; border: 1px solid #334155; border-radius: 8px; color: #fff; padding: 0.75rem; font-size: 0.9rem; margin-bottom: 0.75rem; resize: vertical; }
        .log-box { background: #090d16; padding: 1rem; border-radius: 8px; font-family: monospace; font-size: 0.85rem; color: #94a3b8; line-height: 1.5; }
        .device-row { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: #090d16; border-radius: 8px; margin-bottom: 0.5rem; border: 1px solid #1e293b; flex-wrap: wrap; gap: 0.5rem; }
        .device-title { font-weight: 700; color: #f8fafc; font-size: 0.9rem; display: flex; align-items: center; gap: 0.5rem; }
        .device-meta { font-size: 0.8rem; color: #94a3b8; }
        .badge-pill { padding: 0.2rem 0.6rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; }
        .badge-online { background: #064e3b; color: #6ee7b7; border: 1px solid #059669; }
        .badge-offline { background: #334155; color: #94a3b8; }
      </style>
    </head>
    <body>
      <div class="container">
        <header>
          <div>
            <h1>Bemisaal Dawakhana — Multi-Device Lead Engine</h1>
            <p style="color: #64748b; font-size: 0.85rem; margin-top: 0.2rem;">⏰ Active 3:00 PM – 9:00 PM IST • Gents Sexual Wellness (2 Majoon + 30 Tablets + 1 Special Oil) • Zero Delhi • 100% Real Human Anti-Ban</p>
          </div>
          <div>
            ${state.connectedDevicesCount > 0 ?
              `<a href="/qr" class="status-badge online">● ${state.connectedDevicesCount} / ${state.maxDevices} Devices Active</a>` :
              `<a href="/qr" class="status-badge offline">⚠️ Scan Devices QR</a>`
            }
          </div>
        </header>

        <div class="grid">
          <div class="stat-card">
            <div class="stat-label">Active Devices</div>
            <div class="stat-val" style="color: #38bdf8;">${state.connectedDevicesCount} / ${state.maxDevices}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Today's Total Outreach</div>
            <div class="stat-val" style="color: #34d399;">${state.dailySentCount} / ${state.dailyMaxLeads}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Total Sent (All Time)</div>
            <div class="stat-val">${state.totalSentDb}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Leads In Queue</div>
            <div class="stat-val" style="color: #fbbf24;">${state.queuedRemaining}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Shielded Past Leads</div>
            <div class="stat-val" style="color: #a855f7;">${totalShielded}</div>
          </div>
          <div class="stat-card" style="border-color: #f43f5e33;">
            <div class="stat-label" style="color: #fda4af;">Hot Leads (Replied)</div>
            <div class="stat-val" style="color: #f43f5e;">${hotLeads.length}</div>
          </div>
        </div>

        ${req.query.test_flight === 'success' ? `
          <div style="background: #022c22; border: 1px solid #10b981; border-radius: 12px; padding: 1.1rem; margin-bottom: 1.5rem; color: #a7f3d0;">
            🚀 <strong>Live Test Flight Succeeded!</strong> Dispatched to <strong>+${req.query.phone}</strong>. Typing Presence: <strong>${req.query.typingMs}ms</strong> | Zero-Width Polymorphic Markers Injected: <strong>${req.query.injected}</strong>. Check your WhatsApp now!
          </div>
        ` : ''}
        ${req.query.test_flight === 'error' ? `
          <div style="background: #450a0a; border: 1px solid #ef4444; border-radius: 12px; padding: 1.1rem; margin-bottom: 1.5rem; color: #fca5a5;">
            ⚠️ <strong>Test Flight Failed:</strong> ${req.query.error}
          </div>
        ` : ''}

        <!-- Ghost Protocol Stealth Telemetry Matrix -->
        <div class="section-box" style="border: 1px solid #10b98144; background: linear-gradient(135deg, #022c2215, #090d16); margin-bottom: 1.5rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
            <div style="display: flex; align-items: center; gap: 0.6rem;">
              <span style="background: #059669; color: #fff; font-size: 0.75rem; padding: 0.25rem 0.6rem; border-radius: 6px; font-weight: 800; letter-spacing: 0.05em;">GHOST PROTOCOL OP</span>
              <h3 style="margin: 0; color: #34d399; font-size: 1.05rem;">Bemisaal Anti-Ban Telemetry (3 PM – 9 PM IST)</h3>
            </div>
            <span style="background: #065f46; color: #a7f3d0; font-size: 0.78rem; padding: 0.25rem 0.65rem; border-radius: 9999px; font-weight: 700;">ACTIVE SHIELD</span>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; font-size: 0.82rem; color: #cbd5e1;">
            <div style="background: #090d16; padding: 0.65rem 0.85rem; border-radius: 8px; border: 1px solid #1e293b;">
              <span style="color: #64748b; font-size: 0.72rem; display: block; text-transform: uppercase;">Socket Probe (USync)</span>
              <strong style="color: #34d399;">DISABLED (100% Silent)</strong>
            </div>
            <div style="background: #090d16; padding: 0.65rem 0.85rem; border-radius: 8px; border: 1px solid #1e293b;">
              <span style="color: #64748b; font-size: 0.72rem; display: block; text-transform: uppercase;">Cryptographic Polymorphism</span>
              <strong style="color: #38bdf8;">Zero-Width Hash Bypass</strong>
            </div>
            <div style="background: #090d16; padding: 0.65rem 0.85rem; border-radius: 8px; border: 1px solid #1e293b;">
              <span style="color: #64748b; font-size: 0.72rem; display: block; text-transform: uppercase;">Keystroke Simulation</span>
              <strong style="color: #a78bfa;">Gaussian Markov 45-55 WPM</strong>
            </div>
            <div style="background: #090d16; padding: 0.65rem 0.85rem; border-radius: 8px; border: 1px solid #1e293b;">
              <span style="color: #64748b; font-size: 0.72rem; display: block; text-transform: uppercase;">Shift Lock</span>
              <strong style="color: #fbbf24;">3:00 PM – 9:00 PM IST Capped</strong>
            </div>
          </div>
        </div>

        <!-- Live Test-Flight Verification Tool -->
        <div class="section-box" style="border-left: 4px solid #38bdf8; background: #0c4a6e12; margin-bottom: 1.5rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.5rem;">
            <div>
              <h3 style="margin: 0; color: #38bdf8;">🚀 Live Test-Flight (Instant Phone Verification)</h3>
              <p style="color: #94a3b8; font-size: 0.85rem; margin-top: 0.2rem;">
                Enter your 10-digit mobile number to fire an instant test message. Check typing presence and formatting on your WhatsApp.
              </p>
            </div>
            <span style="background: #075985; color: #bae6fd; font-size: 0.75rem; padding: 0.2rem 0.6rem; border-radius: 9999px; font-weight: 700;">DEV VERIFIED</span>
          </div>
          <form method="POST" action="/api/test-flight" style="margin-top: 0.75rem;">
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
              <input type="text" name="phone" placeholder="Enter 10-digit mobile number (e.g. 9876543210)" style="flex: 2; min-width: 220px; background: #090d16; border: 1px solid #334155; border-radius: 8px; color: #fff; padding: 0.65rem 0.85rem; font-size: 0.9rem;" required />
              <select name="deviceId" style="flex: 1; min-width: 130px; background: #090d16; border: 1px solid #334155; border-radius: 8px; color: #fff; padding: 0.65rem 0.85rem; font-size: 0.9rem;">
                ${state.devices.map(d => `<option value="${d.id}" ${d.isConnected ? '' : 'disabled'}>Device ${d.id} ${d.isConnected ? `(Online: +${d.phone})` : '(Offline)'}</option>`).join('')}
              </select>
              <button type="submit" class="btn btn-green" style="padding: 0.65rem 1.25rem;">🚀 Send Test Flight</button>
            </div>
          </form>
        </div>

        ${req.query.shielded ? `
          <div style="background: #1e1b4b; border: 1px solid #8b5cf6; border-radius: 12px; padding: 1.1rem; margin-bottom: 1.5rem; color: #e9d5ff;">
            🛡️ <strong>Older Bot Shield Updated!</strong> Permanently shielded <strong>${req.query.count || 0}</strong> numbers from ever receiving outreach again.
          </div>
        ` : ''}

        <!-- Multi-Device Control Center (6 Slots) -->
        <div class="section-box" style="border-left: 4px solid #38bdf8;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
            <div>
              <h3 style="margin: 0; color: #38bdf8;">📱 Multi-Device Control Center (${state.connectedDevicesCount} of ${state.maxDevices} Linked)</h3>
              <p style="color: #94a3b8; font-size: 0.85rem; margin-top: 0.2rem;">Each phone runs independently: 50 leads/day, 1–2m jitter, 50–80m breaks. Atomic claiming stops duplicate leads.</p>
            </div>
            <a href="/qr" class="btn btn-green" style="font-size: 0.85rem;">+ Link / Manage Devices</a>
          </div>

          <div>
            ${state.devices.map(d => `
              <div class="device-row">
                <div>
                  <div class="device-title">
                    <span>Device ${d.id}</span>
                    <span class="badge-pill ${d.isConnected ? 'badge-online' : 'badge-offline'}">
                      ${d.isConnected ? `● +${d.phone}` : 'Not Linked'}
                    </span>
                  </div>
                  <div class="device-meta" style="margin-top: 0.25rem;">
                    Status: <span style="color: #e2e8f0;">${d.currentStatus}</span>
                    ${d.nextActionTime ? ` • Next: <span style="color: #38bdf8;">${d.nextActionTime}</span>` : ''}
                    <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.2rem;">
                      ⏰ Shift (3:00 PM - 9:00 PM IST): <strong style="color: #34d399;">${d.dailySentCount || 0}/${d.dailyMaxLeads || 50}</strong>
                      &nbsp;|&nbsp; Cluster: <strong>${d.currentClusterCount || 0}/${d.clusterSize || 2}</strong>
                    </div>
                  </div>
                </div>
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                  <span style="font-weight: 700; color: ${d.dailySentCount >= d.dailyMaxLeads ? '#34d399' : '#38bdf8'}; font-size: 0.9rem;">
                    ${d.dailySentCount} / ${d.dailyMaxLeads} today
                  </span>
                  <a href="/qr?device=${d.id}" class="btn btn-outline" style="padding: 0.35rem 0.75rem; font-size: 0.8rem;">
                    ${d.isConnected ? 'Manage' : '📱 Scan QR'}
                  </a>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Speed & Pacing Mode Selector -->
        <div class="section-box" style="border-left: 4px solid #6366f1; background: #312e8115; margin-bottom: 1.5rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
            <div>
              <h3 style="margin: 0; color: #a5b4fc;">⚡ Extreme Human Pacing &amp; Shifts</h3>
              <p style="color: #94a3b8; font-size: 0.85rem; margin-top: 0.2rem;">
                Mode: <strong style="color: #38bdf8; text-transform: uppercase;">${state.pacingPreset || 'extreme_human'}</strong> 
                • Shift: <strong style="color: #34d399;">${state.shiftName || state.operatingHours}</strong>
                • Pacing: <strong>1-3 msgs cluster, random 15-25m breaks</strong>
              </p>
            </div>
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
              <form method="POST" action="/api/settings/mode-form" style="margin: 0;">
                <input type="hidden" name="preset" value="ultra_fast">
                <button type="submit" class="btn" style="background: ${state.pacingPreset === 'ultra_fast' ? '#ef4444' : '#1e293b'}; color: #fff; padding: 0.45rem 0.9rem; font-size: 0.85rem; font-weight: 800; border: 1px solid #ef4444;">🚀 Ultra-Fast (6-12s • No Breaks • 24/7)</button>
              </form>
              <form method="POST" action="/api/settings/mode-form" style="margin: 0;">
                <input type="hidden" name="preset" value="casual_fast">
                <button type="submit" class="btn" style="background: ${state.pacingPreset === 'casual_fast' ? '#0ea5e9' : '#1e293b'}; color: #fff; padding: 0.45rem 0.9rem; font-size: 0.85rem; font-weight: 700; border: 1px solid #0ea5e9;">⚡ Casual Fast (14-24s • 24/7)</button>
              </form>
              <form method="POST" action="/api/settings/mode-form" style="margin: 0;">
                <input type="hidden" name="preset" value="extreme_human">
                <button type="submit" class="btn" style="background: ${state.pacingPreset === 'extreme_human' ? '#4f46e5' : '#1e293b'}; color: #fff; padding: 0.45rem 0.9rem; font-size: 0.85rem; font-weight: 700;">👤 Extreme Human (3:00 PM - 9:00 PM IST)</button>
              </form>
              <form method="POST" action="/api/settings/mode-form" style="margin: 0;">
                <input type="hidden" name="preset" value="fast">
                <button type="submit" class="btn" style="background: ${state.pacingPreset === 'fast' ? '#059669' : '#1e293b'}; color: #fff; padding: 0.45rem 0.9rem; font-size: 0.85rem; font-weight: 700;">⚡ Fast Human (30-45s)</button>
              </form>
              <form method="POST" action="/api/settings/mode-form" style="margin: 0;">
                <input type="hidden" name="preset" value="turbo">
                <button type="submit" class="btn" style="background: ${state.pacingPreset === 'turbo' ? '#d97706' : '#1e293b'}; color: #fff; padding: 0.45rem 0.9rem; font-size: 0.85rem; font-weight: 700;">🚀 Turbo (20-35s)</button>
              </form>
              <form method="POST" action="/api/settings/toggle-shift-shield" style="margin: 0;">
                <button type="submit" class="btn" style="background: ${state.businessHoursShield ? '#047857' : '#d97706'}; color: #fff; padding: 0.45rem 0.9rem; font-size: 0.85rem; font-weight: 700;">
                  ${state.businessHoursShield ? '🛡️ Shift Active (3:00 PM - 9:00 PM IST)' : '⚡ 24/7 Dispatch (Sending Now)'}
                </button>
              </form>
            </div>
          </div>
        </div>

        <!-- Master Pause / Stop Bot Controls -->
        ${state.isPaused ? `
          <div style="background: #450a0a; border: 1px solid #b91c1c; border-radius: 12px; padding: 1.25rem; margin-bottom: 1.5rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
            <div>
              <h3 style="color: #f87171; margin-bottom: 0.25rem;">🛑 Bot is STOPPED / PAUSED</h3>
              <p style="color: #fca5a5; font-size: 0.85rem; margin: 0;">Outreach is paused on all devices. All leads and queue positions are completely safe.</p>
            </div>
            <form method="POST" action="/api/queue/resume" style="margin: 0;">
              <button type="submit" class="btn" style="background: #16a34a; color: #fff; padding: 0.75rem 1.5rem; font-size: 0.95rem; font-weight: 700; cursor: pointer;">▶️ Resume All Devices</button>
            </form>
          </div>
        ` : `
          <div style="background: #022c22; border: 1px solid #059669; border-radius: 12px; padding: 1.25rem; margin-bottom: 1.5rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
            <div>
              <h3 style="color: #34d399; margin-bottom: 0.25rem;">⚡ Multi-Device Engine ACTIVE (Gents Only • Pure Sending)</h3>
              <p style="color: #6ee7b7; font-size: 0.85rem; margin: 0;">Cloud-computed • Pure Baileys sendMessage only (zero socket queries) • Zero ladies (100% Gents Sexual Wellness) • Zero Delhi targets.</p>
            </div>
            <form method="POST" action="/api/queue/pause" style="margin: 0;">
              <button type="submit" class="btn" style="background: #dc2626; color: #fff; padding: 0.75rem 1.5rem; font-size: 0.95rem; font-weight: 700; cursor: pointer;">🛑 Pause All Devices</button>
            </form>
          </div>
        `}

        <!-- Hot Leads Section with 1-Click CSV Export -->
        <div class="section-box" style="border-left: 4px solid #f43f5e; background: #88133712;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
            <div>
              <h3 style="margin: 0; color: #fb7185;">🔥 Hot Replied Leads (${hotLeads.length})</h3>
              <p style="color: #94a3b8; font-size: 0.85rem; margin-top: 0.2rem;">Patients who engaged with consultation outreach. Ready to close via WhatsApp.</p>
            </div>
            <div class="btn-group">
              <a href="/api/leads/export-excel?filter=hot" class="btn" style="background: #10b981; color: #fff; font-weight: 700; text-decoration: none;">📗 Export Excel (.XLSX)</a>
              <a href="/api/leads/export-csv" class="btn" style="background: #e11d48; color: #fff; font-weight: 700; text-decoration: none;">📥 Download Leads (.CSV)</a>
            </div>
          </div>
          ${hotLeads.length === 0 ? '<p style="color: #64748b; font-size: 0.85rem;">No replies yet today. As soon as leads respond, they appear here instantly.</p>' : `
            <div style="max-height: 220px; overflow-y: auto; background: #090d16; border-radius: 8px; padding: 0.5rem;">
              ${hotLeads.slice(-10).reverse().map(l => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; border-bottom: 1px solid #1e293b;">
                  <div>
                    <strong style="color: #f1f5f9;">+${l.phone}</strong>
                    <span style="color: #64748b; font-size: 0.8rem; margin-left: 0.5rem;">${l.name || 'Valued Patient'}</span>
                  </div>
                  <a href="https://wa.me/${l.phone}" target="_blank" class="btn btn-green" style="padding: 0.35rem 0.75rem; font-size: 0.8rem; text-decoration: none;">💬 Open Chat</a>
                </div>
              `).join('')}
            </div>
          `}
        </div>

        <!-- Discovered Leads List & Manager (Turns all leads into a list) -->
        <div class="section-box" style="border-left: 4px solid #38bdf8; background: #0c4a6e12;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
            <div>
              <h3 style="margin: 0; color: #38bdf8;">📋 All Discovered Leads List (${allLeads.length} Total in DB)</h3>
              <p style="color: #94a3b8; font-size: 0.85rem; margin-top: 0.2rem;">All Indian patient numbers found by the scraper (excluding Delhi). Export directly to Excel or Google Sheets below.</p>
            </div>
            <div class="btn-group">
              <a href="/api/leads/export-excel" class="btn" style="background: #10b981; color: #fff; font-weight: 700; text-decoration: none;">📗 Export Excel (.XLSX)</a>
              <a href="/api/leads/export-google-sheets" class="btn" style="background: #0ea5e9; color: #fff; font-weight: 700; text-decoration: none;">📊 Google Sheets (.CSV)</a>
              <a href="/api/leads/export-all-csv" class="btn" style="background: #0284c7; color: #fff; font-weight: 700; text-decoration: none;">📥 Standard (.CSV)</a>
              <a href="/api/leads/export-list-txt" class="btn" style="background: #0369a1; color: #fff; font-weight: 700; text-decoration: none;">📋 Numbers (.TXT)</a>
            </div>
          </div>

          <!-- Google Sheets Live Sync Helper -->
          <details style="margin-bottom: 1rem; background: #064e3b15; padding: 0.75rem; border-radius: 8px; border: 1px solid #059669;">
            <summary style="cursor: pointer; color: #34d399; font-weight: 700; font-size: 0.85rem;">📊 Google Sheets Live Auto-Sync Formula (=IMPORTDATA)</summary>
            <div style="margin-top: 0.5rem; font-size: 0.82rem; color: #cbd5e1; line-height: 1.5;">
              <p style="margin-bottom: 0.35rem;">Copy and paste this formula into cell <strong>A1</strong> of any Google Sheet to automatically stream all leads live:</p>
              <input type="text" readonly style="width: 100%; background: #090d16; border: 1px solid #334155; color: #38bdf8; padding: 0.5rem; border-radius: 6px; font-family: monospace; font-size: 0.8rem;" value='=IMPORTDATA("${detectedBaseUrl || 'http://' + (req.headers.host || 'localhost:3001')}/api/leads/google-sheets-csv")' onclick="this.select()">
            </div>
          </details>

          <details style="margin-bottom: 1rem; background: #090d16; padding: 0.75rem; border-radius: 8px; border: 1px solid #1e293b;">
            <summary style="cursor: pointer; color: #38bdf8; font-weight: 600; font-size: 0.85rem;">📄 Click to view copyable raw numbers list (${allLeads.length} numbers)</summary>
            <textarea readonly style="margin-top: 0.5rem; width: 100%; height: 120px; font-family: monospace; font-size: 0.8rem;" onclick="this.select()">${allLeads.map(l => '+' + l.phone).join('\n')}</textarea>
          </details>

          ${allLeads.length === 0 ? '<p style="color: #64748b; font-size: 0.85rem;">No leads in database yet. Trigger the scraper below to harvest fresh numbers.</p>' : `
            <div style="max-height: 280px; overflow-y: auto; background: #090d16; border-radius: 8px; padding: 0.5rem;">
              ${allLeads.slice(0, 50).map(l => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; border-bottom: 1px solid #1e293b;">
                  <div>
                    <strong style="color: #f1f5f9;">+${l.phone}</strong>
                    <span style="color: #94a3b8; font-size: 0.8rem; margin-left: 0.5rem;">${l.name || 'Patient'} • ${(l.city || 'India').toUpperCase()}</span>
                    <span class="badge-pill ${l.status === 'replied' ? 'badge-online' : (l.status === 'sent' ? 'badge-online' : 'badge-offline')}" style="margin-left: 0.5rem; font-size: 0.7rem;">
                      ${l.status}
                    </span>
                  </div>
                  <a href="https://wa.me/${l.phone}" target="_blank" class="btn btn-green" style="padding: 0.3rem 0.65rem; font-size: 0.75rem; text-decoration: none;">💬 WhatsApp</a>
                </div>
              `).join('')}
            </div>
          `}
        </div>

        <div class="section-box">
          <h3>📥 Add Indian Mobile Numbers to Queue</h3>
          <form method="POST" action="/api/leads/add-form">
            <textarea name="numbers" placeholder="Paste Indian 10-digit mobile numbers or with 91 (e.g. 9876543210, 09876543210, +91 9876543210)..."></textarea>
            <div class="btn-group">
              <button type="submit" class="btn btn-green">+ Add to Health Lead Queue</button>
              <a href="/qr" class="btn btn-outline">📱 Scan / Manage Devices</a>
            </div>
          </form>
        </div>

        <div class="section-box" style="border-left: 4px solid #a855f7;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <h3 style="margin: 0; color: #c084fc;">🛡️ Shield Past Numbers (Older Bot Contacts / Blacklist)</h3>
            <span style="background: #581c87; color: #e9d5ff; font-size: 0.75rem; padding: 0.2rem 0.6rem; border-radius: 9999px; font-weight: 700;">DUPLICATE SHIELD</span>
          </div>
          <p style="color: #94a3b8; font-size: 0.85rem; margin-bottom: 0.75rem;">
            Paste numbers from your older bots, past campaigns, or spreadsheets below (one per line). They will be added to the permanent shield ledger so no device ever messages them again!
          </p>
          <form method="POST" action="/api/leads/shield-past">
            <textarea name="pastNumbers" placeholder="Paste older bot numbers here (one per line, e.g. 9876543210 or 919876543210)..."></textarea>
            <button type="submit" class="btn" style="background: #7c3aed; color: #fff; font-weight: 700; cursor: pointer;">🛡️ Permanently Shield These Numbers</button>
          </form>
        </div>

        <div class="section-box" style="border-color: #059669; background: #064e3b15;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <h3 style="margin: 0; color: #34d399;">🌐 Yandex Indian Health Scraper (100% Free &amp; CAPTCHA-Proof)</h3>
            <span style="background: ${scraperStats.isPaused ? '#7f1d1d' : '#065f46'}; color: ${scraperStats.isPaused ? '#fca5a5' : '#a7f3d0'}; font-size: 0.75rem; padding: 0.2rem 0.6rem; border-radius: 9999px; font-weight: 700;">${scraperStats.isPaused ? 'PAUSED' : 'ACTIVE 24/7'}</span>
          </div>
          <p class="log-box" style="margin-bottom: 0.75rem;">
            Status: <strong>${scraperStats.status}</strong><br>
            Sweeps Completed: <strong>${scraperStats.cyclesCompleted}</strong> | Session Harvested: <strong>${scraperStats.leadsHarvestedSession}</strong> | Total in DB: <strong>${scraperStats.totalInDb}</strong><br>
            Active Target: <strong>${(scraperStats.lastScrapedCity || 'Kanpur').toUpperCase()}</strong> (${scraperStats.lastScrapedNiche || 'Ayurvedic Treatment'})
          </p>
          <div class="btn-group">
            <form method="POST" action="/api/scraper/trigger-ultra-fast-form" style="margin: 0;">
              <button type="submit" class="btn" style="background: #f59e0b; color: #000; font-weight: 800; border: none; cursor: pointer;">🚀 Ultra-Fast Scrape (50+ Leads Parallel)</button>
            </form>
            <form method="POST" action="/api/scraper/trigger-free-form" style="margin: 0;">
              <button type="submit" class="btn btn-green">⚡ Yandex Fast Sweep (25+ Leads)</button>
            </form>
            <form method="POST" action="/api/scraper/trigger-casual-form" style="margin: 0;">
              <button type="submit" class="btn btn-outline">🌱 Casual Scrape (20 Leads)</button>
            </form>
            <form method="POST" action="${scraperStats.isPaused ? '/api/scraper/resume' : '/api/scraper/pause'}" style="margin: 0;">
              <button type="submit" class="btn btn-outline">${scraperStats.isPaused ? '▶️ Resume Auto-Scraper' : '⏸️ Pause Auto-Scraper'}</button>
            </form>
          </div>
        </div>
      </div>
    </body>
    </html>
  `);
});

/**
 * API Endpoints
 */
app.get('/api/status', (req, res) => {
  res.json({
    devices: whatsapp.getAllDevices(),
    queue: queue.getQueueState()
  });
});

app.get('/api/leads/export-csv', (req, res) => {
  const hotLeads = scraper.getHotRepliedLeads ? scraper.getHotRepliedLeads() : [];
  let csv = 'Phone,Name,Status,Updated_At,Direct_WhatsApp_Link\r\n';
  for (const l of hotLeads) {
    const phone = l.phone || '';
    const name = (l.name || 'Valued Patient').replace(/"/g, '""');
    const status = l.status || 'replied';
    const updated = l.updated_at ? new Date(l.updated_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Recent';
    const waLink = `https://wa.me/${phone}`;
    csv += `+${phone},"${name}",${status},"${updated}","${waLink}"\r\n`;
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="bemisaal_hot_leads.csv"');
  res.send(csv);
});

app.get('/api/leads/export-all-csv', (req, res) => {
  const allLeads = scraper.getAllDiscoveredLeads ? scraper.getAllDiscoveredLeads('all') : [];
  let csv = 'Phone,Name,City,Status,Discovered_At,Last_Sent_At,Direct_WhatsApp_Link\r\n';
  for (const l of allLeads) {
    const phone = l.phone || '';
    const name = (l.name || 'Valued Patient').replace(/"/g, '""');
    const city = (l.city || 'India').replace(/"/g, '""');
    const status = l.status || 'queued';
    const discovered = l.discoveredAt ? new Date(l.discoveredAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '';
    const lastSent = l.lastSentAt ? new Date(l.lastSentAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '';
    const waLink = `https://wa.me/${phone}`;
    csv += `+${phone},"${name}","${city}",${status},"${discovered}","${lastSent}","${waLink}"\r\n`;
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="bemisaal_all_discovered_leads.csv"');
  res.send(csv);
});

app.get('/api/leads/export-list-txt', (req, res) => {
  const allLeads = scraper.getAllDiscoveredLeads ? scraper.getAllDiscoveredLeads('all') : [];
  const lines = allLeads.map(l => `+${l.phone}`).join('\r\n');
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', 'attachment; filename="bemisaal_phone_numbers.txt"');
  res.send(lines);
});

/**
 * 1. Export Real Microsoft Excel (.xlsx) Sheet
 * Generates an authentic binary XLSX workbook with auto-styled columns and tabs
 */
app.get('/api/leads/export-excel', (req, res) => {
  const filter = req.query.filter || 'all';
  const hotLeads = scraper.getHotRepliedLeads ? scraper.getHotRepliedLeads() : [];
  const allLeads = scraper.getAllDiscoveredLeads ? scraper.getAllDiscoveredLeads('all') : [];

  const wb = XLSX.utils.book_new();

  // Tab 1: Hot Replied Leads
  const hotRows = hotLeads.map(l => ({
    'Mobile Number': String(l.phone || ''),
    'Patient Name': l.name || 'Valued Patient',
    'City': (l.city || 'India').toUpperCase(),
    'Status': 'HOT REPLIED (Needs Consultation)',
    'Last Replied / Updated': l.updated_at ? new Date(l.updated_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Today',
    'Direct WhatsApp Chat': `https://wa.me/${l.phone}`
  }));
  const wsHot = XLSX.utils.json_to_sheet(hotRows.length ? hotRows : [{ 'Mobile Number': 'No replies yet today', 'Status': 'Waiting for incoming replies' }]);
  wsHot['!cols'] = [{ wch: 18 }, { wch: 22 }, { wch: 16 }, { wch: 32 }, { wch: 24 }, { wch: 35 }];
  XLSX.utils.book_append_sheet(wb, wsHot, 'Hot Replied Patients');

  if (filter !== 'hot') {
    // Tab 2: All Discovered Indian Health Leads
    const allRows = allLeads.map(l => ({
      'Mobile Number': String(l.phone || ''),
      'Patient Name': l.name || 'Patient',
      'City': (l.city || 'India').toUpperCase(),
      'Target Query': l.query || 'Ayurvedic Wellness',
      'Current Status': String(l.status || 'queued').toUpperCase(),
      'Discovered Date': l.discoveredAt || '',
      'Last Outreach Sent': l.lastSentAt || 'Not sent yet',
      'Direct WhatsApp Chat': `https://wa.me/${l.phone}`
    }));
    const wsAll = XLSX.utils.json_to_sheet(allRows.length ? allRows : [{ 'Mobile Number': 'No leads in DB', 'Status': 'Run scraper' }]);
    wsAll['!cols'] = [{ wch: 18 }, { wch: 20 }, { wch: 16 }, { wch: 30 }, { wch: 18 }, { wch: 24 }, { wch: 24 }, { wch: 35 }];
    XLSX.utils.book_append_sheet(wb, wsAll, 'All Discovered Leads');
  }

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const filename = `bemisaal_leads_${new Date().toISOString().slice(0, 10)}.xlsx`;

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

/**
 * 2. Google Sheets Live Stream CSV Feed (=IMPORTDATA)
 * Phone numbers are formatted with an apostrophe prefix so Google Sheets NEVER strips digits or corrupts them to scientific notation.
 */
app.get('/api/leads/google-sheets-csv', (req, res) => {
  const allLeads = scraper.getAllDiscoveredLeads ? scraper.getAllDiscoveredLeads('all') : [];
  let csv = 'Phone,Name,City,Query,Status,Direct_WhatsApp_Link\r\n';
  for (const l of allLeads) {
    const phone = `'${l.phone || ''}`;
    const name = `"${(l.name || 'Patient').replace(/"/g, '""')}"`;
    const city = `"${(l.city || 'India').replace(/"/g, '""')}"`;
    const query = `"${(l.query || 'Ayurvedic Wellness').replace(/"/g, '""')}"`;
    const status = (l.status || 'queued').toUpperCase();
    const link = `https://wa.me/${l.phone}`;
    csv += `${phone},${name},${city},${query},${status},${link}\r\n`;
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="bemisaal_google_sheets_feed.csv"');
  res.send(csv);
});

/**
 * 3. Export Specifically Formatted for Google Sheets Upload / Drag-and-Drop
 */
app.get('/api/leads/export-google-sheets', (req, res) => {
  const allLeads = scraper.getAllDiscoveredLeads ? scraper.getAllDiscoveredLeads('all') : [];
  let csv = 'Phone,Name,City,Status,Direct_WhatsApp_Link\r\n';
  for (const l of allLeads) {
    const phone = `'+${l.phone || ''}`;
    const name = `"${(l.name || 'Valued Patient').replace(/"/g, '""')}"`;
    const city = `"${(l.city || 'India').replace(/"/g, '""')}"`;
    const status = (l.status || 'queued').toUpperCase();
    const link = `https://wa.me/${l.phone}`;
    csv += `${phone},${name},${city},${status},${link}\r\n`;
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="bemisaal_for_google_sheets.csv"');
  res.send(csv);
});

/**
 * 4. Google Sheets Direct Webhook Sync (Push All Leads to Google Sheet Apps Script)
 */
app.post('/api/leads/sync-google-sheets', async (req, res) => {
  const webhookUrl = (req.body.webhookUrl || '').trim();
  if (!webhookUrl || !webhookUrl.startsWith('http')) {
    return res.status(400).json({ error: 'Valid Google Apps Script Webhook URL is required' });
  }

  const allLeads = scraper.getAllDiscoveredLeads ? scraper.getAllDiscoveredLeads('all') : [];
  try {
    const payload = allLeads.map(l => ({
      phone: String(l.phone || ''),
      name: l.name || 'Patient',
      city: l.city || 'India',
      status: l.status || 'queued',
      link: `https://wa.me/${l.phone}`
    }));

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leads: payload, source: 'Bemisaal Bot', syncedAt: new Date().toISOString() }),
      signal: AbortSignal.timeout(15000)
    });

    res.json({ success: true, count: payload.length, status: response.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/devices/:id/logout', async (req, res) => {
  const deviceId = parseInt(req.params.id, 10);
  try {
    await whatsapp.logoutDevice(deviceId);
  } catch (err) {
    console.error(`Logout error for device ${deviceId}:`, err.message);
  }
  res.redirect(`/qr?device=${deviceId}&logged_out=true`);
});

app.post('/api/leads/add-form', (req, res) => {
  const numbersText = req.body.numbers || '';
  const lines = numbersText.split('\n');
  const leads = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Strict Gents-Only Filter (Reject female names/queries added manually)
    if (scraper.isFemaleContext(trimmed)) {
      console.log(`❌ [Add-Form Guard] Rejected female contact: "${trimmed}"`);
      continue;
    }

    // Try extracting name and phone (e.g. "Rahul 9876543210" or "9876543210 - Rahul")
    const phoneMatch = trimmed.match(/[6-9]\d{9}/);
    if (phoneMatch) {
      const phone = phoneMatch[0];
      const namePart = trimmed.replace(phone, '').replace(/[^\w\s]/g, '').trim();
      leads.push({
        phone: phone,
        name: namePart,
        source: 'manual_dashboard'
      });
    } else {
      leads.push({ phone: trimmed, source: 'manual_dashboard' });
    }
  }

  const result = scraper.addLeadsToQueue(leads);
  res.redirect(`/?added=${result.added}`);
});

app.post('/api/settings/mode-form', (req, res) => {
  const preset = req.body.preset || 'fast';
  queue.setDailyMaxLeadsPerDevice(50, preset);
  res.redirect(`/?mode=${preset}`);
});

app.post('/api/settings/mode', (req, res) => {
  const preset = req.body.preset || 'fast';
  const dailyMax = parseInt(req.body.dailyMax || '50', 10);
  const config = queue.setDailyMaxLeadsPerDevice(dailyMax, preset);
  res.json({ success: true, config });
});

app.post('/api/settings/pacing', (req, res) => {
  const config = queue.updatePacingConfig(req.body);
  res.json({ success: true, config });
});

app.post('/api/settings/toggle-shift-shield', (req, res) => {
  const cfg = queue.getBotConfig ? queue.getBotConfig() : queue.loadBotConfig();
  const current = cfg.businessHoursShield !== false;
  queue.updatePacingConfig({ businessHoursShield: !current });
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    return res.json({ success: true, businessHoursShield: !current });
  }
  res.redirect(`/?shift_shield=${!current}`);
});

app.post('/api/test-flight', async (req, res) => {
  const deviceId = parseInt(req.body.deviceId || '1', 10);
  const targetPhone = req.body.phone || '';
  const customText = req.body.text || null;

  try {
    const result = await whatsapp.sendTestFlightMessage(deviceId, targetPhone, customText);
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({ success: true, result });
    }
    res.redirect(`/?test_flight=success&phone=${encodeURIComponent(targetPhone)}&typingMs=${result.typingDurationMs}&injected=${result.zeroWidthInjected}`);
  } catch (err) {
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(400).json({ success: false, error: err.message });
    }
    res.redirect(`/?test_flight=error&error=${encodeURIComponent(err.message)}`);
  }
});

app.get('/api/config', (req, res) => {
  res.json(queue.loadBotConfig());
});

app.post('/api/leads/shield-past', (req, res) => {
  const numbersText = req.body.pastNumbers || '';
  const lines = numbersText.split('\n');
  const numbersToShield = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      numbersToShield.push(trimmed);
    }
  }

  const result = scraper.recordBulkSentPhones(numbersToShield);
  res.redirect(`/?shielded=true&count=${result.added}`);
});

app.post('/api/queue/pause', (req, res) => {
  queue.pauseQueue();
  res.redirect('/?paused=true');
});

app.post('/api/queue/resume', (req, res) => {
  queue.resumeQueue();
  res.redirect('/?resumed=true');
});

app.post('/api/scraper/pause', (req, res) => {
  scraper.pauseScraper();
  res.redirect('/?scraper_paused=true');
});

app.post('/api/scraper/resume', (req, res) => {
  scraper.resumeScraper();
  res.redirect('/?scraper_resumed=true');
});

app.post('/api/scraper/trigger-ultra-fast-form', async (req, res) => {
  try {
    await scraper.triggerUltraFastScraper({ targetCount: 50 });
  } catch (err) {
    console.error('Ultra-Fast Scraper Error:', err);
  }
  res.redirect('/?scraper=ultra_fast_triggered');
});

app.post('/api/scraper/trigger-casual-form', async (req, res) => {
  try {
    await scraper.triggerCasualScraper({ targetCount: 20 });
  } catch (err) {
    console.error('Casual Scraper Error:', err);
  }
  res.redirect('/?scraper=casual_triggered');
});

app.post('/api/scraper/trigger-free-form', async (req, res) => {
  try {
    await scraper.triggerFreeWebScraper({ targetCount: 25 });
  } catch (err) {
    console.error('Free Scraper Error:', err);
  }
  res.redirect('/?scraper=free_triggered');
});

app.post('/api/scraper/trigger-form', async (req, res) => {
  try {
    await scraper.triggerApifyLeadDiscovery();
  } catch (err) {
    console.error('Apify Scraper Error:', err);
  }
  res.redirect('/?scraper=apify_triggered');
});

function initKeepAlive() {
  if (detectedBaseUrl) {
    startKeepAliveEngine(detectedBaseUrl);
  } else {
    console.log('💡 [Keep-Alive] Waiting for first inbound request or RENDER_EXTERNAL_URL to lock target URL...');
  }
}

/**
 * Start Server, Scraper, WhatsApp Multi-Devices & Queue Workers
 */
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n=========================================================`);
  console.log(`🚀 Bemisaal Wellness Multi-Device AI Bot running on Port ${PORT}`);
  console.log(`📲 Open http://localhost:${PORT}/qr to link WhatsApp devices (Up to ${whatsapp.MAX_DEVICES})`);
  console.log(`=========================================================\n`);

  // 0. Gents-Only Database Sanitation: Purge any female leads from queue
  try {
    scraper.purgeFemaleLeads();
  } catch (e) {
    console.error('Female purge notice:', e.message);
  }

  // 1. Start autonomous 24/7 Yandex scraper
  scraper.start247ContinuousScraper().catch(e => console.error("24/7 Scraper Boot Error:", e.message));

  // 2. Start Anti-Sleep Keep-Alive Heartbeat
  initKeepAlive();

  // 3. Initialize all 6 device slots
  whatsapp.initAllDevices();

  // 4. Start concurrent queue workers across all devices
  queue.startQueueWorker();
});
