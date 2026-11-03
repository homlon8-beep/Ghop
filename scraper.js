/**
 * Bemisaal Wellness - Indian Health Lead Scraper & Extractor
 * Primary Engine: Yandex Search (CAPTCHA-free, 10-15 leads per query)
 * Fallback: DuckDuckGo HTML + Apify Google Search Actor
 * Discovers Indian mobile numbers (91XXXXXXXXXX) interested in Ayurvedic / Herbal Wellness
 */

const fs = require('fs');
const path = require('path');

const APIFY_TOKEN = process.env.APIFY_API_TOKEN || '';
const LEADS_FILE = path.join(__dirname, 'leads_db.json');
const BACKUP_FILE = path.join(__dirname, 'leads_db.backup.json');
const SENT_HISTORY_FILE = path.join(__dirname, 'sent_history.json');

let cachedDb = null;

// ============================================================================
// STRICT GENTS-ONLY SHIELD (Sharik Shah Mandate: 100% Gents, Zero Ladies)
// ============================================================================
const FEMALE_NAMES = "aarti|aakanksha|aanchal|aayushi|abha|aditi|afsana|aiman|aisha|aishwarya|akanksha|akshata|alisha|alka|alpana|amita|amrita|anamika|ananya|anita|anjali|ankita|annu|anu|anupama|anuradha|aparna|archana|arpita|arshi|arti|aruna|arundhati|asha|ashi|ashwini|asma|astha|avantika|babita|bala|barkha|beena|bhagyashree|bharti|bhavana|bhavna|bhumika|bina|bindiya|binita|champa|chanchal|chanda|chandani|chandni|charu|chhaya|damini|darshana|deepa|deepali|deepika|deepti|devika|diksha|dimple|disha|divya|dolly|drishti|durga|ekta|fatima|farha|farheen|falguni|garima|gayatri|geeta|geetanjali|geetu|gauri|gomti|guddi|gulafsha|gunjan|harshita|heena|hema|hemlata|hina|honey|ila|indu|ishani|ishita|jagriti|janaki|janki|jaya|jayashree|juhi|jyoti|kajal|kalpana|kalyani|kamini|kamla|kamlesh|kanak|kanchan|kanika|karishma|kashish|kasturi|kavita|khushboo|kiran|kirti|komal|koyal|kripa|krishna|kriti|kuldeep|kumkum|kusum|lata|laxmi|leela|madhu|madhuri|mahima|mala|malati|malti|mamta|manisha|manju|manorama|mansi|maya|meena|meenakshi|meera|megha|meghna|menka|mohini|mona|monica|monika|muskan|naina|nalini|namrata|nandini|natasha|neelam|neelu|neena|neeru|neetu|neha|nidhi|niharika|nikita|nimrat|nirupama|nisha|nishat|nitu|nutan|padma|padmini|palak|pallavi|paromita|parul|parvati|payal|pinki|pinky|pooja|poonam|prachi|pragati|pragya|pratibha|pratima|preeti|prerna|priya|priyanka|puja|punam|pushpa|rachna|radha|radhika|rageshwari|ragini|rajani|rajkumari|rajni|rakhi|rama|rashmi|reena|rekha|renu|renuka|reshma|richa|riddhi|rimzim|rina|rinki|rinku|ritu|rohini|roma|roli|roshni|ruby|ruchi|ruchika|rukmani|rupa|rupali|rupam|rupinder|sakshi|sadhana|salma|saloni|samiksha|sandhya|sangeeta|sanjana|sapna|sarika|sarita|saroj|sasmita|savita|savitri|seema|shalinee|shalini|shalu|shanti|sharada|sharda|sharmila|shashi|sheela|sheetal|shikha|shilpa|shimla|shivani|shobha|shraddha|shreya|shrishti|shweta|siddhi|simran|sita|smita|sneha|snehlata|sobha|sonam|sonia|sonali|soni|sonu|sujata|sukanya|suman|sumitra|sunaina|sundari|sunita|supriya|surbhi|suruchi|sushila|sushma|swati|tanu|tanuja|tanushree|tanvi|tara|taruna|teena|tina|trisha|tulsi|uma|upasana|urmila|urvashi|usha|vaishali|vandana|vani|varsha|vasudha|veena|vidya|vineeta|vinita|yamini|yashoda|yasmeen|yogita|zeenat";
const FEMALE_TERMS = "mrs|miss|smt|shrimati|madam|lady|ladies|mahila|aurat|female|women|woman|behan|behn|sister|girl|bhabhi|didi|amma|aunty|mummy|daughter|beti|wife|patni|biwi|mother|mata|nani|dadi|saas|gynae|gynaecologist|gynecologist|gynecology|obstetrician|pregnancy|pregnant|delivery|period|periods|menses|menstruation|mahawari|haiz|pcos|pcod|leucorrhea|leukorrhea|likoriya|safed pani|ovary|uterus|fallopian|breast|vaginal|vagina|cervix|endometriosis|conceive|bachhadani|garbhvati|garbhashay|prasav|antenatal|maternity";
const FEMALE_SUFFIXES = "[a-z]+(devi|kumari|bai|ben|begum|khatoon|bano|kaur)";

