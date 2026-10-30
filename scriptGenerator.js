const fs = require('fs');
const path = require('path');
const config = require('./config');

// 52 diverse B2B local business niches with real metrics & pain points
const B2B_NICHES = [
  { id: 'roofing', name: 'Roofing Contractors', city: 'Dallas, TX', avgJob: '$14,500', wastePerLead: '$85', pain: 'paying $85 for shared Angi leads sold to 5 competitors simultaneously', leadExample: 'Lone Star Roofing' },
  { id: 'solar', name: 'Solar Panel Installers', city: 'Phoenix, AZ', avgJob: '$26,000', wastePerLead: '$120', pain: 'wasting $4k/mo on Meta ads that generate disconnected numbers', leadExample: 'SunPeak Energy' },
  { id: 'hvac', name: 'HVAC Specialists', city: 'Atlanta, GA', avgJob: '$8,200', wastePerLead: '$65', pain: 'missing emergency AC calls during summer heat spikes', leadExample: 'Apex Climate Control' },
  { id: 'dental', name: 'Dental Practices', city: 'Miami, FL', avgJob: '$5,500', wastePerLead: '$95', pain: 'receptionists failing to follow up with high-ticket implant inquiries', leadExample: 'Biscayne Dental Studio' },
  { id: 'real_estate', name: 'Real Estate Brokers', city: 'Austin, TX', avgJob: '$18,000', wastePerLead: '$110', pain: 'Zillow charging $1,500/mo for low-intent tire kickers', leadExample: 'Hill Country Realty' },
  { id: 'personal_injury', name: 'Personal Injury Law', city: 'Houston, TX', avgJob: '$35,000', wastePerLead: '$250', pain: 'Google PPC click costs exceeding $180 per single click', leadExample: 'Texas Justice Law Group' },
  { id: 'cosmetic_surgery', name: 'Cosmetic Surgeons & Med Spas', city: 'Beverly Hills, CA', avgJob: '$9,800', wastePerLead: '$140', pain: 'inbound consultations ghosting before deposits are collected', leadExample: 'Luxe Aesthetics Med Spa' },
  { id: 'commercial_cleaning', name: 'Commercial Cleaning Services', city: 'Chicago, IL', avgJob: '$3,800/mo', wastePerLead: '$50', pain: 'cold-calling office buildings only to get stopped by gatekeepers', leadExample: 'Windy City Janitorial' },
  { id: 'epoxy_flooring', name: 'Epoxy Flooring Specialists', city: 'Orlando, FL', avgJob: '$4,500', wastePerLead: '$60', pain: 'losing garage floor bids to competitors with instant quote sites', leadExample: 'Florida Armor Floors' },
  { id: 'tree_care', name: 'Tree Care & Removal', city: 'Charlotte, NC', avgJob: '$3,200', wastePerLead: '$55', pain: 'bidding after storm damage when homeowners call 6 tree services at once', leadExample: 'Carolina Canopy Pros' },
  { id: 'kitchen_remodel', name: 'Kitchen & Bath Remodelers', city: 'Denver, CO', avgJob: '$32,000', wastePerLead: '$130', pain: 'spending 10 hours doing on-site estimates for unqualified prospects', leadExample: 'Mile High Kitchen Craft' },
  { id: 'plumbing', name: 'Emergency Plumbers', city: 'San Antonio, TX', avgJob: '$2,400', wastePerLead: '$70', pain: 'losing burst pipe emergency calls because no one answered in 60 seconds', leadExample: 'Alamo Rapid Plumbing' },
  { id: 'electrician', name: 'Commercial Electricians', city: 'Nashville, TN', avgJob: '$7,800', wastePerLead: '$75', pain: 'waiting 60 days for general contractors to pay retention invoices', leadExample: 'VoltPro Commercial' },
  { id: 'auto_detailing', name: 'Ceramic Coating & Detailing', city: 'Las Vegas, NV', avgJob: '$1,800', wastePerLead: '$40', pain: 'trying to sell $1,500 ceramic packages through messy Instagram DMs', leadExample: 'Vegas Diamond Detailing' },
  { id: 'cpa_tax', name: 'CPA & Tax Advisory Firms', city: 'Boston, MA', avgJob: '$4,200/yr', wastePerLead: '$90', pain: 'taking on low-fee 1040 returns instead of high-retainer corporate clients', leadExample: 'Beacon Hill CPA Advisory' },
  { id: 'chiropractic', name: 'Chiropractic Clinics', city: 'San Diego, CA', avgJob: '$2,900', wastePerLead: '$45', pain: 'buying $29 Groupon adjustments that never turn into wellness plans', leadExample: 'Pacific Spine & Joint' },
  { id: 'pest_control', name: 'Pest & Termite Control', city: 'Tampa, FL', avgJob: '$1,950', wastePerLead: '$50', pain: 'missing seasonal termite swarm bookings to national franchises', leadExample: 'Suncoast Pest Defense' },
  { id: 'concrete_masonry', name: 'Concrete & Masonry Contractors', city: 'Columbus, OH', avgJob: '$8,500', wastePerLead: '$65', pain: 'competing on price for driveway pours against unlicensed crews', leadExample: 'Buckeye Solid Concrete' },
  { id: 'pool_installation', name: 'Pool Builders & Renovation', city: 'Scottsdale, AZ', avgJob: '$65,000', wastePerLead: '$180', pain: 'spending weeks drawing 3D CAD renders for prospects with no budget', leadExample: 'Desert Oasis Pool Design' },
  { id: 'fencing_deck', name: 'Fence & Custom Deck Builders', city: 'Seattle, WA', avgJob: '$11,200', wastePerLead: '$55', pain: 'traveling for hours across town to measure cedar fences that never close', leadExample: 'Emerald City Cedar & Deck' },
  { id: 'foundation_repair', name: 'Foundation Repair Experts', city: 'Kansas City, MO', avgJob: '$13,500', wastePerLead: '$115', pain: 'homeowners putting off structural pier repairs due to sticker shock', leadExample: 'Midwest Pier & Foundation' },
  { id: 'general_contractor', name: 'Commercial General Contractors', city: 'Salt Lake City, UT', avgJob: '$85,000', wastePerLead: '$200', pain: 'submitting sealed bids against 12 other contractors on open portals', leadExample: 'Wasatch Commercial Build' },
  { id: 'painting_contractor', name: 'Commercial Painting Pros', city: 'Indianapolis, IN', avgJob: '$6,400', wastePerLead: '$45', pain: 'homeowners booking estimates just to price match against Sherwin-Williams', leadExample: 'Hoosier Pro Painters' },
  { id: 'water_restoration', name: 'Water & Flood Damage Restoration', city: 'Jacksonville, FL', avgJob: '$9,200', wastePerLead: '$160', pain: 'arriving after the insurance adjuster already assigned the dry-out', leadExample: 'First Coast Flood Rapid' },
  { id: 'mold_remediation', name: 'Certified Mold Remediation', city: 'New Orleans, LA', avgJob: '$7,100', wastePerLead: '$110', pain: 'dealing with anxious homeowners without an instant compliance proof site', leadExample: 'Crescent Mold Solutions' },
  { id: 'garage_doors', name: 'Garage Door Specialists', city: 'Fort Worth, TX', avgJob: '$2,100', wastePerLead: '$45', pain: 'getting outbid by lead aggregator call centers disguised as locals', leadExample: 'Cowtown Garage Pro' },
  { id: 'window_siding', name: 'Window & Siding Replacement', city: 'Minneapolis, MN', avgJob: '$19,000', wastePerLead: '$125', pain: 'paying Anderson Window-level ad costs on search keywords', leadExample: 'Twin Cities Exterior Guard' },
  { id: 'asphalt_paving', name: 'Commercial Asphalt & Paving', city: 'Detroit, MI', avgJob: '$15,000', wastePerLead: '$90', pain: 'missing seasonal parking lot resurfacing contracts before winter freeze', leadExample: 'Motor City Paving Fleet' },
  { id: 'locksmith', name: 'Commercial Locksmith & Access', city: 'Philadelphia, PA', avgJob: '$1,650', wastePerLead: '$40', pain: 'losing keycard master installation deals to security conglomerates', leadExample: 'Liberty Key & Access' },
  { id: 'junk_removal', name: 'Commercial Junk & Cleanout', city: 'Portland, OR', avgJob: '$1,400', wastePerLead: '$35', pain: 'paying 1-800 franchise fees while running independent trucks', leadExample: 'Rose City Hauling Fleet' },
  { id: 'moving_storage', name: 'Long-Distance Moving Services', city: 'Richmond, VA', avgJob: '$5,800', wastePerLead: '$80', pain: 'competing against scam broker sites that underquote and hostage goods', leadExample: 'Old Dominion Relocation' },
  { id: 'property_management', name: 'Commercial Property Managers', city: 'Cleveland, OH', avgJob: '$4,800/mo', wastePerLead: '$100', pain: 'struggling to fill retail strip mall vacancies organically', leadExample: 'Erie Property Partners' },
  { id: 'carpet_cleaning', name: 'Commercial Carpet & Tile Care', city: 'Oklahoma City, OK', avgJob: '$1,850', wastePerLead: '$30', pain: 'booking low-ticket residential living rooms instead of corporate offices', leadExample: 'Sooner State Commercial Clean' },
  { id: 'custom_builder', name: 'Luxury Custom Home Builders', city: 'Charleston, SC', avgJob: '$1,200,000', wastePerLead: '$450', pain: 'relying on word-of-mouth while out-of-state buyers build nearby', leadExample: 'Palmetto Heritage Builders' },
  { id: 'metal_fabrication', name: 'Architectural Metal Fabricators', city: 'Pittsburgh, PA', avgJob: '$24,000', wastePerLead: '$140', pain: 'submitting structural steel fabrication quotes with no follow-up bot', leadExample: 'Steel City Metalcraft' },
  { id: 'fire_protection', name: 'Fire Sprinkler & Safety Systems', city: 'Memphis, TN', avgJob: '$16,000', wastePerLead: '$130', pain: 'missing annual commercial NFPA compliance inspection renewals', leadExample: 'Bluff City Fire Defense' },
  { id: 'pressure_washing', name: 'Commercial Pressure Washing', city: 'Savannah, GA', avgJob: '$2,800', wastePerLead: '$35', pain: 'competing against weekend hobbyists with $200 hardware store rigs', leadExample: 'Coastal Pro HydroWash' },
  { id: 'insulation', name: 'Spray Foam Insulation Pros', city: 'Boise, ID', avgJob: '$6,800', wastePerLead: '$70', pain: 'homeowners choosing cheap fiberglass rolls over high R-value foam', leadExample: 'Treasure Valley Spray Foam' },
  { id: 'gutter_guard', name: 'Seamless Gutter & Guard Pros', city: 'Milwaukee, WI', avgJob: '$3,400', wastePerLead: '$45', pain: 'getting buried by high-spend infomercial brands like LeafFilter', leadExample: 'Lakeview Gutter Defense' },
  { id: 'artificial_turf', name: 'Artificial Turf & Putting Greens', city: 'Las Vegas, NV', avgJob: '$12,500', wastePerLead: '$95', pain: 'homeowners hesitating on turf conversions despite water district rebates', leadExample: 'Silver State EcoTurf' },
  { id: 'home_automation', name: 'Smart Home & AV Automation', city: 'San Jose, CA', avgJob: '$18,500', wastePerLead: '$110', pain: 'customers buying DIY Best Buy gadgets instead of integrated Lutron/Control4', leadExample: 'Silicon Valley Smart Living' },
  { id: 'appliance_repair', name: 'Commercial Refrigeration & Appliance', city: 'Louisville, KY', avgJob: '$1,750', wastePerLead: '$40', pain: 'restaurant walk-in cooler breakdowns going to whoever replies first', leadExample: 'Bluegrass Refrigeration' },
  { id: 'towing_fleet', name: 'Heavy Duty Towing & Recovery', city: 'Albuquerque, NM', avgJob: '$2,200', wastePerLead: '$50', pain: 'paying motor club middle-men $60 for $400 semi-truck recovery pulls', leadExample: 'Route 66 Heavy Towing' },
  { id: 'sign_graphics', name: 'Commercial Signage & Vehicle Wraps', city: 'Cincinnati, OH', avgJob: '$5,200', wastePerLead: '$65', pain: 'spending days designing vector mockups for ghosting fleet managers', leadExample: 'Queen City Signs & Wraps' },
  { id: 'veterinary', name: 'Emergency Veterinary Clinics', city: 'Raleigh, NC', avgJob: '$2,100', wastePerLead: '$55', pain: 'overburdened clinic reception missing high-ticket surgical intakes', leadExample: 'Oak City Animal Emergency' },
  { id: 'physical_therapy', name: 'Sports Physical Therapy Clinics', city: 'Sacramento, CA', avgJob: '$3,100', wastePerLead: '$50', pain: 'relying on slow hospital physician referrals for athletic rehab patients', leadExample: 'Capital Sports Therapy' },
  { id: 'crossfit_gym', name: 'High-End CrossFit & Fitness Studios', city: 'Nashville, TN', avgJob: '$2,400/yr', wastePerLead: '$35', pain: 'high churn rate from free-trial seekers who never commit to yearly tiers', leadExample: 'Titan Functional Fitness' },
  { id: 'b2b_agency', name: 'High-Ticket SMMA & Growth Agencies', city: 'New York, NY', avgJob: '$6,000/mo', wastePerLead: '$120', pain: 'spending 40 hours a week sending dry cold emails that land in spam folders', leadExample: 'Apex Velocity Digital' },
  { id: 'saas_sales', name: 'B2B SaaS Appointment Setters', city: 'San Francisco, CA', avgJob: '$12,000 ACV', wastePerLead: '$180', pain: 'SDR burnouts failing to hit quota dialing gatekeepers on landlines', leadExample: 'Pipeline Accelerator Labs' },
  { id: 'private_security', name: 'Executive Protection & Guard Fleet', city: 'Washington, DC', avgJob: '$22,000/mo', wastePerLead: '$210', pain: 'corporate estates hiring armed guards through slow RFP bureaucracy', leadExample: 'Capitol Shield Security' },
  { id: 'waterproofing', name: 'Basement Waterproofing Systems', city: 'Baltimore, MD', avgJob: '$8,900', wastePerLead: '$85', pain: 'losing wet basement jobs during heavy rains due to delayed inspection callbacks', leadExample: 'Chesapeake Dry Basement' },
  { id: 'equipment_rental', name: 'Heavy Equipment & Scissor Lifts', city: 'El Paso, TX', avgJob: '$4,600/wk', wastePerLead: '$75', pain: 'idle fleet excavators sitting in yards while job sites rent from United Rentals', leadExample: 'Borderland Equipment Fleet' }
];

