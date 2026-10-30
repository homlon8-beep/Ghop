# Webify Social Media Management Bot 🚀
Autonomous 16-Second AI Video Generation & Instagram Reels Multi-Account Publisher

## 1. Overview
The **Webify Social Media Management Bot** is a production-grade, 100% autonomous agent engineered to market **Webify** (the autonomous B2B lead generation machine generating 300+ verified leads/day, 2-step undetectable WhatsApp closing engine with zero cold calls, and modern $299-$799 high-converting websites).

The bot generates unique, high-converting **16-second vertical 9:16 (1080x1920) videos** and posts them autonomously to Instagram Reels **2 times a day** during peak US user traffic hours.

---

## 2. Core Architecture

```
webify-social-bot/
├── config.js               # Central config, paths, timezone, video specs
├── flow_accounts.json      # Google Labs Flow / Veo multi-account pool & quota tracker
├── flowClient.js           # Multi-account Flow client with 16s chaining & fallback engine
├── scriptGenerator.js      # AI Viral Script Engine (Groq + 52-niche diversity matrix)
├── videoSynthesizer.js     # Native 1080x1920 16.0s vertical kinetic reels synthesizer (FFmpeg)
├── instagramUploader.js    # Instagram Reels publisher (instagram-private-api & session cache)
├── scheduler.js            # US Peak-Time Cron scheduler (11:30 AM EST & 7:30 PM EST)
├── index.js                # CLI controller (--post-now, --generate-only, --status, --daemon)
├── test_bot.js             # Comprehensive unit & integration verification test suite
├── ready_for_upload/       # Staged Reels with verified specs and metadata
├── remotion/               # Remotion React 1080x1920 16s vertical kinetic reels package
└── output/                 # Rendered 16s MP4s, cover frames, and transcripts
```

### Module Highlights:
1. **Flow Accounts Multi-Account Client (`flowClient.js`)**:
   - Manages a pool of Google Labs Flow accounts in `flow_accounts.json`.
   - Supports bearer tokens, session cookies, and quota rotation to prevent rate limits.
   - Generates exact **16-second videos** using Flow's new chaining/extension feature (base clip + 8s extension chained to 16s).
   - Audio-aware FFmpeg stitching: probes clips for audio streams and synthesizes dynamic electronic pulse track if clips are silent.
   - Polling engine (`pollFlowOperation`) for asynchronous Flow/Veo video generation jobs.
   - Features a **full fallback synthesis engine** via FFmpeg and Remotion vertical 9:16 kinetic reels so the bot never halts if a Flow token expires or is refreshing.
2. **Remotion Kinetic Reels Package (`remotion/`)**:
   - Standalone Remotion composition registered at 1080x1920, 30fps, 480 frames (16.0s).
   - 4 modular scene components: `Scene1Hook`, `Scene2WhatsApp`, `Scene3Metrics`, and `Scene4CTA`.
3. **AI Viral Script & Topic Diversity Engine (`scriptGenerator.js`)**:
   - Rotates through **52 local B2B business niches** (roofing, solar, HVAC, dental, real estate, personal injury, med spa, commercial cleaning, etc.).
   - Rotates through **4 distinct conversion angles**: Live WhatsApp 2-Step closing proof, Shared lead trap vs Webify firehose, Turnkey $599 site upsell, and Autonomous competitor hijack.
   - Integrates Groq API (`openai/gpt-oss-120b`) with multi-model fallback and resilient JSON extraction.
   - Preserves historical niche logs in `generation_history.json` to guarantee zero repetition.
4. **Instagram Auto-Reels Publisher (`instagramUploader.js`)**:
   - Direct Instagram Reels uploader using `instagram-private-api`.
   - Handles device spoofing (`samsung_galaxy_s23`) and persistent session cookie storage (`ig_session.json`) to prevent repeated login challenges.
   - Formats video specifically for Reels: 9:16 (1080x1920), H.264 + AAC, 16.0s duration.
   - Auto-extracts high-contrast cover frames at 1.5s mark.
   - Includes graceful staging mode when credentials are in simulation mode.
5. **US Peak-Time Autonomous Scheduler (`scheduler.js`)**:
   - Posts autonomously **2 times a day** during peak US Instagram traffic hours:
     - **Morning Peak: 11:30 AM EST** (lunchtime scroll in New York / US East to West Coast morning)
     - **Evening Peak: 7:30 PM EST** (post-work / evening prime time)
   - Uses `node-cron` with `{ timezone: 'America/New_York' }` and concurrency execution guards.

---

## 3. Configuration & Multi-Account Setup

### Google Labs Flow Accounts (`flow_accounts.json`)
Add your Google Labs Flow / Veo account credentials into `flow_accounts.json`:
```json
{
  "activeAccountIndex": 0,
  "rotationStrategy": "round-robin",
  "accounts": [
    {
      "id": "flow-acc-01",
      "name": "My Main Flow Account",
      "email": "you@gmail.com",
      "bearerToken": "ya29...",
      "cookies": "SID=...; HSID=...; __Secure-1PSID=...",
      "sessionToken": "",
      "quotaRemaining": 100,
      "status": "active"
    }
  ]
}
```

### Instagram Configuration (`ig_config.json` or `.env`)
Configure your Instagram credentials in `.env` or `ig_config.json`:
```bash
IG_USERNAME=your_instagram_handle
IG_PASSWORD=your_instagram_password
IG_SIMULATION_MODE=false
```

---

## 4. CLI Usage & Commands

### 1. Instant Autonomous Post Cycle
Generates the script, renders the 16s video, and publishes/stages the Reel:
```bash
node index.js --post-now
# or
npm run post
```

### 2. Generate-Only Mode
Generates the 16-second video, cover image, and viral caption without uploading:
```bash
node index.js --generate-only
# or
npm run generate
```

### 3. Check System Status & Quotas
Displays Flow account pool health, quotas, Instagram session, and countdown to next peak post:
```bash
node index.js --status
# or
npm run status
```

### 4. Continuous Autonomous Daemon
Starts the scheduler to run continuously 2x daily at 11:30 AM EST and 7:30 PM EST:
```bash
node index.js --daemon
# or
npm start
```

### 5. Run Verification Test Suite
```bash
npm test
# or
node index.js --test
```

---

## 5. Verification Record
- **Resolution**: 1080x1920 (9:16 vertical Reels format verified via `ffprobe`)
- **Duration**: Exact 16.000000 seconds
- **Codecs**: H.264 (`libx264`, `yuv420p`) + AAC (`aac`, 44.1kHz stereo)
- **Cover Image**: Auto-extracted JPEG at 1.5s
- **All 9 Unit & Integration Tests Passed (100%)**