const FEMALE_REGEX = new RegExp(`\\b(${FEMALE_NAMES}|${FEMALE_TERMS}|${FEMALE_SUFFIXES})\\b`, 'i');

function isFemaleContext(text) {
  if (!text) return false;
  return FEMALE_REGEX.test(String(text));
}

function purgeFemaleLeads() {
  const db = loadDatabase();
  let purged = 0;
  for (const lead of db.leads) {
    const meta = `${lead.name || ''} ${lead.query || ''} ${lead.city || ''} ${lead.source || ''}`;
    if (isFemaleContext(meta)) {
      if (lead.status !== 'skipped_ladies') {
        lead.status = 'skipped_ladies';
        lead.skippedReason = 'female_indicator_purged';
        recordSentPhone(lead.phone);
        purged++;
      }
    }
  }
  if (purged > 0) {
    saveDatabase(db);
    console.log(`🛡️ [Female Purge Engine] Purged ${purged} female leads from active queue.`);
  }
  return purged;
}

/**
 * Permanent Sent History Tracker (Ensures NO recipient is EVER messaged twice)
 */
function loadSentHistory() {
  try {
    if (fs.existsSync(SENT_HISTORY_FILE)) {
      const raw = fs.readFileSync(SENT_HISTORY_FILE, 'utf8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return new Set(list);
    }
  } catch (e) {}
  return new Set();
}

function recordSentPhone(phone) {
  if (!phone) return;
  const digits = String(phone).replace(/\D/g, '');
  const history = loadSentHistory();
  history.add(digits);
  try {
    fs.writeFileSync(SENT_HISTORY_FILE, JSON.stringify([...history], null, 2), 'utf8');
  } catch (e) {}
}

function recordBulkSentPhones(phoneList) {
  if (!Array.isArray(phoneList)) return { added: 0, total: 0 };
  const history = loadSentHistory();
  let added = 0;
  for (const p of phoneList) {
    const digits = String(p).replace(/\D/g, '');
    if (digits && digits.length >= 7 && !history.has(digits)) {
      history.add(digits);
      added++;
    }
  }
  if (added > 0) {
    try {
      fs.writeFileSync(SENT_HISTORY_FILE, JSON.stringify([...history], null, 2), 'utf8');
      console.log(`🛡️ [Sent History Shield] Recorded ${added} past numbers in permanent shield ledger. Total shielded: ${history.size}`);
    } catch (e) {
      console.error('Error saving sent history:', e.message);
    }
  }
  return { added, total: history.size };
}

function getTotalShieldedCount() {
  return loadSentHistory().size;
}

function isPhoneAlreadySent(phone) {
  if (!phone) return false;
  const digits = String(phone).replace(/\D/g, '');
  const history = loadSentHistory();
  return history.has(digits);
}

function loadDatabase() {
  if (cachedDb && cachedDb.leads && Array.isArray(cachedDb.leads)) {
    return cachedDb;
  }
  try {
    if (fs.existsSync(LEADS_FILE)) {
      const raw = fs.readFileSync(LEADS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.leads)) {
        cachedDb = parsed;
        return cachedDb;
      }
    }
  } catch (err) {
    console.warn('⚠️ [DB Warning] Primary leads_db.json unreadable. Checking backup...', err.message);
  }

  // Fallback to backup file
  try {
    if (fs.existsSync(BACKUP_FILE)) {
      const rawBackup = fs.readFileSync(BACKUP_FILE, 'utf8');
      const parsedBackup = JSON.parse(rawBackup);
      if (parsedBackup && Array.isArray(parsedBackup.leads)) {
        console.log('✅ [DB Recovery] Recovered database from leads_db.backup.json');
        cachedDb = parsedBackup;
        return cachedDb;
      }
    }
  } catch (e) {}

  cachedDb = { leads: [], sentCount: 0 };
  return cachedDb;
}

