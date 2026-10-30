/**
 * MorphVerse Indian Viral Meme Story Engine
 * Autonomous AI Episodic Storyteller for Indian Trending Reel Lore ("Ayy Halku re!" Style)
 * 
 * Powered by Groq API (openai/gpt-oss-120b)
 * Generates viral, high-retention 16-second Desi surreal AI Reels:
 * - "Ayy Halku re!" floating physics & weightless absurdity
 * - Relatable Indian characters (Auto wale Bhaiya, Ramesh Chaiwala, Sharma ji ka beta, Babloo)
 * - Authentic Indian settings (Chai tapri, Mumbai Marine Drive, Delhi streets, Indian wedding baraats)
 * - Viral Hinglish captions & engagement hooks
 * - ZERO "ghop ghop" or repetitive foreign filler
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { config } = require('./config');

const MEMORY_FILE = path.join(__dirname, 'storyMemory.json');

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
        console.warn(`[Indian Meme Engine] Memory parse error: ${e.message}. Initializing fresh memory.`);
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
    } catch (e) {
      console.warn(`[Indian Meme Engine] Could not save memory: ${e.message}`);
    }
  }

  getDefaultMemory() {
    return {
      activeSeriesId: 'series_desi_001',
      lastUploadedPart: 2,
      lastUploadedSlot: 'evening',
      lastUploadedAt: new Date().toISOString(),
      nextEpisodeDue: 'part1',
      currentStory: {
        title: 'Auto Wale Bhaiya Entered Orbit (Ayy Halku Re!)',
        characters: ['Raju Auto Wala', 'Sharma Ji'],
        part1Summary: 'Raju put special cutting chai into his CNG auto-rickshaw and it started floating above Mumbai Marine Drive! Ayy Halku re!',
        cliffhanger: 'The flying auto is heading straight toward the moon while Sharma ji clings to the meter!',
        part1Slot: 'morning',
        part1Timestamp: new Date().toISOString(),
        part2Summary: '',
        part2Timestamp: null
      },
      completedSeries: []
    };
  }

  determineNextEpisodeType(currentSlot = 'auto') {
    if (this.memory.lastUploadedPart === 1) {
      return {
        part: 2,
        isPart1: false,
        reason: `Continuing active saga "${this.memory.currentStory?.title || 'Unknown'}" (Part 1 was uploaded in ${this.memory.lastUploadedSlot || 'previous slot'})`
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
            content: `You are the master viral storyteller for "MorphVerse AI" creating wildly hilarious, high-dopamine Indian meme AI reels ("Ayy Halku re!" trend, Desi surreal comedy, relatable Indian situations) for Instagram Reels.
Themes:
- "Ayy Halku re!" trend: everyday Indian things suddenly becoming weightless and floating into the sky (flying auto-rickshaws, cutting chai kettles floating above street tapris, samosas flying like UFOs, buffaloes floating in wedding baraats, supersonic flying chappals, Indian boys drinking sting and floating into space).
- High relatable Desi comedy: Ramesh Bhai, Sharma ji, Babloo, Auto wale bhaiya, coaching class backbenchers, Mumbai Marine Drive, Delhi metro, local chai stalls with steaming brass kettles.
- Absolutely NO "ghop ghop" or repetitive foreign gibberish.
- Hinglish viral captions with witty hooks, emoji punchlines, and trending Indian hashtags (#halkure #desimemes #indianmemes #reelsindia #trendingaudio #aiartindia #foryouindia #bakchodi #desicomedy #viralindiareels).
- Visual scenes must describe cinematic, ultra-detailed 3D animation in 9:16 vertical ratio with vibrant Indian lighting and cartoon physics.
Respond with RAW, VALID JSON ONLY. No markdown wrapper.`
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

    console.log(`\n🧠 [Indian Meme AI Brain] Crafting ${isPart1 ? 'PART 1 (Desi Hook & Cliffhanger)' : 'PART 2 (Desi Finale Climax)'}...`);

    let prompt = '';

    if (isPart1) {
      prompt = `Create a viral Indian meme 16-second AI reel script for PART 1 of a 2-part daily saga.
Theme: "Ayy Halku re!" floating trend and surreal Desi comedy.
Examples of themes to pick from:
1. Auto wale bhaiya puts special cutting chai into his CNG auto-rickshaw and it starts floating like a drone over Mumbai Marine Drive.
2. Chai tapri wala boils tea with so much swag the entire tea stall and kettle start floating into the clouds ("Ayy Halku re!").
3. Ramesh eats an ultra-spicy samosa and gains anti-gravity flight over Delhi Gate with neon sparkles.
4. Desi wedding baraat where the groom's horse suddenly sprouts glowing wings and starts dancing on clouds.

Requirements:
- Absolutely NO "ghop ghop".
- High-energy Hinglish voiceover script ending with "${nextCallout}".
- Ends on a mind-blowing cliffhanger at second 16.
- 2 distinct visual scenes for Google Veo (0-8s: Setup & floating hook, 8-16s: Escalation & cliffhanger).

Return strictly valid JSON:
{
  "title": "Short punchy Indian meme title (e.g., Auto Wale Bhaiya Entered Orbit | Ayy Halku Re!)",
  "part": 1,
  "characters": ["Main Indian character", "Supporting character (e.g. Sharma ji, Babloo)"],
  "hook": "First 3-second visual and spoken Hinglish hook",
  "cliffhanger": "Exact cliffhanger moment at second 16",
  "voiceoverScript": "16-second fast-paced Hinglish voiceover with funny Desi commentary, ending with: '${nextCallout}'",
  "visualScenes": [
    { "sec": "0-8s", "prompt": "Cinematic 3D animation in 9:16 vertical ratio of Indian setting, character with colorful attire, object suddenly floating weightlessly into the air with vibrant neon sparkles and Bollywood dramatic camera zoom, 8k render", "caption": "AYY HALKU RE! 🚀" },
    { "sec": "8-16s", "prompt": "Cinematic 3D animation in 9:16 vertical ratio of extreme aerial chaos above Indian landmarks, vibrant evening sunset lighting, cliffhanger freeze-frame, 8k render", "caption": "PT. 2 ${slotContext === 'morning' ? 'TONIGHT @ 7:30 PM!' : 'TOMORROW @ 11:30 AM!'}" }
  ],
  "instagramCaption": "Viral Hinglish caption with funny emoji hooks, asking viewers if they ever experienced this, warning not to miss Part 2, and 20 viral Indian hashtags (#halkure #desimemes #indianmemes #reelsindia #trendingaudio #aiartindia #foryouindia #delhincr #mumbaidiaries #bakchodi #viralindiareels #desicomedy)",
  "soundtrackVibe": "bhangra bass boosted viral trap beat with dhol"
}`;
    } else {
      const prev = this.memory.currentStory || {};
      const title = prev.title || 'Auto Wale Bhaiya Entered Orbit';
      const characters = prev.characters || ['Raju Auto Wala', 'Sharma Ji'];
      const cliffhanger = prev.cliffhanger || 'The flying auto is heading straight toward the moon!';
      const part1Summary = prev.part1Summary || 'The auto rickshaw started floating over Marine Drive.';

      prompt = `Create PART 2 (THE GRAND FINALE) of our viral Indian meme saga.
Theme: Resolving the "Ayy Halku re!" floating cliffhanger with maximum Desi comedy and absurdity!

PART 1 STORY MEMORY:
- Title: "${title}"
- Characters: ${JSON.stringify(characters)}
- What happened in Part 1: "${part1Summary}"
- EXACT CLIFFHANGER TO RESOLVE: "${cliffhanger}"

Requirements:
- Absolutely NO "ghop ghop".
- Start voiceover with: "Part 2! In our last episode..."
- Immediately resolve the cliffhanger using hilarious Desi logic (ISRO intervention, samosa thruster, landing on a giant wedding tent, free jalebi celebration).
- Bring to a triumphant conclusion in 16 seconds.
- End with: "Comment below what should float tomorrow! 👇"

Return strictly valid JSON:
{
  "title": "${title} (Part 2 - The Finale)",
  "part": 2,
  "characters": ${JSON.stringify(characters)},
  "voiceoverScript": "High energy 16-second Hinglish voiceover starting with 'Part 2!', resolving '${cliffhanger}', and finishing with a triumphant punchline and call to action",
  "visualScenes": [
    { "sec": "0-8s", "prompt": "Cinematic 3D animation in 9:16 vertical ratio resolving the cliffhanger mid-air above Indian city with colorful fireworks and anti-gravity cartoon physics, 8k render", "caption": "PART 2: THE DESI FINALE 💥" },
    { "sec": "8-16s", "prompt": "Cinematic 3D animation in 9:16 vertical ratio of triumphant landing in a vibrant Indian festival with celebration, marigold garlands, and confetti, 8k render", "caption": "COMMENT WHAT FLOATS NEXT! 👇" }
  ],
  "instagramCaption": "Viral Hinglish caption celebrating the epic Desi finale, tagging the crazy stunt, and asking viewers what should float in tomorrow's episode, with 20 viral Indian hashtags (#halkure #desimemes #indianmemes #reelsindia #trendingaudio #aiartindia #foryouindia #delhincr #mumbaidiaries #bakchodi #viralindiareels #desicomedy)",
  "soundtrackVibe": "epic dhol beats with celebratory brass band"
}`;
    }

    try {
      const storyData = await this.callGroq(prompt);
      storyData.part = targetPart;
      storyData.title = storyData.title || (isPart1 ? 'Auto Wale Bhaiya Entered Orbit | Ayy Halku Re!' : `${this.memory.currentStory?.title || 'Desi Saga'} (Part 2)`);

      if (isPart1) {
        this.memory.activeSeriesId = `series_desi_${Date.now()}`;
        this.memory.lastUploadedPart = 1;
        this.memory.lastUploadedSlot = slotContext;
        this.memory.lastUploadedAt = new Date().toISOString();
        this.memory.nextEpisodeDue = 'part2';
        this.memory.currentStory = {
          title: storyData.title,
          characters: storyData.characters || ['Raju Auto Wala', 'Sharma Ji'],
          hook: storyData.hook || 'Ayy Halku re!',
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
      console.log(`✅ [Indian Meme AI Brain] Generated "${storyData.title}" (Part ${storyData.part})`);
      return storyData;
    } catch (err) {
      console.warn(`[Indian Meme AI Brain] API issue (${err.message}). Using procedural backup.`);
      return this.generateProceduralEpisode(isPart1, slotContext);
    }
  }

  generateProceduralEpisode(isPart1, slotContext = 'morning') {
    const nextCallout = slotContext === 'morning'
      ? 'Part 2 drops TONIGHT at 7:30 PM! 🍿'
      : 'Part 2 drops TOMORROW MORNING at 11:30 AM! 🍿';

    if (isPart1) {
      const story = {
        title: 'Auto Wale Bhaiya Entered Orbit | Ayy Halku Re!',
        part: 1,
        characters: ['Raju Auto Wala', 'Sharma Ji'],
        hook: 'Bhai ne auto me CNG ki jagah cutting chai daal di!',
        cliffhanger: 'Auto sidha cloud 9 cross kar gaya—Sharma ji meter pakad ke chillaye! Will they return?',
        voiceoverScript: `Bhai ne auto me CNG ki jagah kadak adrak chai daal di! Ayy Halku re! Auto sidha Mumbai Marine Drive chhod ke hawa me udne laga! Sharma ji piche baithe bol rahe meter down karo bhaiya! Lekin auto ab Chandrayaan ke raste pe nikal chuka hai! ${nextCallout}`,
        visualScenes: [
          { sec: '0-8s', prompt: 'Cinematic 3D animation in 9:16 vertical ratio of iconic yellow and green Indian auto-rickshaw floating weightlessly above bustling Mumbai Marine Drive at sunset, neon underglow, driver wearing aviator sunglasses, colorful sparks, Bollywood dramatic camera angle, 8k render', caption: 'AYY HALKU RE! 🚀' },
          { sec: '8-16s', prompt: 'Cinematic 3D animation in 9:16 vertical ratio of the flying auto-rickshaw breaking through clouds into starry space with Earth in background, freeze frame cliffhanger, 8k render', caption: `PT. 2 ${slotContext === 'morning' ? 'TONIGHT @ 7:30 PM!' : 'TOMORROW @ 11:30 AM!'}` }
        ],
        instagramCaption: `Ayy Halku re! 😂 Auto wale bhaiya ne CNG ki jagah adrak chai daal di 💀 Sharma ji bol rahe meter down karo 😭 Tag that friend who drives like this 👇\n.\n.\n#halkure #desimemes #indianmemes #reelsindia #trendingaudio #aiartindia #foryouindia #delhincr #mumbaidiaries #bakchodi #viralindiareels #desicomedy #autowala`,
        soundtrackVibe: 'dhol bass boosted trap'
      };

      this.memory.activeSeriesId = `series_desi_${Date.now()}`;
      this.memory.lastUploadedPart = 1;
      this.memory.lastUploadedSlot = slotContext;
      this.memory.lastUploadedAt = new Date().toISOString();
      this.memory.nextEpisodeDue = 'part2';
      this.memory.currentStory = {
        title: story.title,
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
        title: `${this.memory.currentStory?.title || 'Auto Wale Bhaiya'} (Part 2 - The Finale)`,
        part: 2,
        characters: this.memory.currentStory?.characters || ['Raju Auto Wala', 'Sharma Ji'],
        voiceoverScript: 'Part 2! Auto stratosphere me pohoch gaya tha aur Sharma ji ki saans phool rahi thi! Tabhi Raju bhaiya ne reverse gear daala aur samosa parachute deploy kar diya! Auto sidha Sharma ji ki terrace pe safe land hua aur Raju bola—sirf 50 rupaye hue! Comment karo kal kya udayein! 👇',
        visualScenes: [
          { sec: '0-8s', prompt: 'Cinematic 3D animation in 9:16 vertical ratio of flying auto-rickshaw opening giant colorful parachute with fireworks descent over vibrant Indian city, 8k render', caption: 'PART 2: THE REVERSE DESI DRIFT 💥' },
          { sec: '8-16s', prompt: 'Cinematic 3D animation in 9:16 vertical ratio of auto landing smoothly on Indian rooftop terrace with chai and samosas, celebrating with confetti, 8k render', caption: 'COMMENT WHAT FLOATS NEXT! 👇' }
        ],
        instagramCaption: 'PART 2 THE FINALE IS LIVE! 💥 Raju bhaiya ne safely land kara diya sirf ₹50 meter pe 😭 Sharma ji abhi bhi shock me hain! Comment below what should float in tomorrow’s saga! 🛸👇\n.\n.\n#halkure #desimemes #indianmemes #reelsindia #trendingaudio #aiartindia #foryouindia #delhincr #mumbaidiaries #bakchodi #viralindiareels #desicomedy #part2',
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