// 4 distinct high-converting video angles
const ANGLES = [
  {
    id: 'whatsapp_proof',
    name: 'Live WhatsApp 2-Step Closing Proof',
    theme: 'Watch our autonomous bot close a high-ticket client in 2 WhatsApp messages without dialing a single phone call.',
    hookPattern: (niche) => `HOW THIS ${niche.name.toUpperCase()} CLOSED A $599 DEAL IN 2 WHATSAPP MESSAGES`,
    subtitlePattern: (niche) => `Zero cold calls. Zero spam flags. 300+ verified ${niche.city} leads daily.`
  },
  {
    id: 'shared_lead_trap',
    name: 'Shared Lead Trap vs Webify Firehose',
    theme: 'Exposing how lead aggregator portals sell the exact same contact to 5 competitors while Webify feeds exclusive verified mobile numbers.',
    hookPattern: (niche) => `STOP PAYING ${niche.wastePerLead} PER LEAD ON ANGI & THUMBTACK`,
    subtitlePattern: (niche) => `They sell that lead to 5 other ${niche.name}. Here's how Webify delivers 300 exclusive direct mobile numbers.`
  },
  {
    id: 'turnkey_upsell',
    name: 'Turnkey Modern Website Upsell Engine',
    theme: 'How Webify sends an interactive preview of a modern $599 website to the owner on WhatsApp and collects deposits in minutes.',
    hookPattern: (niche) => `THE $599 WEBSITE ENGINE MAKING ${niche.name.toUpperCase()} PRINT CASH`,
    subtitlePattern: (niche) => `We build the turnkey site, verify the owner's WhatsApp, and drop the live link.`
  },
  {
    id: 'competitor_hijack',
    name: 'Autonomous Competitor Hijack',
    theme: 'Scanning Google Maps and new commercial permits to contact local business owners before competitors even know they exist.',
    hookPattern: (niche) => `WE HIJACKED 348 ${niche.name.toUpperCase()} LEADS IN ${niche.city.toUpperCase()}`,
    subtitlePattern: (niche) => `While competitors cold-call dead switchboards, our bot is inside their WhatsApp.`
  }
];