function saveDatabase(db) {
  cachedDb = db;
  const tempFile = `${LEADS_FILE}.tmp.${Date.now()}`;
  try {
    const payload = JSON.stringify(db, null, 2);
    fs.writeFileSync(tempFile, payload, 'utf8');
    fs.renameSync(tempFile, LEADS_FILE);
    // Mirror backup write
    fs.writeFileSync(BACKUP_FILE, payload, 'utf8');
  } catch (err) {
    console.error('❌ [DB Error] Failed to write leads_db.json safely:', err.message);
    try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (e) {}
  }
}

/**
 * Clean & Format Indian Phone Number into Baileys JID (91XXXXXXXXXX@s.whatsapp.net)
 */
function formatWhatsAppJid(rawNumber) {
  if (!rawNumber) return null;
  let digits = String(rawNumber).replace(/\D/g, '');

  if (digits.startsWith('0') && digits.length === 11) {
    digits = '91' + digits.slice(1);
  } else if (digits.length === 10 && /^[6-9]/.test(digits)) {
    digits = '91' + digits;
  } else if (digits.length === 12 && digits.startsWith('91')) {
    // Already has 91
  } else if (digits.length === 13 && digits.startsWith('091')) {
    digits = digits.slice(1);
  } else {
    return null;
  }

  if (digits.length === 12 && /^91[6-9]\d{9}$/.test(digits)) {
    return {
      cleanNumber: digits,
      jid: `${digits}@s.whatsapp.net`,
      display: `+${digits}`
    };
  }
  return null;
}

/**
 * Add unique leads to database
 */
function addLeadsToQueue(newLeads = []) {
  const db = loadDatabase();
  const existingPhones = new Set(db.leads.map(l => l.phone));
  let added = 0;

  for (const item of newLeads) {
    const formatted = formatWhatsAppJid(item.phone || item.number);
    if (!formatted) continue;

    // Never queue numbers that were already messaged in past sessions
    if (isPhoneAlreadySent(formatted.cleanNumber)) {
      continue;
    }

    // Strict Anti-Delhi Shield: Never target or store Delhi/NCR leads
    const leadContext = `${item.city || ''} ${item.name || ''} ${item.query || ''} ${item.source || ''}`.toLowerCase();
    if (/\b(delhi|new delhi|dilli|ncr)\b/i.test(leadContext)) {
      continue;
    }

    // Strict Gents-Only Filter (Sharik Shah requirement: Zero ladies)
    if (isFemaleContext(leadContext)) {
      continue;
    }

    if (!existingPhones.has(formatted.cleanNumber)) {
      db.leads.push({
        phone: formatted.cleanNumber,
        jid: formatted.jid,
        name: item.name || '',
        city: item.city || 'India',
        source: item.source || 'indian_health_scraper',
        query: item.query || 'ayurvedic wellness',
        discoveredAt: new Date().toISOString(),
        status: 'queued', // queued, sent, replied, not_on_whatsapp, opted_out
        lastSentAt: null
      });
      existingPhones.add(formatted.cleanNumber);
      added++;
    }
  }

  saveDatabase(db);
  if (added > 0) console.log(`✅ [Bemisaal Leads DB] Added ${added} new unique Indian leads. Total in DB: ${db.leads.length}`);
  return { added, total: db.leads.length };
}

