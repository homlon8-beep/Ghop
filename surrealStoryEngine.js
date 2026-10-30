/**
 * MorphVerse Indian Viral Meme Story Engine
 * Autonomous AI Episodic Storyteller with All Trending Indian Meme Lore:
 * - "Mai halku hu re!" (Weightless anti-gravity floating)
 * - "Nuclear bomb gir gaya re!" (Absurd colorful cartoon explosions)
 * - "Chin tapak dam dam!" (Magical Desi poof transformations)
 * - "Jaldi waha se hato! 📢" (Nitro speed escapes)
 * - "Moye Moye!" (Hilarious dramatic twists)
 * 
 * Powered by Groq API (openai/gpt-oss-120b) + Procedural Viral Matrix
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { config } = require('./config');

const MEMORY_FILE = path.join(__dirname, 'storyMemory.json');

const INDIAN_MEME_TRENDS = [
  {
    name: "Nuclear Bomb Gir Gaya Reee!",
    tagline: "Nuclear bomb gir gaya reee! 💥",
    hook: "Bhai ne sutli bomb me 100 kadak chai daal di... NUCLEAR BOMB GIR GAYA REEE! 💥",
    setting: "Vibrant Indian street bazaar during Diwali with neon lights and fairy decor",
    character: "Chintu & Sharma Ji",
    promptScene1: "Cinematic 3D animation in 9:16 vertical ratio of an Indian Diwali street, young boy in festive kurta lights a tiny cracker, suddenly a massive cartoon nuclear mushroom cloud erupts with colorful rainbow sparkles and disco laser beams, 8k render",
    promptScene2: "Cinematic 3D animation in 9:16 vertical ratio of the colorful nuclear blast wave lifting up street food stalls, chai glasses and bicycles in zero gravity, Sharma ji flying backwards with aviators, freeze frame cliffhanger, 8k render",
    soundtrack: "nuclear alarm siren remix with heavy dhol trap drop"
  },
  {
    name: "Mai Halku Hu Reee!",
    tagline: "Mai halku hu reee! Halku re halku! 🚀",
    hook: "Auto wale bhaiya ne CNG ki jagah adrak chai daal di aur chillaye: MAI HALKU HU REEE! 🛸",
    setting: "Mumbai Marine Drive at sunset with glowing skyscrapers",
    character: "Raju Auto Wala & Babloo",
    promptScene1: "Cinematic 3D animation in 9:16 vertical ratio of iconic green and yellow Indian auto-rickshaw glowing with neon cyan underglow, lifting off smoothly into the sunset sky above Mumbai Marine Drive, driver waving aviator glasses, 8k render",
    promptScene2: "Cinematic 3D animation in 9:16 vertical ratio of the flying auto-rickshaw floating amongst clouds, a giant glowing UFO samosa chasing it, freeze frame cliffhanger, 8k render",
    soundtrack: "viral high pitch halku audio with bouncy bhangra bass"
  },
  {
    name: "Chin Tapak Dam Dam!",
    tagline: "Chin tapak dam dam! 🪄✨",
    hook: "Coaching ke backbencher ne bola 'Chin tapak dam dam' aur poora classroom space ship ban gaya! 🚀",
    setting: "Bustling Indian coaching institute / college campus",
    character: "Backbencher Bunty & Professor Sir",
    promptScene1: "Cinematic 3D animation in 9:16 vertical ratio of a crowded Indian classroom, student waves a glowing wooden pen shouting Chin Tapak Dam Dam, magical golden sparkles erupt and desks begin to levitate with cartoon physics, 8k render",
    promptScene2: "Cinematic 3D animation in 9:16 vertical ratio of the entire classroom floating in starry space over Earth with neon lights, professor floating with chalk, freeze frame cliffhanger, 8k render",
    soundtrack: "magical chime explosion with fast punjabi beat"
  },
  {
    name: "Jaldi Waha Se Hato! 📢",
    tagline: "Jaldi waha se hato! 📢🏎️",
    hook: "Delhi traffic me auto wale ne megaphone nikala: 'JALDI WAHA SE HATO!' aur rocket engine fire kar diya! 💨",
    setting: "Crowded Delhi traffic near India Gate at dusk",
    character: "Rocket Auto Driver & Traffic Police",
    promptScene1: "Cinematic 3D animation in 9:16 vertical ratio of an Indian auto-rickshaw with twin rocket boosters attached to the back, firing vibrant purple and orange nitro flames, jumping over stuck cars, 8k render",
    promptScene2: "Cinematic 3D animation in 9:16 vertical ratio of the rocket auto soaring high past India Gate with sunset clouds and speed lines, traffic police saluting in awe, freeze frame cliffhanger, 8k render",
    soundtrack: "loud megaphone warning sirens with bass boosted phonk"
  },
  {
    name: "Moye Moye Gravity Twist!",
    tagline: "Moye moye ho gaya! 😭🎶",
    hook: "Halwai ne kadhai me se 1000 degree jalebi nikali, lekin jalebi ne bola 'Moye Moye' aur ud gayi! 🌀",
    setting: "Old Delhi street sweet shop with steaming sugar syrup",
    character: "Halwai Kaka & Ramesh",
    promptScene1: "Cinematic 3D animation in 9:16 vertical ratio of a traditional Indian sweet shop, giant golden swirling jalebi floating out of the boiling sugar pan, glowing with bright neon orange light, spinning like a galaxy, 8k render",
    promptScene2: "Cinematic 3D animation in 9:16 vertical ratio of the giant jalebi galaxy pulling all the samosas and chai cups into its gravity orbit over the city rooftops, freeze frame cliffhanger, 8k render",
    soundtrack: "moye moye sad trumpet remix with hard dhol bass"
  }
];

class SurrealStoryEngine {
  constructor() {
    this.memoryFile = MEMORY_FILE;
    this.groqApiKey = process.env.GROQ_API_KEY || '';
    this.groqModel = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
    this.loadMemory();
  }

  loadMemory() {
    if (fs.existsSync(this.memoryFile)) {
      try {
        this.memory = JSON.parse(fs.readFileSync(this.memoryFile, 'utf8'));
      } catch (e) {
        this.memory = this.getDefaultMemory();
      }
    } else {
      this.memory = this.getDefaultMemory();
      this.saveMemory();
    }
  }

  saveMemory() {
    try {
      fs.writeFileSync(this.memoryFile, JSON.stringify(this.memory, null, 2));
    } catch (e) {}
  }

  getDefaultMemory() {
    return {
      activeSeriesId: 'series_desi_001',
      lastUploadedPart: 2,
      lastUploadedSlot: 'evening',
      lastUploadedAt: new Date().toISOString(),
      nextEpisodeDue: 'part1',
      activeTrendIndex: 0,
      currentStory: {
        title: 'Nuclear Bomb Gir Gaya Reee! 💥',
        characters: ['Chintu', 'Sharma Ji'],
        part1Summary: 'Chintu lit an experimental sutli bomb and screamed NUCLEAR BOMB GIR GAYA REEE!',
        cliffhanger: 'The colorful nuclear cloud lifted the whole bazaar into the sky!',
        part1Slot: 'morning',
        part1Timestamp: new Date().toISOString(),
        part2Summary: '',
        part2Timestamp: null
      },
      completedSeries: []
    };
  }

  getRandomTrend() {
    const idx = Math.floor(Math.random() * INDIAN_MEME_TRENDS.length);
    return INDIAN_MEME_TRENDS[idx];
  }

  determineNextEpisodeType(currentSlot = 'auto') {
    if (this.memory.lastUploadedPart === 1) {
      return {
        part: 2,
        isPart1: false,
        reason: `Continuing active saga "${this.memory.currentStory?.title || 'Unknown'}"`
      };
    }
    return {
      part: 1,
      isPart1: true,
      reason: `Starting brand new Indian viral meme saga for Part 1`
    };
  }

  async callGroq(prompt) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        model: this.groqModel,
        messages: [
          {
            role: 'system',
            content: `You are the master viral storyteller for "MorphVerse AI" creating wildly hilarious, high-dopamine Indian meme AI reels for Instagram Reels.
Key Indian Meme Lore to draw from:
- "Nuclear bomb gir gaya reee!" (Massive colorful cartoon nuclear mushroom cloud over Indian street bazaar)
- "Mai halku hu reee! Halku re halku!" (Anti-gravity floating chai stalls, auto-rickshaws, students)
- "Chin tapak dam dam!" (Magic wand poof transformations into flying samosas/tractors)
- "Jaldi waha se hato! 📢" (Nitro speed escapes over traffic jams)
- "Moye Moye!" (Absurd dramatic twists where gravity fails)
Rules:
- Strictly NO "ghop ghop" or repetitive foreign gibberish.
- High-energy Hinglish voiceover script with iconic Indian catchphrases.
- Visual scenes must describe cinematic 3D animation in 9:16 vertical ratio with vibrant Indian lighting, Bollywood dramatic angles, and cartoon physics.
- Return RAW, VALID JSON ONLY.`
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.85,
        max_tokens: 3000
      });

      const req = https.request('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.groqApiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.choices && parsed.choices.length > 0) {
              const text = parsed.choices[0].message.content.trim();
              let clean = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
              if (!clean.startsWith('{')) {
                const firstBrace = clean.indexOf('{');
                const lastBrace = clean.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace !== -1) {
                  clean = clean.substring(firstBrace, lastBrace + 1);
                }
              }
              const jsonResult = JSON.parse(clean);
              resolve(jsonResult);
            } else {
              reject(new Error(`Groq API returned error: ${data}`));
            }
          } catch (err) {
            reject(new Error(`Failed to parse Groq response: ${err.message}`));
          }
        });
      });

      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  async generateEpisode(forcedPart = null, currentSlot = 'auto') {
    let targetPart;
    if (forcedPart === 'part1' || forcedPart === 1) targetPart = 1;
    else if (forcedPart === 'part2' || forcedPart === 2) targetPart = 2;
    else targetPart = this.determineNextEpisodeType(currentSlot).part;

    const isPart1 = targetPart === 1;
    const slotContext = currentSlot === 'auto'
      ? (new Date().getHours() < 15 ? 'morning' : 'evening')
      : currentSlot;

    const nextCallout = slotContext === 'morning'
      ? 'Part 2 drops TONIGHT at 7:30 PM! 🍿'
      : 'Part 2 drops TOMORROW MORNING at 11:30 AM! 🍿';

    const trend = this.getRandomTrend();
    console.log(`\n🧠 [Indian Meme Brain] Crafting ${isPart1 ? 'PART 1' : 'PART 2'} with Trend: "${trend.name}"...`);

    let prompt = '';

    if (isPart1) {
      prompt = `Create a viral Indian meme 16-second AI reel script for PART 1 of a 2-part daily saga.
Selected Meme Trend: "${trend.name}" (Catchphrase: "${trend.tagline}").
Setting & Vibe: ${trend.setting}.
Hook concept: ${trend.hook}.

Requirements:
- Absolutely NO "ghop ghop".
- High-energy Hinglish voiceover script featuring the catchphrase ("${trend.tagline}"), ending with: "${nextCallout}".
- Ends on a massive cliffhanger at second 16.
- 2 distinct visual scenes for Google Veo (0-8s: The meme trigger, 8-16s: The insane cliffhanger escalation).

Return strictly valid JSON:
{
  "title": "${trend.name} | Indian Meme Saga",
  "part": 1,
  "trendName": "${trend.name}",
  "characters": ["${trend.character}"],
  "hook": "${trend.hook}",
  "cliffhanger": "Insane cliffhanger moment at second 16",
  "voiceoverScript": "16-second fast-paced Hinglish voiceover with viral meme audio energy ending with '${nextCallout}'",
  "visualScenes": [
    { "sec": "0-8s", "prompt": "${trend.promptScene1}", "caption": "${trend.tagline}" },
    { "sec": "8-16s", "prompt": "${trend.promptScene2}", "caption": "PT. 2 ${slotContext === 'morning' ? 'TONIGHT @ 7:30 PM!' : 'TOMORROW @ 11:30 AM!'}" }
  ],
  "instagramCaption": "Viral Hinglish caption with funny emoji hooks, asking viewers if they ever experienced this, warning not to miss Part 2, and 20 viral Indian hashtags (#halkure #nucleargirgya #desimemes #indianmemes #reelsindia #trendingaudio #aiartindia #foryouindia #delhincr #mumbaidiaries #bakchodi #viralindiareels #desicomedy)",
  "soundtrackVibe": "${trend.soundtrack}"
}`;
    } else {
      const prev = this.memory.currentStory || {};
      const title = prev.title || 'Nuclear Bomb Gir Gaya Reee!';
      const characters = prev.characters || ['Chintu', 'Sharma Ji'];
      const cliffhanger = prev.cliffhanger || 'The colorful nuclear blast lifted the whole bazaar into the sky!';
      const part1Summary = prev.part1Summary || 'The nuclear sutli bomb exploded with rainbow disco lights.';

      prompt = `Create PART 2 (THE GRAND FINALE) of our viral Indian meme saga.
Theme: Resolving the cliffhanger: "${cliffhanger}" with maximum Indian comedy and celebration!

PART 1 MEMORY:
- Title: "${title}"
- Characters: ${JSON.stringify(characters)}
- Cliffhanger: "${cliffhanger}"

Requirements:
- Absolutely NO "ghop ghop".
- Start voiceover with: "Part 2! In our last episode..."
- Hilarious Desi resolution (ISRO tractor beam, giant trampoline, free jalebi celebration, wedding baraat rescue).
- Bring to a triumphant conclusion in 16 seconds.
- End with: "Comment below what crazy trend we should do next! 👇"

Return strictly valid JSON:
{
  "title": "${title} (Part 2 - The Finale)",
  "part": 2,
  "characters": ${JSON.stringify(characters)},
  "voiceoverScript": "High energy 16-second Hinglish voiceover starting with 'Part 2!', resolving '${cliffhanger}', and finishing with a triumphant punchline and call to action",
  "visualScenes": [
    { "sec": "0-8s", "prompt": "Cinematic 3D animation in 9:16 vertical ratio resolving the aerial chaos with colorful fireworks, flying tractors and cartoon physics over Indian city, 8k render", "caption": "PART 2: THE DESI FINALE 💥" },
    { "sec": "8-16s", "prompt": "Cinematic 3D animation in 9:16 vertical ratio of grand celebration in Indian bazaar with confetti, marigold flowers, free samosas and dancing, 8k render", "caption": "COMMENT WHAT WE DROP NEXT! 👇" }
  ],
  "instagramCaption": "PART 2 FINALE IS LIVE! 💥 Bhai pura bazaar safely land ho gaya with free samosas 😭 Comment below what crazy trend should happen tomorrow! 🛸👇\n.\n.\n#halkure #nucleargirgya #desimemes #indianmemes #reelsindia #trendingaudio #aiartindia #foryouindia #bakchodi #viralindiareels #desicomedy #part2",
  "soundtrackVibe": "epic celebratory bhangra brass with heavy dhol"
}`;
    }

    try {
      const storyData = await this.callGroq(prompt);
      storyData.part = targetPart;
      storyData.title = storyData.title || `${trend.name} | Part ${targetPart}`;

      if (isPart1) {
        this.memory.activeSeriesId = `series_desi_${Date.now()}`;
        this.memory.lastUploadedPart = 1;
        this.memory.lastUploadedSlot = slotContext;
        this.memory.lastUploadedAt = new Date().toISOString();
        this.memory.nextEpisodeDue = 'part2';
        this.memory.currentStory = {
          title: storyData.title,
          trend: trend.name,
          characters: storyData.characters || [trend.character],
          hook: storyData.hook || trend.hook,
          part1Summary: storyData.voiceoverScript,
          cliffhanger: storyData.cliffhanger || 'Wait for Part 2!',
          part1Slot: slotContext,
          part1Timestamp: new Date().toISOString(),
          part2Summary: '',
          part2Timestamp: null
        };
      } else {
        this.memory.lastUploadedPart = 2;
        this.memory.lastUploadedSlot = slotContext;
        this.memory.lastUploadedAt = new Date().toISOString();
        this.memory.nextEpisodeDue = 'part1';
        this.memory.currentStory.part2Summary = storyData.voiceoverScript;
        this.memory.currentStory.part2Timestamp = new Date().toISOString();

        this.memory.completedSeries.unshift({
          id: this.memory.activeSeriesId,
          title: this.memory.currentStory.title,
          completedAt: new Date().toISOString(),
          cliffhanger: this.memory.currentStory.cliffhanger,
          finaleSummary: storyData.voiceoverScript
        });
        if (this.memory.completedSeries.length > 50) {
          this.memory.completedSeries = this.memory.completedSeries.slice(0, 50);
        }
      }

      this.saveMemory();
      console.log(`✅ [Indian Meme Brain] Generated "${storyData.title}" (Part ${storyData.part})`);
      return storyData;
    } catch (err) {
      console.warn(`[Indian Meme Brain] API issue (${err.message}). Using procedural trend backup.`);
      return this.generateProceduralEpisode(isPart1, slotContext, trend);
    }
  }

  generateProceduralEpisode(isPart1, slotContext = 'morning', trend = null) {
    const selectedTrend = trend || this.getRandomTrend();
    const nextCallout = slotContext === 'morning'
      ? 'Part 2 drops TONIGHT at 7:30 PM! 🍿'
      : 'Part 2 drops TOMORROW MORNING at 11:30 AM! 🍿';

    if (isPart1) {
      const story = {
        title: `${selectedTrend.name} | Indian Meme Saga`,
        part: 1,
        characters: [selectedTrend.character],
        hook: selectedTrend.hook,
        cliffhanger: `Shockwave lifted the entire street into the sky! ${nextCallout}`,
        voiceoverScript: `${selectedTrend.hook} Sab log chillaye ${selectedTrend.tagline}! Poora bazaar hawa me tehelka macha raha hai! ${nextCallout}`,
        visualScenes: [
          { sec: '0-8s', prompt: selectedTrend.promptScene1, caption: selectedTrend.tagline },
          { sec: '8-16s', prompt: selectedTrend.promptScene2, caption: `PT. 2 ${slotContext === 'morning' ? 'TONIGHT @ 7:30 PM!' : 'TOMORROW @ 11:30 AM!'}` }
        ],
        instagramCaption: `${selectedTrend.hook} 😂 Sab log chillaye ${selectedTrend.tagline} 💀 Tag that friend who does this 👇\n.\n.\n#halkure #nucleargirgya #desimemes #indianmemes #reelsindia #trendingaudio #aiartindia #foryouindia #delhincr #mumbaidiaries #bakchodi #viralindiareels #desicomedy`,
        soundtrackVibe: selectedTrend.soundtrack
      };

      this.memory.activeSeriesId = `series_desi_${Date.now()}`;
      this.memory.lastUploadedPart = 1;
      this.memory.lastUploadedSlot = slotContext;
      this.memory.lastUploadedAt = new Date().toISOString();
      this.memory.nextEpisodeDue = 'part2';
      this.memory.currentStory = {
        title: story.title,
        trend: selectedTrend.name,
        characters: story.characters,
        hook: story.hook,
        part1Summary: story.voiceoverScript,
        cliffhanger: story.cliffhanger,
        part1Slot: slotContext,
        part1Timestamp: new Date().toISOString(),
        part2Summary: '',
        part2Timestamp: null
      };
      this.saveMemory();
      return story;
    } else {
      const story = {
        title: `${this.memory.currentStory?.title || 'Indian Meme Saga'} (Part 2 - The Finale)`,
        part: 2,
        characters: this.memory.currentStory?.characters || [selectedTrend.character],
        voiceoverScript: `Part 2! Hawa me sab ud rahe the aur Chintu chillaya—bhai meter down karo! Tabhi ISRO ka golden tractor beam activate hua aur sabko safe terrace pe utaar diya with free garam samosas! Comment karo kal kaunsa trend udayein! 👇`,
        visualScenes: [
          { sec: '0-8s', prompt: 'Cinematic 3D animation in 9:16 vertical ratio resolving aerial chaos with colorful fireworks and anti-gravity cartoon physics over Indian city, 8k render', caption: 'PART 2: THE DESI FINALE 💥' },
          { sec: '8-16s', prompt: 'Cinematic 3D animation in 9:16 vertical ratio of celebration in Indian bazaar with confetti, marigold flowers, free samosas and dancing, 8k render', caption: 'COMMENT WHAT WE DROP NEXT! 👇' }
        ],
        instagramCaption: 'PART 2 THE FINALE IS LIVE! 💥 Sab log safely land ho gaye with free garam samosas 😭 Comment below what crazy trend should happen tomorrow! 🛸👇\n.\n.\n#halkure #nucleargirgya #desimemes #indianmemes #reelsindia #trendingaudio #aiartindia #foryouindia #delhincr #mumbaidiaries #bakchodi #viralindiareels #desicomedy #part2',
        soundtrackVibe: 'celebratory bhangra brass'
      };

      this.memory.lastUploadedPart = 2;
      this.memory.lastUploadedSlot = slotContext;
      this.memory.lastUploadedAt = new Date().toISOString();
      this.memory.nextEpisodeDue = 'part1';
      this.memory.currentStory.part2Summary = story.voiceoverScript;
      this.memory.currentStory.part2Timestamp = new Date().toISOString();

      this.memory.completedSeries.unshift({
        id: this.memory.activeSeriesId,
        title: story.title,
        completedAt: new Date().toISOString(),
        cliffhanger: this.memory.currentStory.cliffhanger,
        finaleSummary: story.voiceoverScript
      });

      this.saveMemory();
      return story;
    }
  }

  getMemoryStatus() {
    this.loadMemory();
    return {
      activeSeriesId: this.memory.activeSeriesId,
      lastUploadedPart: this.memory.lastUploadedPart,
      lastUploadedSlot: this.memory.lastUploadedSlot,
      lastUploadedAt: this.memory.lastUploadedAt,
      nextEpisodeDue: this.memory.nextEpisodeDue,
      currentStory: this.memory.currentStory,
      totalCompletedSagas: this.memory.completedSeries?.length || 0,
      recentCompletedSagas: (this.memory.completedSeries || []).slice(0, 5)
    };
  }
}

module.exports = new SurrealStoryEngine();