class ScriptGenerator {
  constructor() {
    this.historyFile = config.GENERATION_HISTORY_FILE;
    this.history = this.loadHistory();
  }

  loadHistory() {
    try {
      if (fs.existsSync(this.historyFile)) {
        return JSON.parse(fs.readFileSync(this.historyFile, 'utf8'));
      }
    } catch (e) {
      console.warn(`[ScriptGenerator] Could not load history file: ${e.message}`);
    }
    return { recentNiches: [], recentAngles: [], totalGenerated: 0 };
  }

  saveHistory() {
    try {
      fs.writeFileSync(this.historyFile, JSON.stringify(this.history, null, 2));
    } catch (e) {
      console.warn(`[ScriptGenerator] Could not save history file: ${e.message}`);
    }
  }

  selectDiverseNicheAndAngle() {
    const recentNicheIds = this.history.recentNiches || [];
    const recentAngleIds = this.history.recentAngles || [];

    // Filter niches not used recently (avoid repeating the last 15 niches)
    const availableNiches = B2B_NICHES.filter(n => !recentNicheIds.slice(-15).includes(n.id));
    const nichePool = availableNiches.length > 0 ? availableNiches : B2B_NICHES;
    const selectedNiche = nichePool[Math.floor(Math.random() * nichePool.length)];

    // Filter angles not used in last 2 runs
    const availableAngles = ANGLES.filter(a => !recentAngleIds.slice(-2).includes(a.id));
    const anglePool = availableAngles.length > 0 ? availableAngles : ANGLES;
    const selectedAngle = anglePool[Math.floor(Math.random() * anglePool.length)];

    // Update history
    this.history.recentNiches = [...(this.history.recentNiches || []), selectedNiche.id].slice(-30);
    this.history.recentAngles = [...(this.history.recentAngles || []), selectedAngle.id].slice(-10);
    this.history.totalGenerated = (this.history.totalGenerated || 0) + 1;
    this.saveHistory();

    return { niche: selectedNiche, angle: selectedAngle };
  }