function getQueuedLeads(limit = 10) {
  const db = loadDatabase();
  return db.leads.filter(l => l.status === 'queued').slice(0, limit);
}

/**
 * Atomic Lead Claiming for Multi-Device Concurrency (Up to 6 Devices)
 * Guarantees NO two devices ever message or process the same lead!
 */
function claimNextLead(deviceId) {
  const db = loadDatabase();
  const now = Date.now();

  // Find a queued lead or a stalled processing lead (> 10 mins ago)
  const lead = db.leads.find(l => {
    if (l.status === 'queued') return true;
    if (l.status === 'processing' && l.claimed_at && (now - l.claimed_at > 10 * 60 * 1000)) return true;
    return false;
  });

  if (lead) {
    lead.status = 'processing';
    lead.claimed_by = deviceId;
    lead.claimed_at = now;
    saveDatabase(db);
    return lead;
  }
  return null;
}

function releaseLeadClaim(phone) {
  const db = loadDatabase();
  const cleanDigits = String(phone).replace(/\D/g, '');
  const lead = db.leads.find(l => l.phone === cleanDigits || l.phone === phone);
  if (lead && lead.status === 'processing') {
    lead.status = 'queued';
    lead.claimed_by = null;
    lead.claimed_at = null;
    saveDatabase(db);
  }
}

function updateLeadStatus(phone, status, error = null, deviceId = null) {
  const db = loadDatabase();
  const cleanDigits = String(phone).replace(/\D/g, '');
  const lead = db.leads.find(l => l.phone === cleanDigits || l.phone === phone || (l.jid && l.jid.includes(cleanDigits)));
  if (lead) {
    lead.status = status;
    if (deviceId) lead.sent_by = deviceId;
    if (status === 'sent') {
      lead.lastSentAt = new Date().toISOString();
      db.sentCount = (db.sentCount || 0) + 1;
      recordSentPhone(cleanDigits);
    }
    if (error) lead.lastError = error;
    lead.updated_at = Date.now();
    saveDatabase(db);
  }
}

/**
 * 24/7 Continuous Scraper Engine State for Bemisaal Wellness
 */
let is247ScraperRunning = false;
let isScraperPaused = false;
let scraperStats = {
  status: 'Booting 24/7 Engine...',
  cyclesCompleted: 0,
  leadsHarvestedSession: 0,
  totalInDb: 0,
  lastScrapedCity: null,
  lastScrapedNiche: null,
  lastRunTime: null,
  isPaused: false
};

const TARGET_INDIAN_CITIES = [
  'kanpur', 'lucknow', 'varanasi', 'patna', 'indore', 'bhopal',
  'jaipur', 'agra', 'meerut', 'bareilly', 'gorakhpur', 'aligarh',
  'moradabad', 'allahabad', 'gwalior', 'ranchi', 'jabalpur',
  'jodhpur', 'amritsar', 'chandigarh', 'ludhiana', 'nagpur', 'raipur',
  'pune', 'surat', 'rajkot', 'ahmedabad', 'mumbai', 'hyderabad',
  'bangalore', 'kolkata', 'dehradun', 'haridwar', 'mathura', 'firozabad'
];

