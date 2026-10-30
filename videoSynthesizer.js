const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('./config');

function getFFmpegPath() {
  try {
    const installer = require('@ffmpeg-installer/ffmpeg');
    if (installer && installer.path && fs.existsSync(installer.path)) {
      return installer.path;
    }
  } catch (e) {}
  return 'ffmpeg';
}

function getFFprobePath() {
  try {
    const installer = require('@ffprobe-installer/ffprobe');
    if (installer && installer.path && fs.existsSync(installer.path)) {
      return installer.path;
    }
  } catch (e) {}
  return 'ffprobe';
}

class VideoSynthesizer {
  constructor() {
    this.outputDir = config.OUTPUT_DIR;
    this.durationSec = 16;
    this.width = 1080;
    this.height = 1920;
    this.fps = 30;
    this.remotion = {
      rootPath: path.join(__dirname, 'remotion', 'Root.js'),
      compositionId: 'WebifyKineticReel'
    };
  }

  escapeFFmpeg(text) {
    if (!text) return '';
    return text
      .replace(/[\r\n]+/g, ' ')
      .replace(/['"’`]/g, '')
      .replace(/[:;]/g, ' - ')
      .replace(/[!@#$%^&*()_+=\[\]{}|\\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  generateSurrealFilterGraph(story) {
    const isPart1 = story.part === 1;
    const title = this.escapeFFmpeg(story.title || 'THE ABSURD TRANSFORMATION');
    const badge = this.escapeFFmpeg(isPart1 ? 'PART 1 - THE ORIGIN' : 'PART 2 - THE FINALE');
    const cta = this.escapeFFmpeg(isPart1 ? 'PT 2 TONIGHT AT 7 - 30 PM EST' : 'WHAT SHOULD TRANSFORM NEXT');

    const scenes = story.visualScenes || [];
    const sc1 = this.escapeFFmpeg(scenes[0]?.caption || 'ACCIDENTAL TRANSFORMATION');
    const sc2 = this.escapeFFmpeg(scenes[1]?.caption || 'GHOP GHOP GOP');
    const sc3 = this.escapeFFmpeg(scenes[2]?.caption || 'MILLION DOLLAR CHASE');
    const sc4 = this.escapeFFmpeg(scenes[3]?.caption || cta);

    const filters = [
      // Vibrant surreal dark-magenta backdrop
      `color=c=#0f051d:s=1080x1920:d=16:r=30[bg]`,

      // Persistent Top Saga Tag Pill
      `[bg]drawbox=x=(w-840)/2:y=180:w=840:h=90:color=#1e1b4b@0.9:t=fill[top_bg]`,
      `[top_bg]drawbox=x=(w-840)/2:y=180:w=840:h=90:color=#a855f7@0.8:t=3[top_border]`,
      `[top_border]drawtext=text='${badge}':x=(w-text_w)/2:y=208:fontsize=38:fontcolor=#facc15[h_tag]`,

      // SCENE 1 (0-4s): The Hook & Transformation
      `[h_tag]drawbox=x=80:y=480:w=920:h=560:color=#18181b@0.95:t=fill:enable='between(t,0,4)'[s1_0]`,
      `[s1_0]drawbox=x=80:y=480:w=920:h=560:color=#ec4899@0.8:t=5:enable='between(t,0,4)'[s1_1]`,
      `[s1_1]drawtext=text='${title}':x=(w-text_w)/2:y=560:fontsize=52:fontcolor=white:enable='between(t,0,4)'[s1_2]`,
      `[s1_2]drawbox=x=120:y=760:w=840:h=180:color=#ec4899@0.2:t=fill:enable='between(t,0.5,4)'[s1_3]`,
      `[s1_3]drawtext=text='${sc1}':x=(w-text_w)/2:y=825:fontsize=46:fontcolor=#f43f5e:enable='between(t,0.5,4)'[s1_out]`,

      // SCENE 2 (4-8s): Wild Escalation & Onomatopoeia
      `[s1_out]drawbox=x=80:y=420:w=920:h=700:color=#090d16@0.95:t=fill:enable='between(t,4,8)'[s2_0]`,
      `[s2_0]drawbox=x=80:y=420:w=920:h=700:color=#06b6d4@0.9:t=5:enable='between(t,4,8)'[s2_1]`,
      `[s2_1]drawtext=text='GHOP GHOP GOP':x=(w-text_w)/2:y=540:fontsize=76:fontcolor=#38bdf8:enable='between(t,4,8)'[s2_2]`,
      `[s2_2]drawbox=x=120:y=720:w=840:h=260:color=#06b6d4@0.15:t=fill:enable='between(t,4.4,8)'[s2_3]`,
      `[s2_3]drawtext=text='${sc2}':x=(w-text_w)/2:y=820:fontsize=44:fontcolor=white:enable='between(t,4.4,8)'[s2_out]`,

      // SCENE 3 (8-12s): Climax & Sheru Bhai Intervention
      `[s2_out]drawbox=x=80:y=440:w=920:h=680:color=#172554@0.95:t=fill:enable='between(t,8,12)'[s3_0]`,
      `[s3_0]drawbox=x=80:y=440:w=920:h=680:color=#eab308@0.9:t=5:enable='between(t,8,12)'[s3_1]`,
      `[s3_1]drawtext=text='MILLION DOLLAR CLASH':x=(w-text_w)/2:y=530:fontsize=56:fontcolor=#fde047:enable='between(t,8,12)'[s3_2]`,
      `[s3_2]drawbox=x=120:y=680:w=840:h=320:color=#eab308@0.15:t=fill:enable='between(t,8.3,12)'[s3_3]`,
      `[s3_3]drawtext=text='${sc3}':x=(w-text_w)/2:y=810:fontsize=44:fontcolor=white:enable='between(t,8.3,12)'[s3_out]`,

      // SCENE 4 (12-16s): The Cliffhanger / Climax
      `[s3_out]drawbox=x=80:y=420:w=920:h=780:color=#030712@0.98:t=fill:enable='between(t,12,16)'[s4_0]`,
      `[s4_0]drawbox=x=80:y=420:w=920:h=780:color=#10b981@0.9:t=5:enable='between(t,12,16)'[s4_1]`,
      `[s4_1]drawtext=text='${this.escapeFFmpeg(isPart1 ? "DONT MISS THE ENDING" : "END OF CHAPTER")}':x=(w-text_w)/2:y=520:fontsize=44:fontcolor=#34d399:enable='between(t,12,16)'[s4_2]`,
      `[s4_2]drawbox=x=120:y=650:w=840:h=260:color=#10b981@0.2:t=fill:enable='between(t,12.2,16)'[s4_3]`,
      `[s4_3]drawtext=text='${sc4}':x=(w-text_w)/2:y=750:fontsize=48:fontcolor=white:enable='between(t,12.2,16)'[s4_4]`,
      `[s4_4]drawtext=text='${this.escapeFFmpeg(isPart1 ? "Dropping tonight at 7 - 30 PM EST" : "Drop your crazy ideas below")}':x=(w-text_w)/2:y=1020:fontsize=32:fontcolor=#94a3b8:enable='between(t,12.5,16)'[out_v]`
    ];

    return filters.join(';');
  }

  generateFilterGraph(scriptData) {
    // If this is a surreal episodic story (kid turns into ball, Sheru Bhai, etc.)
    if (scriptData.visualScenes && Array.isArray(scriptData.visualScenes)) {
      return this.generateSurrealFilterGraph(scriptData);
    }

    const s1 = scriptData.kineticText?.scene1 || {};
    const s2 = scriptData.kineticText?.scene2 || {};
    const s3 = scriptData.kineticText?.scene3 || {};
    const s4 = scriptData.kineticText?.scene4 || {};

    const tag = this.escapeFFmpeg(s1.tag || `TARGET NICHE: ${scriptData.niche || 'B2B CONTRACTORS'}`);
    const hook = this.escapeFFmpeg(s1.header || scriptData.hook || 'STOP LOSING $10K/MO ON SHARED LEADS');
    const hookSub = this.escapeFFmpeg(s1.subtitle || scriptData.hookSubtitle || 'Exclusive direct mobile numbers delivered daily.');

    const waHeader = this.escapeFFmpeg(s2.header || 'LIVE 2-STEP WHATSAPP CLOSING');
    const waMsg1 = this.escapeFFmpeg(s2.msg1 || '[Webify] Hey, taking on new projects this week?');
    const waReply = this.escapeFFmpeg(s2.reply || '[Owner] Yes we have 2 crews available. What project?');
    const waBadge = this.escapeFFmpeg(s2.statusBadge || 'ORGANIC FIRST TOUCH • ZERO COLD CALLS');

    const s3Header = this.escapeFFmpeg(s3.header || 'AUTONOMOUS REVENUE HARVEST');
    const stat1 = this.escapeFFmpeg(s3.stat1 || `${scriptData.metrics?.leadsCount || '300+ Verified Leads'}`);
    const stat2 = this.escapeFFmpeg(s3.stat2 || `${scriptData.metrics?.closedAmount || '$599 Site Closed'}`);
    const stat3 = this.escapeFFmpeg(s3.stat3 || 'Zero Cold Calling • 100% Autonomous Bot');

    const brand = this.escapeFFmpeg(s4.brand || 'webify.io');
    const cta = this.escapeFFmpeg(s4.cta || scriptData.cta || "Comment 'LEADS' to steal this setup");
    const urgency = this.escapeFFmpeg(s4.urgency || 'First 20 accounts get free lead scrape');

    // High aesthetic 1080x1920 filter graph with smooth scene pacing
    const filters = [
      // Base dark slate luxury background
      `color=c=#0b0f19:s=1080x1920:d=16:r=30[bg]`,

      // SCENE 1 (0.0s - 4.0s): High Impact Pain Hook
      // Top Tag pill
      `[bg]drawbox=x=(w-700)/2:y=380:w=700:h=64:color=#1e293b@0.9:t=fill:enable='between(t,0,4)'[s1_0]`,
      `[s1_0]drawbox=x=(w-700)/2:y=380:w=700:h=64:color=#38bdf8@0.8:t=2:enable='between(t,0,4)'[s1_0b]`,
      `[s1_0b]drawtext=text='${tag}':x=(w-text_w)/2:y=400:fontsize=28:fontcolor=#38bdf8:enable='between(t,0,4)'[s1_1]`,
      // Giant Hook Headline Box
      `[s1_1]drawbox=x=80:y=500:w=920:h=480:color=#111827@0.95:t=fill:enable='between(t,0,4)'[s1_2]`,
      `[s1_2]drawbox=x=80:y=500:w=920:h=480:color=#ef4444@0.8:t=4:enable='between(t,0,4)'[s1_3]`,
      // Hook Alert icon badge
      `[s1_3]drawbox=x=120:y=540:w=160:h=44:color=#ef4444@1:t=fill:enable='between(t,0,4)'[s1_4]`,
      `[s1_4]drawtext=text='LEAD ALERT':x=136:y=552:fontsize=22:fontcolor=white:enable='between(t,0,4)'[s1_5]`,
      // Hook Title
      `[s1_5]drawtext=text='${hook}':x=(w-text_w)/2:y=640:fontsize=54:fontcolor=white:enable='between(t,0.3,4)'[s1_6]`,
      // Hook Subtitle
      `[s1_6]drawtext=text='${hookSub}':x=(w-text_w)/2:y=820:fontsize=32:fontcolor=#94a3b8:enable='between(t,1.0,4)'[s1_7]`,
      // Visual accent bar
      `[s1_7]drawbox=x=140:y=910:w=800:h=4:color=#38bdf8@1:t=fill:enable='between(t,1.2,4)'[s1_8]`,

      // SCENE 2 (4.0s - 8.0s): Live WhatsApp 2-Step Closing
      // WhatsApp Device Frame
      `[s1_8]drawbox=x=70:y=280:w=940:h=1300:color=#0b141a@0.98:t=fill:enable='between(t,4,8)'[s2_0]`,
      `[s2_0]drawbox=x=70:y=280:w=940:h=1300:color=#10b981@0.7:t=3:enable='between(t,4,8)'[s2_1]`,
      // WhatsApp Top Header
      `[s2_1]drawbox=x=70:y=280:w=940:h=100:color=#1f2c34@1:t=fill:enable='between(t,4,8)'[s2_2]`,
      `[s2_2]drawtext=text='${waHeader}':x=110:y=316:fontsize=32:fontcolor=#25d366:enable='between(t,4,8)'[s2_3]`,
      // Message 1 (Webify Outgoing Bubble - Dark Green)
      `[s2_3]drawbox=x=120:y=440:w=840:h=180:color=#005c4b@1:t=fill:enable='between(t,4.2,8)'[s2_4]`,
      `[s2_4]drawtext=text='Webify Outreach (Step 1)':x=150:y=465:fontsize=22:fontcolor=#34d399:enable='between(t,4.2,8)'[s2_5]`,
      `[s2_5]drawtext=text='${waMsg1}':x=150:y=520:fontsize=28:fontcolor=white:enable='between(t,4.4,8)'[s2_6]`,
      // Message 2 (Lead Incoming Reply - Charcoal)
      `[s2_6]drawbox=x=120:y=680:w=840:h=180:color=#202c33@1:t=fill:enable='between(t,5.2,8)'[s2_7]`,
      `[s2_7]drawtext=text='Verified Local Contractor (Step 2)':x=150:y=705:fontsize=22:fontcolor=#38bdf8:enable='between(t,5.2,8)'[s2_8]`,
      `[s2_8]drawtext=text='${waReply}':x=150:y=760:fontsize=28:fontcolor=white:enable='between(t,5.4,8)'[s2_9]`,
      // Verification Shield Badge
      `[s2_9]drawbox=x=120:y=930:w=840:h=110:color=#10b981@0.2:t=fill:enable='between(t,6.0,8)'[s2_10]`,
      `[s2_10]drawbox=x=120:y=930:w=840:h=110:color=#10b981@0.9:t=2:enable='between(t,6.0,8)'[s2_11]`,
      `[s2_11]drawtext=text='[VERIFIED] ${waBadge}':x=(w-text_w)/2:y=972:fontsize=26:fontcolor=#34d399:enable='between(t,6.0,8)'[s2_12]`,

      // SCENE 3 (8.0s - 12.0s): Autonomous Revenue Harvest & Lead Proof
      // Section Header
      `[s2_12]drawtext=text='${s3Header}':x=(w-text_w)/2:y=340:fontsize=46:fontcolor=white:enable='between(t,8,12)'[s3_0]`,
      // Stat Card 1
      `[s3_0]drawbox=x=90:y=450:w=900:h=200:color=#111827@0.95:t=fill:enable='between(t,8,12)'[s3_1]`,
      `[s3_1]drawbox=x=90:y=450:w=900:h=200:color=#10b981@0.8:t=3:enable='between(t,8,12)'[s3_2]`,
      `[s3_2]drawtext=text='LEAD GENERATION FIREHOSE':x=130:y=485:fontsize=24:fontcolor=#10b981:enable='between(t,8,12)'[s3_3]`,
      `[s3_3]drawtext=text='${stat1}':x=130:y=545:fontsize=48:fontcolor=white:enable='between(t,8.2,12)'[s3_4]`,
      // Stat Card 2
      `[s3_4]drawbox=x=90:y=710:w=900:h=200:color=#111827@0.95:t=fill:enable='between(t,9,12)'[s3_5]`,
      `[s3_5]drawbox=x=90:y=710:w=900:h=200:color=#38bdf8@0.8:t=3:enable='between(t,9,12)'[s3_6]`,
      `[s3_6]drawtext=text='AUTOMATED WEBSITE UPSELL':x=130:y=745:fontsize=24:fontcolor=#38bdf8:enable='between(t,9,12)'[s3_7]`,
      `[s3_7]drawtext=text='${stat2}':x=130:y=805:fontsize=48:fontcolor=white:enable='between(t,9.2,12)'[s3_8]`,
      // Stat Card 3
      `[s3_8]drawbox=x=90:y=970:w=900:h=160:color=#1e293b@0.9:t=fill:enable='between(t,10,12)'[s3_9]`,
      `[s3_9]drawbox=x=90:y=970:w=900:h=160:color=#64748b@0.8:t=2:enable='between(t,10,12)'[s3_10]`,
      `[s3_10]drawtext=text='${stat3}':x=(w-text_w)/2:y=1035:fontsize=32:fontcolor=#e2e8f0:enable='between(t,10.2,12)'[s3_11]`,

      // SCENE 4 (12.0s - 16.0s): High-Converting Call To Action
      // Brand Logo Lockup Box
      `[s3_11]drawbox=x=(w-500)/2:y=420:w=500:h=110:color=#10b981@1:t=fill:enable='between(t,12,16)'[s4_0]`,
      `[s4_0]drawtext=text='${brand}':x=(w-text_w)/2:y=450:fontsize=64:fontcolor=white:enable='between(t,12,16)'[s4_1]`,
      // Subtitle
      `[s4_1]drawtext=text='Autonomous B2B Lead Machine':x=(w-text_w)/2:y=590:fontsize=36:fontcolor=#94a3b8:enable='between(t,12,16)'[s4_2]`,
      // Giant CTA Card
      `[s4_2]drawbox=x=80:y=720:w=920:h=340:color=#111827@0.98:t=fill:enable='between(t,12.2,16)'[s4_3]`,
      `[s4_3]drawbox=x=80:y=720:w=920:h=340:color=#38bdf8@0.9:t=4:enable='between(t,12.2,16)'[s4_4]`,
      `[s4_4]drawtext=text='WANT THIS SYSTEM?':x=(w-text_w)/2:y=770:fontsize=42:fontcolor=#38bdf8:enable='between(t,12.3,16)'[s4_5]`,
      `[s4_5]drawtext=text='${cta}':x=(w-text_w)/2:y=860:fontsize=46:fontcolor=white:enable='between(t,12.5,16)'[s4_6]`,
      `[s4_6]drawtext=text='${urgency}':x=(w-text_w)/2:y=960:fontsize=28:fontcolor=#10b981:enable='between(t,12.7,16)'[out_v]`
    ];

    return filters.join(';');
  }

  generateAudioFilter() {
    // 16-second synthesized electronic pulse with bass kick, arpeggiated synth chord and tension drop
    // Stereo 44.1kHz, exactly 16.0s duration
    return 'aevalsrc=0.14*sin(2*PI*120*t)*cos(4*PI*t)+0.08*sin(2*PI*180*t)+0.05*sin(2*PI*360*t)*(t/16):d=16:s=44100';
  }

  async synthesize16sVideo(scriptData, customFilename = null) {
    const timestamp = Date.now();
    const filename = customFilename || `webify_reel_${scriptData.nicheId || 'b2b'}_${timestamp}.mp4`;
    const outputPath = path.join(this.outputDir, filename);
    const coverPath = path.join(this.outputDir, filename.replace('.mp4', '_cover.jpg'));

    console.log(`[VideoSynthesizer] Rendering 16-second 1080x1920 vertical reel for "${scriptData.niche}"...`);
    const filterGraph = this.generateFilterGraph(scriptData);
    const audioFilter = this.generateAudioFilter();

    const args = [
      '-y',
      '-f', 'lavfi', '-i', audioFilter,
      '-filter_complex', filterGraph,
      '-map', '[out_v]',
      '-map', '0:a',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-pix_fmt', 'yuv420p',
      '-r', '30',
      '-t', '16.0',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-movflags', '+faststart',
      outputPath
    ];

    await new Promise((resolve, reject) => {
      const proc = spawn(getFFmpegPath(), args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';

      proc.stderr.on('data', chunk => {
        stderr += chunk.toString();
      });

      proc.on('close', code => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg failed with exit code ${code}:\n${stderr.slice(-600)}`));
        }
      });

      proc.on('error', reject);
    });

    console.log(`[VideoSynthesizer] Video rendered successfully: ${outputPath}`);

    // Auto-extract high quality cover frame at 1.5s
    await this.extractCoverFrame(outputPath, coverPath, 1.5);

    const stats = fs.statSync(outputPath);
    return {
      success: true,
      videoPath: outputPath,
      coverPath: coverPath,
      filename,
      sizeBytes: stats.size,
      durationSec: 16.0,
      resolution: '1080x1920 (9:16 vertical)',
      renderedAt: new Date().toISOString()
    };
  }

  async extractCoverFrame(videoPath, coverPath, timeSec = 1.5) {
    return new Promise((resolve, reject) => {
      const args = [
        '-y',
        '-ss', timeSec.toString(),
        '-i', videoPath,
        '-vframes', '1',
        '-q:v', '2',
        coverPath
      ];

      const proc = spawn(getFFmpegPath(), args, { stdio: 'ignore' });
      proc.on('close', code => {
        if (code === 0 && fs.existsSync(coverPath)) {
          resolve(coverPath);
        } else {
          reject(new Error(`Failed to extract cover image (exit code: ${code})`));
        }
      });
      proc.on('error', reject);
    });
  }
}

module.exports = new VideoSynthesizer();