  extractJson(text) {
    if (!text) throw new Error('Empty response from LLM');
    // Try matching inside markdown code fences: ```json ... ``` or ``` ... ```
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match && match[1]) {
      try {
        return JSON.parse(match[1].trim());
      } catch (e) {}
    }
    // Try finding outer JSON object brackets { ... }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(text.slice(firstBrace, lastBrace + 1));
      } catch (e) {}
    }
    return JSON.parse(text.trim());
  }

  async callGroq(prompt) {
    if (!config.GROQ.API_KEY || config.GROQ.API_KEY.includes('SAMPLE')) {
      throw new Error('Groq API Key not configured or placeholder');
    }

    const modelsToTry = [config.GROQ.MODEL, ...(config.GROQ.FALLBACK_MODELS || [])];
    let lastError = null;

    for (const model of modelsToTry) {
      try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.GROQ.API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'system',
                content: 'You are an elite B2B viral video scriptwriter and growth engineer for Webify (the autonomous B2B lead generation & 2-step WhatsApp closing machine). Return ONLY valid raw JSON with no Markdown fences or commentary.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: 0.7,
            max_tokens: 1500
          }),
          signal: AbortSignal.timeout(config.GROQ.TIMEOUT_MS)
        });

        if (response.status === 401) {
          // Authentication failure won't succeed on other models with same key
          const errBody = await response.text();
          throw new Error(`Groq API error (401): ${errBody}`);
        }

        if (!response.ok) {
          const errBody = await response.text();
          throw new Error(`Groq API error with model ${model} (${response.status}): ${errBody.slice(0, 200)}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        return this.extractJson(content);
      } catch (err) {
        lastError = err;
        if (err.message.includes('401')) {
          break; // Don't retry invalid auth
        }
      }
    }

    throw lastError || new Error('All Groq model attempts failed');
  }

  generateProceduralScript(niche, angle) {
    // Highly refined, high-converting procedural script generator for Webify
    const leadsGenerated = Math.floor(Math.random() * 120) + 310; // 310 - 430
    const dealPrice = ['$399', '$499', '$599', '$699'][Math.floor(Math.random() * 4)];
    const closeTimeMin = Math.floor(Math.random() * 7) + 3; // 3-9 mins

    const hookText = angle.hookPattern(niche);
    const hookSub = angle.subtitlePattern(niche);

    // Realistic WhatsApp 2-Step conversation tailored to niche
    const whatsappMsg1 = `Hey ${niche.leadExample}, taking on new ${niche.name.toLowerCase()} contracts in ${niche.city.split(',')[0]} this month?`;
    const whatsappReply = `Yes we are! We have 2 crews available next week. What project do you have?`;
    const whatsappOffer = `Built you a modern instant-quote booking site + verified 300+ active mobile leads: webify.io/${niche.id}`;

    // Flow video prompts (Veo / Flow prompt engineering)
    const flowBasePrompt = `Hyper-realistic cinematic 9:16 vertical video of modern high-tech office desk in ${niche.city}, illuminated dual 4K monitors displaying Webify autonomous lead generation interface, live green radar scanning ${niche.name} business listings on digital map, neon emerald and cyber slate lighting, photorealistic 8k octane render.`;
    const flowExtensionPrompt = `Seamless continuation in 9:16 vertical ratio, camera smoothly swoops in macro focus onto a smartphone displaying incoming WhatsApp reply from verified ${niche.leadExample} owner saying "${whatsappReply}", green security shield pops up displaying "Anti-Spam Gate Passed - 0 Cold Calls", vibrant cinematic glow, 60fps.`;

    // Screen kinetic text beats (exact 16 seconds = 4 beats x 4 seconds)
    const kineticText = {
      scene1: {
        time: '0.0s - 4.0s',
        header: hookText.slice(0, 48),
        subtitle: hookSub.slice(0, 72),
        tag: `NICHE: ${niche.name.toUpperCase()}`
      },
      scene2: {
        time: '4.0s - 8.0s',
        header: 'LIVE 2-STEP WHATSAPP ENGINE',
        msg1: `[Webify] ${whatsappMsg1}`,
        reply: `[${niche.leadExample}] ${whatsappReply}`,
        statusBadge: 'ORGANIC FIRST TOUCH • SPAM FILTER BYPASSED'
      },
      scene3: {
        time: '8.0s - 12.0s',
        header: 'AUTONOMOUS REVENUE HARVEST',
        stat1: `${leadsGenerated} Verified Mobile Leads`,
        stat2: `${dealPrice} Turnkey Site Closed (${closeTimeMin} mins)`,
        stat3: 'Zero Cold Calling • 100% Autonomous Bot'
      },
      scene4: {
        time: '12.0s - 16.0s',
        brand: 'webify.io',
        cta: `Comment 'LEADS' to steal this for ${niche.name}`,
        urgency: 'Free 20-Lead Scrape for first 50 comments'
      }
    };

    // Instagram Viral Caption & Hashtags
    const igCaption = `Most ${niche.name} are burning money ${niche.pain}.\n\n` +
      `Here is how the top 1% are scaling with Webify:\n` +
      `✅ 300+ Verified direct mobile leads scraped & verified every 24h\n` +
      `✅ 2-Step WhatsApp closing engine that bypasses spam filters organically\n` +
      `✅ Turnkey modern websites (${dealPrice}) delivered with instant booking\n` +
      `✅ Zero cold calling. Zero human touch.\n\n` +
      `Want the exact WhatsApp outreach script and 20 free verified mobile leads for ${niche.city}?\n\n` +
      `👇 Comment "LEADS" below and our bot will DM you the system immediately.\n\n` +
      `#b2bleads #smma #leadgeneration #${niche.id} #webdesign #agency #localbusiness #coldoutreach #marketingautomation #whatsappmarketing #b2bmarketing #saas #salesautomation #growthhacking #digitalmarketing #businessgrowth #freelance #agencyowner #scaling #contractor`;

    const hashtags = [
      '#webify', '#b2bleads', '#leadgeneration', '#smma', '#marketingautomation',
      `#${niche.id}`, '#localbusiness', '#whatsappbot', '#coldoutreach', '#salestips',
      '#businessgrowth', '#webdesign', '#agencyowner', '#digitalmarketing', '#entrepreneurship'
    ];

    return {
      niche: niche.name,
      nicheId: niche.id,
      city: niche.city,
      angle: angle.name,
      angleId: angle.id,
      hook: hookText,
      hookSubtitle: hookSub,
      whatsappScript: {
        msg1: whatsappMsg1,
        reply: whatsappReply,
        offer: whatsappOffer
      },
      metrics: {
        leadsCount: `${leadsGenerated}+ Verified Leads`,
        closedAmount: `${dealPrice} Closed`,
        timeToClose: `${closeTimeMin} mins`
      },
      cta: `Comment 'LEADS' for ${niche.name}`,
      flowPrompts: {
        basePrompt: flowBasePrompt,
        extensionPrompt: flowExtensionPrompt
      },
      kineticText,
      caption: igCaption,
      hashtags,
      coverHeadline: `300+ ${niche.name.toUpperCase()} LEADS/DAY`,
      generatedAt: new Date().toISOString(),
      engine: 'algorithmic-diverse-matrix'
    };
  }

  async generateScript() {
    const { niche, angle } = this.selectDiverseNicheAndAngle();
    console.log(`[ScriptGenerator] Selected Niche: "${niche.name}" (${niche.city}) | Angle: "${angle.name}"`);

    // Attempt Groq AI first
    try {
      const groqPrompt = `
Generate a high-converting 16-second Instagram Reel script for Webify.
Target Niche: ${niche.name} in ${niche.city}
Avg Job Size: ${niche.avgJob}
Niche Pain: ${niche.pain}
Video Angle: ${angle.name} (${angle.theme})

Provide a JSON object with:
1. hook (punchy uppercase hook under 45 characters)
2. hookSubtitle (under 70 characters)
3. whatsappScript: { msg1, reply, offer }
4. metrics: { leadsCount, closedAmount, timeToClose }
5. cta (clear comment keyword trigger)
6. flowPrompts: { basePrompt (0-8s Veo prompt), extensionPrompt (8-16s chained continuation prompt) }
7. kineticText: { scene1: { header, subtitle, tag }, scene2: { header, msg1, reply, statusBadge }, scene3: { header, stat1, stat2, stat3 }, scene4: { brand, cta, urgency } }
8. caption (high-converting Instagram caption with hook, bullet points, CTA, and 20+ viral hashtags)
9. hashtags (array of 15 hashtags)
10. coverHeadline (bold 4-6 word text for cover thumbnail)
`;

      const aiScript = await this.callGroq(groqPrompt);
      if (aiScript && aiScript.hook && aiScript.kineticText) {
        console.log(`[ScriptGenerator] Successfully generated script via Groq (${config.GROQ.MODEL})`);
        return {
          ...aiScript,
          niche: niche.name,
          nicheId: niche.id,
          city: niche.city,
          angle: angle.name,
          angleId: angle.id,
          generatedAt: new Date().toISOString(),
          engine: 'groq-ai'
        };
      }
    } catch (err) {
      console.warn(`[ScriptGenerator] Groq API call failed (${err.message}). Seamlessly engaging algorithmic diversity matrix.`);
    }

    // High-fidelity procedural fallback
    const script = this.generateProceduralScript(niche, angle);
    console.log(`[ScriptGenerator] Procedural script generation complete for "${niche.name}"`);
    return script;
  }
}

module.exports = new ScriptGenerator();