const TARGET_WELLNESS_NICHES = [
  'mardana kamzori ilaj hakim contact phone',
  'mardana taqat timing dawa phone number',
  'shighrapatan unani dawakhana mobile number',
  'gupt rog clinic contact mobile +91',
  'sexologist doctor for men contact whatsapp',
  'shahi majoon unani dawakhana mobile number',
  'virya timing medicine contact phone',
  'ayurvedic unani sexologist doctor phone +91'
];

function getScraperStats() {
  const db = loadDatabase();
  scraperStats.totalInDb = db.leads.length;
  scraperStats.isPaused = isScraperPaused;
  return scraperStats;
}

function pauseScraper() {
  isScraperPaused = true;
  scraperStats.isPaused = true;
  scraperStats.status = 'Scraper Stopped / Paused by User';
  console.log('🛑 [24/7 Scraper] Paused by user.');
}

function resumeScraper() {
  isScraperPaused = false;
  scraperStats.isPaused = false;
  scraperStats.status = 'Resuming autonomous sweeps...';
  console.log('▶️ [24/7 Scraper] Resumed by user.');
}

async function start247ContinuousScraper() {
  if (is247ScraperRunning) return;
  is247ScraperRunning = true;
  console.log('🇮🇳 [24/7 Bemisaal Scraper] Started non-stop autonomous Indian health lead harvest loop!');

  while (is247ScraperRunning) {
    if (isScraperPaused) {
      scraperStats.status = 'Scraper Stopped / Paused by User';
      await new Promise(resolve => setTimeout(resolve, 3000));
      continue;
    }

    try {
      const db = loadDatabase();
      const queuedCount = db.leads.filter(l => l.status === 'queued').length;

      // If backlog is healthy (>= 60 leads queued), rest 3 minutes to keep CPU minimal
      if (queuedCount >= 60) {
        scraperStats.status = `Queue healthy (${queuedCount} Indian leads queued). Resting 3 mins before next sweep...`;
        await new Promise(resolve => setTimeout(resolve, 3 * 60 * 1000));
        continue;
      }

      const city = TARGET_INDIAN_CITIES[Math.floor(Math.random() * TARGET_INDIAN_CITIES.length)];
      const niche = TARGET_WELLNESS_NICHES[Math.floor(Math.random() * TARGET_WELLNESS_NICHES.length)];

      scraperStats.lastScrapedCity = city;
      scraperStats.lastScrapedNiche = niche;
      scraperStats.lastRunTime = new Date().toISOString();
      scraperStats.status = `Scanning ${city.toUpperCase()} for ${niche.substring(0, 30)}...`;

      const result = await triggerFreeWebScraper({
        targetCount: 25,
        targetCity: city,
        targetNiche: niche
      });

      scraperStats.cyclesCompleted++;
      scraperStats.leadsHarvestedSession += (result?.added || 0);
      scraperStats.status = `Active (Last sweep added ${result?.added || 0} leads from ${city.toUpperCase()}).`;

      // Polite delay between sweeps (8-15s when queue is low, 25s when moderate)
      if (queuedCount < 30) {
        await new Promise(resolve => setTimeout(resolve, 8000 + Math.random() * 7000));
      } else {
        await new Promise(resolve => setTimeout(resolve, 25000));
      }
    } catch (err) {
      console.error('❌ [24/7 Scraper Exception]', err.message);
      scraperStats.status = `Resuming after glitch (${err.message})...`;
      await new Promise(resolve => setTimeout(resolve, 15000));
    }
  }
}

// ============================================================================
// PRIMARY ENGINE: Yandex Search (CAPTCHA-free, 10-15 unique leads per query)
// ============================================================================

/**
 * Extract valid 10-digit Indian mobile numbers from raw text with Gents-Only Context Guard
 * Automatically discards any phone number that appears within 200 chars of female indicators
 * (e.g. Dr. Sunita, Gynecologist, Ladies Clinic, Sister, Pooja, etc.)
 */
