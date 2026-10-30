/**
 * MorphVerse Surreal Story Engine
 * Autonomous AI Episodic Storyteller with Ironclad Persistent Memory
 * 
 * Powered by Groq API (openai/gpt-oss-120b)
 * Remembers Part 1 & Part 2 continuity across morning/evening slots:
 * - If Part 1 was posted in morning -> Part 2 posts in evening
 * - If Part 1 was posted in evening -> Part 2 posts tomorrow morning
 * 
 * Generates absurd, viral, high-dopamine AI transformation reels:
 * (kid turns into a bouncy ball, *ghop ghop gop*, Sheru Bhai million dollar quest, impossible cartoon physics)
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
        console.warn(`[Surreal Engine] Memory parse error: ${e.message}. Initializing fresh memory.`);
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
      console.warn(`[Surreal Engine] Could not save memory: ${e.message}`);
    }
  }

  getDefaultMemory() {
    return {
      activeSeriesId: 'series_001',
      lastUploadedPart: 2,           // 1 or 2 (2 means last saga finished, ready for new Part 1)
      lastUploadedSlot: 'evening',   // 'morning' or 'evening'
      lastUploadedAt: new Date().toISOString(),
      nextEpisodeDue: 'part1',       // 'part1' or 'part2'
      currentStory: {
        title: 'The Boy Who Turned Into a Bouncy Ball',
        characters: ['Milo the Bouncy Boy', 'Sheru Bhai'],
        part1Summary: 'Milo sneezed so hard he turned into a neon bouncy ball bouncing across rooftops!',
        cliffhanger: 'Milo bounced off a skyscraper straight toward the Grand Canyon!',
        part1Slot: 'morning',
        part1Timestamp: new Date().toISOString(),
        part2Summary: '',
        part2Timestamp: null
      },
      completedSeries: []
    };
  }

  /**
   * Intelligently determines what episode is due next based on state memory:
   * - If last was Part 1 -> Next MUST BE Part 2 (The Finale)
   * - If last was Part 2 (or none) -> Next MUST BE Part 1 (New Saga Hook)
   */
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
      reason: `Starting brand new surreal saga for Part 1 (Previous saga completed)`
    };
  }

  /**
   * Direct Groq LLM invocation with robust JSON extraction
   */
  async callGroq(prompt) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        model: this.groqModel,
        messages: [
          {
            role: 'system',
            content: `You are the master viral storyteller for "MorphVerse AI" creating hilarious, high-dopamine, surreal 16-second cartoon-transformation short videos for Instagram Reels and YouTube Shorts.
Themes: Kid sneezes and turns into a bouncy rubber ball / bowling ball, unexpected objects transforming, *ghop ghop gop* sound effects, million-dollar Sheru Bhai quests, cartoon physics, instant dopamine hooks.
Universal global appeal: No regional slang or niche B2B text.
Respond with RAW, VALID JSON ONLY. Do not wrap in markdown quotes or preface with any conversational filler.`
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
              
              // Robust JSON Extraction (strips backticks, extra headers, reasoning tokens)
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
              reject(new Error(`Groq API returned error payload: ${data}`));
            }
          } catch (err) {
            reject(new Error(`Failed to parse Groq response as JSON: ${err.message}. Raw preview: ${data.slice(0, 300)}`));
          }
        });
      });

      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  /**
   * Generates next episode in sequence, or forces a specific part if requested
   */
  async generateEpisode(forcedPart = null, currentSlot = 'auto') {
    let targetPart;
    if (forcedPart === 'part1' || forcedPart === 1) {
      targetPart = 1;
    } else if (forcedPart === 'part2' || forcedPart === 2) {
      targetPart = 2;
    } else {
      targetPart = this.determineNextEpisodeType(currentSlot).part;
    }

    const isPart1 = targetPart === 1;
    const slotContext = currentSlot === 'auto'
      ? (new Date().getHours() < 15 ? 'morning' : 'evening')
      : currentSlot;

    // Determine the cliffhanger callout timing based on slot:
    // If Part 1 is in morning -> Part 2 is "TONIGHT AT 7:30 PM EST"
    // If Part 1 is in evening -> Part 2 is "TOMORROW MORNING AT 11:30 AM EST"
    const nextCallout = slotContext === 'morning'
      ? 'Part 2 drops TONIGHT at 7:30 PM EST! 🍿'
      : 'Part 2 drops TOMORROW MORNING at 11:30 AM EST! 🍿';

    console.log(`\n🧠 [Groq Story Brain] Crafting ${isPart1 ? 'PART 1 (The Hook & Cliffhanger)' : 'PART 2 (The Finale Resolution)'}...`);
    console.log(`   Slot: ${slotContext.toUpperCase()} | Next Episode Target: Part ${targetPart}`);

    let prompt = '';

    if (isPart1) {
      // PART 1: Brand New Saga Creation
      prompt = `Create a viral, wildly hilarious 16-second AI transformation reel script for PART 1 of a 2-part daily saga.
Setting current slot: ${slotContext.toUpperCase()}.
Next slot reminder: ${nextCallout}

Themes & Elements:
- A hilarious unexpected transformation (e.g., a kid sneezes and pops into a glowing bouncy rubber ball / neon bowling ball / rocket scooter)
- Ridiculous cartoon physics, bouncy sound effects, and funny catchphrases (*ghop ghop gop*, *boing boing boing*)
- Sheru Bhai appears on a million-dollar quest trying to catch or race it with absurd gadgets
- Ends on a heart-stopping, mind-boggling CLIFFHANGER right at 16 seconds!

Return strictly valid JSON:
{
  "title": "Short punchy saga title (e.g. The Boy Who Turned Into a Bouncy Ball)",
  "part": 1,
  "characters": ["Main transformed character", "Sheru Bhai"],
  "hook": "First 3-second visual and spoken hook that stops scrolling instantly",
  "cliffhanger": "Exact cliffhanger at second 16 that forces viewers to come back for Part 2",
  "voiceoverScript": "16-second fast-paced narrator voiceover (approx 40-50 words) with funny onomatopoeia (*ghop ghop gop!*), ending with: '${nextCallout}'",
  "visualScenes": [
    { "sec": "0-4s", "prompt": "Vibrant 9:16 vertical surreal transformation visual", "caption": "ACCIDENTAL TRANSFORMATION 🏀" },
    { "sec": "4-8s", "prompt": "High speed bouncing/chaos through city/clouds", "caption": "*GHOP GHOP GOP* 🚀" },
    { "sec": "8-12s", "prompt": "Sheru Bhai chasing with ridiculous million dollar net/umbrella", "caption": "SHERU BHAI ON THE HUNT 💰" },
    { "sec": "12-16s", "prompt": "Extreme cliffhanger freeze frame moment", "caption": "PT. 2 ${slotContext === 'morning' ? 'TONIGHT @ 7:30 PM!' : 'TOMORROW @ 11:30 AM!'}" }
  ],
  "instagramCaption": "Viral IG caption with emoji hooks, explaining the wild transformation, warning viewers not to miss Part 2, and 20 viral hashtags (#surreal #aiart #transformation #ghopghop #sherubhai #bouncyball #brainrot #viralreels #part1 #cliffhanger)",
  "soundtrackVibe": "hyper-energy bass boosted cartoon bounce beat"
}`;
    } else {
      // PART 2: Resolves Part 1's EXACT Cliffhanger from Persistent Memory
      const prev = this.memory.currentStory || {};
      const title = prev.title || 'The Kid Who Turned Into a Rubber Ball';
      const characters = prev.characters || ['Milo the Bouncy Boy', 'Sheru Bhai'];
      const cliffhanger = prev.cliffhanger || 'Milo is falling into a giant canyon while Sheru Bhai dives with an umbrella!';
      const part1Summary = prev.part1Summary || 'The boy turned into a bouncing ball and broke the sound barrier.';

      prompt = `Create PART 2 (THE GRAND FINALE) of our viral 16-second AI saga.
You MUST directly resolve the exact cliffhanger from Part 1 with maximum humor, absurdity, and dopamine!

PART 1 STORY MEMORY:
- Title: "${title}"
- Characters: ${JSON.stringify(characters)}
- What happened in Part 1: "${part1Summary}"
- EXACT CLIFFHANGER TO RESOLVE: "${cliffhanger}"

Requirements:
- Start voiceover with: "Part 2! In our last episode..."
- Immediately resolve the cliffhanger using ridiculous cartoon logic (*GHOP GHOP GOP!*, million-dollar trampoline, reverse gravity, confetti explosion)
- Bring the transformation to a hilarious, satisfying conclusion in 16 seconds
- End with a call to action asking viewers: "What should transform in tomorrow's saga? Drop it in the comments! 👇"

Return strictly valid JSON:
{
  "title": "${title} (Part 2 - The Finale)",
  "part": 2,
  "characters": ${JSON.stringify(characters)},
  "voiceoverScript": "High energy 16-second voiceover starting with 'Part 2!', resolving '${cliffhanger}', and finishing with a triumphant punchline and call to action",
  "visualScenes": [
    { "sec": "0-4s", "prompt": "Immediate resolution of the cliffhanger in 9:16 vertical neon style", "caption": "PART 2: THE RESOLUTION 💥" },
    { "sec": "4-8s", "prompt": "Absurd mid-air escalation with *ghop ghop gop* sound effect physics", "caption": "*GHOP GHOP GOP!* ✨" },
    { "sec": "8-12s", "prompt": "Peak funny climax where the transformation finishes", "caption": "MILLION DOLLAR RESCUE 🍦" },
    { "sec": "12-16s", "prompt": "Celebration ending freeze-frame", "caption": "WHAT TRANSFORMS TOMORROW? 👇" }
  ],
  "instagramCaption": "Viral IG caption celebrating the epic conclusion of the saga, tagging the wild stunts, and asking viewers what crazy thing should transform in tomorrow's episode, with 20 viral hashtags",
  "soundtrackVibe": "epic orchestral trap victory beat with funny sound effects"
}`;
    }

    try {
      const storyData = await this.callGroq(prompt);

      // Verify essential fields
      storyData.part = targetPart;
      storyData.title = storyData.title || (isPart1 ? 'The Absurd Transformation' : `${this.memory.currentStory?.title || 'Transformation'} (Part 2)`);

      // Update and persist memory
      if (isPart1) {
        this.memory.activeSeriesId = `series_${Date.now()}`;
        this.memory.lastUploadedPart = 1;
        this.memory.lastUploadedSlot = slotContext;
        this.memory.lastUploadedAt = new Date().toISOString();
        this.memory.nextEpisodeDue = 'part2';
        this.memory.currentStory = {
          title: storyData.title,
          characters: storyData.characters || ['Transformed Hero', 'Sheru Bhai'],
          hook: storyData.hook || 'Wait till you see this...',
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

        // Push to completed series log
        this.memory.completedSeries.unshift({
          id: this.memory.activeSeriesId,
          title: this.memory.currentStory.title,
          completedAt: new Date().toISOString(),
          cliffhanger: this.memory.currentStory.cliffhanger,
          finaleSummary: storyData.voiceoverScript
        });
        // Retain last 50 completed series
        if (this.memory.completedSeries.length > 50) {
          this.memory.completedSeries = this.memory.completedSeries.slice(0, 50);
        }
      }

      this.saveMemory();
      console.log(`✅ [Groq Story Brain] Successfully generated "${storyData.title}" (Part ${storyData.part})`);
      console.log(`   Memory Updated: nextEpisodeDue = "${this.memory.nextEpisodeDue}"`);

      return storyData;
    } catch (err) {
      console.warn(`[Groq Story Brain] API issue (${err.message}). Using procedural backup.`);
      return this.generateProceduralEpisode(isPart1, slotContext);
    }
  }

  /**
   * Procedural offline backup in case of network or API outage
   */
  generateProceduralEpisode(isPart1, slotContext = 'morning') {
    const nextCallout = slotContext === 'morning'
      ? 'Part 2 drops TONIGHT at 7:30 PM EST! 🍿'
      : 'Part 2 drops TOMORROW MORNING at 11:30 AM EST! 🍿';

    if (isPart1) {
      const story = {
        title: 'The Boy Who Turned Into a Bouncy Ball',
        part: 1,
        characters: ['Milo the Bouncy Boy', 'Sheru Bhai'],
        hook: 'He sneezed and instantly turned into a neon basketball!',
        cliffhanger: 'Milo ricocheted off a skyscraper straight into a black hole portal over the Grand Canyon!',
        voiceoverScript: `Milo sneezed so hard his molecules rearranged into a neon basketball! *boing boing boing* Now he is bouncing across rooftops at Mach 4! Sheru Bhai spotted him with a million-dollar butterfly net, but Milo bounced straight toward the Grand Canyon! ${nextCallout}`,
        visualScenes: [
          { sec: '0-4s', prompt: 'Young boy sneezes and instantly pops into a glowing bouncy rubber ball', caption: 'ACCIDENTAL TRANSFORMATION 🏀' },
          { sec: '4-8s', prompt: 'Rubber ball bouncing high into clouds over skyscrapers with speed trails', caption: '*GHOP GHOP GOP* 🚀' },
          { sec: '8-12s', prompt: 'Sheru Bhai chasing the bouncing ball holding a golden net', caption: 'SHERU BHAI ON THE CHASE 💰' },
          { sec: '12-16s', prompt: 'Ball ricocheting off a canyon cliff into a portal', caption: `PT. 2 ${slotContext === 'morning' ? 'TONIGHT @ 7:30 PM!' : 'TOMORROW @ 11:30 AM!'}` }
        ],
        instagramCaption: `Bro literally sneezed and turned into a bouncing rubber ball 💀😭 Sheru Bhai is on his tail with a million dollar bounty! Will he survive the canyon drop? ${nextCallout}\n.\n.\n#surrealism #aiart #transformation #ghopghop #sherubhai #bouncyball #memesdaily #reelsviral #part1 #cliffhanger #brainrot #satisfyingvideos`,
        soundtrackVibe: 'bass-boosted cartoon bounce beat'
      };

      this.memory.activeSeriesId = `series_${Date.now()}`;
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
        title: `${this.memory.currentStory?.title || 'The Bouncy Boy Saga'} (Part 2 - The Finale)`,
        part: 2,
        characters: this.memory.currentStory?.characters || ['Milo the Bouncy Boy', 'Sheru Bhai'],
        voiceoverScript: 'PART 2! Just as Milo was about to hit terminal velocity, Sheru Bhai deployed the million-dollar golden trampoline! *GHOP GHOP GOP!* Milo rebounded straight into the stratosphere, broke the sound barrier, and safely transformed back into a boy holding an ice cream cone! What should transform in tomorrow morning’s saga? Tell us below!',
        visualScenes: [
          { sec: '0-4s', prompt: 'Rubber ball hitting giant golden trampoline at bottom of canyon with shockwave', caption: 'PART 2: THE REBOUND 💥' },
          { sec: '4-8s', prompt: 'Epic rocket launch rebound shooting into the northern lights', caption: '*GHOP GHOP GOP!* ✨' },
          { sec: '8-12s', prompt: 'Ball popping with glitter and turning back into a smiling kid', caption: 'MILLION DOLLAR RESCUE 🍦' },
          { sec: '12-16s', prompt: 'Kid and Sheru Bhai celebrating with ice cream', caption: 'COMMENT WHAT TRANSFORMS NEXT! 👇' }
        ],
        instagramCaption: 'THE FINALE IS HERE! 💥 Sheru Bhai actually pulled off the million dollar trampoline catch! 😭 Milo is back to human form with free ice cream! Comment below what should transform tomorrow! 🌀\n.\n.\n#surreal #aiart #sherubhai #transformation #satisfying #finale #viralreels #reelsinstagram #ghopghop #comedyreels',
        soundtrackVibe: 'epic cinematic victory remix'
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
      currentStory: {
        title: this.memory.currentStory?.title || 'None',
        characters: this.memory.currentStory?.characters || [],
        hook: this.memory.currentStory?.hook || '',
        cliffhanger: this.memory.currentStory?.cliffhanger || '',
        part1Slot: this.memory.currentStory?.part1Slot || '',
        part1Summary: this.memory.currentStory?.part1Summary || '',
        part2Summary: this.memory.currentStory?.part2Summary || ''
      },
      totalCompletedSagas: this.memory.completedSeries?.length || 0,
      recentCompletedSagas: (this.memory.completedSeries || []).slice(0, 5)
    };
  }
}

module.exports = new SurrealStoryEngine();
