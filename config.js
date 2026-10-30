const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const BASE_DIR = __dirname;
const OUTPUT_DIR = path.join(BASE_DIR, 'output');
const STAGING_DIR = path.join(BASE_DIR, 'ready_for_upload');
const LOGS_DIR = path.join(BASE_DIR, 'logs');

// Ensure necessary directories exist
[OUTPUT_DIR, STAGING_DIR, LOGS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const configObj = {
  BASE_DIR,
  OUTPUT_DIR,
  STAGING_DIR,
  LOGS_DIR,
  
  // Groq API Configuration
  GROQ: {
    API_KEY: process.env.GROQ_API_KEY || '',
    MODEL: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    FALLBACK_MODELS: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768', 'llama3-70b-8192'],
    TIMEOUT_MS: 30000,
  },

  // Flow / Veo Multi-Account Configuration
  FLOW: {
    ACCOUNTS_FILE: path.join(BASE_DIR, 'flow_accounts.json'),
    DEFAULT_DURATION_SEC: 16,
    BASE_CLIP_DURATION_SEC: 8,
    EXTEND_CLIP_DURATION_SEC: 8,
    DEFAULT_ASPECT_RATIO: '9:16',
    RESOLUTION: { width: 1080, height: 1920 },
    API_ENDPOINTS: [
      'https://labs.google/fx/api/flow',
      'https://aisandbox-pa.googleapis.com/v1'
    ],
  },

  // Instagram Configuration
  INSTAGRAM: {
    CONFIG_FILE: path.join(BASE_DIR, 'ig_config.json'),
    SESSION_FILE: path.join(BASE_DIR, 'ig_session.json'),
    USERNAME: process.env.IG_USERNAME || '',
    PASSWORD: process.env.IG_PASSWORD || '',
    DEVICE_STRING: process.env.IG_DEVICE_STRING || 'samsung_galaxy_s23',
    SIMULATION_MODE: process.env.IG_SIMULATION_MODE === 'true' || !process.env.IG_USERNAME,
  },

  // US Peak Posting Schedule (2x daily)
  // Morning Peak: 11:30 AM EST (11:30 NY time catches East Coast lunch, Central mid-morning, West Coast 8:30 AM coffee)
  // Evening Peak: 7:30 PM EST (19:30 NY time catches East Coast evening, Central dinner, West Coast 4:30 PM commute)
  SCHEDULE: {
    TIMEZONE: 'America/New_York',
    MORNING_CRON: '30 11 * * *', // 11:30 AM EST
    EVENING_CRON: '30 19 * * *', // 7:30 PM EST
    MORNING_DESC: '11:30 AM EST (US Lunch & West Coast Morning Rush)',
    EVENING_DESC: '7:30 PM EST (US Prime Evening & West Coast Commute)',
  },

  // Storage files
  HISTORY_FILE: path.join(BASE_DIR, 'history.json'),
  GENERATION_HISTORY_FILE: path.join(BASE_DIR, 'generation_history.json'),
  BOT_STATE_FILE: path.join(BASE_DIR, 'bot_state.json'),

  // Product core knowledge
  PRODUCT: {
    NAME: 'Webify',
    TAGLINE: 'Autonomous B2B Lead Generation & WhatsApp Closing Machine',
    VALUE_PROPS: [
      '300+ Verified exclusive leads harvested daily across Google Maps & direct mobile lines',
      '2-Step undetectable WhatsApp closing engine (0 cold calls, passes spam filters organically)',
      'High-converting modern turnkey websites delivered for $299 - $799',
      'Autonomous client acquisition with zero human touch'
    ],
    CTAS: [
      "Comment 'LEADS' to steal this exact setup for your niche",
      "Comment 'WEBIFY' and I'll send you 20 free verified mobile leads",
      "Comment 'SYSTEM' for the private 2-step WhatsApp script breakdown",
      "Comment 'SCALE' to get instant access to the lead harvester"
    ]
  }
};

configObj.paths = {
  historyFile: configObj.HISTORY_FILE,
  outputDir: configObj.OUTPUT_DIR,
  readyDir: configObj.STAGING_DIR,
  flowAccountsFile: configObj.FLOW.ACCOUNTS_FILE
};
configObj.config = configObj;

module.exports = configObj;