function extractIndianPhones(text) {
  const phones = new Set();
  if (!text) return phones;

  const phoneRegex = /(?:\+91[\s.-]*|091[\s.-]*|0|^|\D)([6-9]\d{9})(?:\D|$)/g;
  let match;
  while ((match = phoneRegex.exec(text)) !== null) {
    const rawNumber = match[1];
    const matchPos = match.index;

    // Scan 200 chars before and 200 chars after for female context
    const startPos = Math.max(0, matchPos - 200);
    const endPos = Math.min(text.length, matchPos + 200);
    const surrounding = text.substring(startPos, endPos);

    if (isFemaleContext(surrounding)) {
      // Discard contact appearing in female context
      continue;
    }

    if (/^[6-9]\d{9}$/.test(rawNumber)) {
      phones.add('91' + rawNumber);
    }
  }

  return phones;
}

const ROTATING_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
];

/**
 * Scrape Yandex search results for Indian phone numbers
 */
async function scrapeYandex(query) {
  const url = `https://yandex.com/search/?text=${encodeURIComponent(query)}&numdoc=20`;
  const ua = ROTATING_USER_AGENTS[Math.floor(Math.random() * ROTATING_USER_AGENTS.length)];
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': ua,
        'Accept-Language': 'hi-IN,hi;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    if (!res.ok) return new Set();
    const html = await res.text();

    // Check for captcha
    if (html.includes('captcha') && html.length < 10000) {
      console.log('⚠️ [Yandex] Captcha detected. Backing off...');
      return new Set();
    }

    const stripped = html.replace(/<[^>]+>/g, ' ');
    return extractIndianPhones(stripped);
  } catch (e) {
    return new Set();
  }
}

/**
 * Scrape DuckDuckGo HTML search results (fallback)
 */
async function scrapeDDG(query) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    if (!res.ok) return new Set();
    const html = await res.text();

    // Check for captcha/anomaly
    if (html.includes('anomaly') || html.includes('captcha') || !html.includes('web-result')) {
      return new Set();
    }

    const stripped = html.replace(/<[^>]+>/g, ' ');
    return extractIndianPhones(stripped);
  } catch (e) {
    return new Set();
  }
}

/**
 * Free Fast Scraper: Multi-Engine Indian Phone Harvester
 * Engine Priority: Yandex (primary) -> DuckDuckGo (fallback) -> Apify (emergency)
 */
async function triggerFreeWebScraper(options = {}) {
  const minLeads = options.targetCount || 25;
  console.log(`⚡ [Bemisaal Turbo Scraper] Harvesting Indian health contacts (Target: ${minLeads}+ leads)...`);

  const allExtracted = [];
  const seenInBatch = new Set();

  const cityList = options.targetCity ? [options.targetCity] : [...TARGET_INDIAN_CITIES].sort(() => 0.5 - Math.random()).slice(0, 5);
  const nicheList = options.targetNiche
    ? [options.targetNiche]
    : [...TARGET_WELLNESS_NICHES].sort(() => 0.5 - Math.random()).slice(0, 4);

  for (const city of cityList) {
    if (allExtracted.length >= minLeads) break;

    for (const niche of nicheList) {
      if (allExtracted.length >= minLeads) break;

      const query = `${niche} ${city}`;

      // 1. Try Yandex first (primary engine: 10-15 leads per query, no captcha)
      let phones = await scrapeYandex(query);

      // 2. If Yandex returned nothing, fall back to DuckDuckGo
      if (phones.size === 0) {
        phones = await scrapeDDG(query + ' +91');
      }

      // 3. Deduplicate and validate
      for (const phone of phones) {
        if (allExtracted.length >= minLeads) break;
        const formatted = formatWhatsAppJid(phone);
        if (formatted && !seenInBatch.has(formatted.cleanNumber) && !isPhoneAlreadySent(formatted.cleanNumber)) {
          seenInBatch.add(formatted.cleanNumber);
          allExtracted.push({
            phone: formatted.cleanNumber,
            name: '',
            source: 'yandex_indian_scraper',
            query: `${city} - ${niche.substring(0, 30)}`
          });
        }
      }

      // Polite delay between queries (2-4s)
      await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 2000));
    }
  }

  // 4. Emergency Apify fallback if still too few
  if (allExtracted.length < minLeads && APIFY_TOKEN) {
    try {
      console.log('🔍 [Apify Indian Search] Expanding search with Apify Google Search...');
      const apifyResult = await triggerApifyLeadDiscovery();
      // Apify adds directly to DB, so we just note it
    } catch (e) {}
  }

  console.log(`🎯 [Bemisaal Scraper] Extracted ${allExtracted.length} verified Indian leads.`);
  return addLeadsToQueue(allExtracted);
}

/**
 * Apify Google Search Scraper targeted for Indian Wellness & Herbal inquiries
 */
async function triggerApifyLeadDiscovery() {
  if (!APIFY_TOKEN) {
    console.warn('⚠️ APIFY_API_TOKEN is missing in environment.');
    return { added: 0 };
  }

  console.log('🔍 [Apify Health Scraper] Searching Indian herbal and men\'s health inquiries...');
  const searchQueries = [
    'mardana kamzori ayurvedic treatment contact number',
    'shighrapatan ilaj whatsapp number hakim',
    'ayurvedic sexologist doctor phone inquiry Kanpur',
    'gupt rog clinic contact Mumbai',
    'unani ayurvedic majoon customer inquiry'
  ];

  try {
    const runResponse = await fetch(`https://api.apify.com/v2/acts/apify~google-search-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}&memory=512`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queries: searchQueries.join('\n'),
        maxPagesPerQuery: 1,
        resultsPerPage: 20,
        mobileResults: true,
        languageCode: 'hi'
      })
    });

    if (!runResponse.ok) return { added: 0 };

    const items = await runResponse.json();
    const extracted = [];

    for (const item of items) {
      const textToSearch = `${item.title || ''} ${item.description || ''} ${item.snippet || ''}`;
      const phones = extractIndianPhones(textToSearch);
      for (const phone of phones) {
        const formatted = formatWhatsAppJid(phone);
        if (formatted) {
          extracted.push({
            phone: formatted.cleanNumber,
            name: '',
            source: 'apify_google_search',
            query: item.searchQuery || 'herbal inquiry'
          });
        }
      }
    }

    console.log(`🎯 [Apify Health Scraper] Found ${extracted.length} Indian contacts.`);
    return addLeadsToQueue(extracted);
  } catch (err) {
    console.error('❌ Apify Run Failed:', err.message);
    return { added: 0 };
  }
}

function getHotRepliedLeads() {
  const db = loadDatabase();
  return db.leads.filter(l => l.status === 'replied');
}

/**
 * Get all discovered leads in the database (turns leads into an exportable list)
 */
function getAllDiscoveredLeads(statusFilter = 'all') {
  const db = loadDatabase();
  if (!statusFilter || statusFilter === 'all') {
    return [...db.leads].reverse();
  }
  return db.leads.filter(l => l.status === statusFilter).reverse();
}

module.exports = {
  loadDatabase,
  saveDatabase,
  addLeadsToQueue,
  getQueuedLeads,
  claimNextLead,
  releaseLeadClaim,
  getHotRepliedLeads,
  getAllDiscoveredLeads,
  updateLeadStatus,
  triggerFreeWebScraper,
  triggerApifyLeadDiscovery,
  start247ContinuousScraper,
  pauseScraper,
  resumeScraper,
  isPhoneAlreadySent,
  recordSentPhone,
  recordBulkSentPhones,
  getTotalShieldedCount,
  getScraperStats,
  formatWhatsAppJid,
  isFemaleContext,
  purgeFemaleLeads
};
