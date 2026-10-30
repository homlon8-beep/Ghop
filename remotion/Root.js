const React = require('react');
const { Composition } = require('remotion');
const WebifyKineticReel = require('./KineticReel');

function RemotionRoot() {
  const defaultScriptData = {
    niche: 'Commercial Roofing Pros',
    kineticText: {
      scene1: {
        tag: 'NICHE: ROOFING CONTRACTORS',
        header: 'STOP LOSING $14,500 ROOF JOBS TO SHARED LEADS',
        subtitle: 'Exclusive direct mobile numbers delivered daily in Dallas, TX.'
      },
      scene2: {
        header: 'LIVE 2-STEP WHATSAPP CLOSING',
        msg1: 'Hey Lone Star Roofing, taking on new roofing contracts this month?',
        reply: 'Yes we are! We have 2 crews available next week. What project?',
        statusBadge: 'ORGANIC FIRST TOUCH • SPAM FILTER BYPASSED'
      },
      scene3: {
        header: 'AUTONOMOUS REVENUE HARVEST',
        stat1: '348 Verified Mobile Leads',
        stat2: '$599 Turnkey Site Closed (4 mins)',
        stat3: 'Zero Cold Calling • 100% Autonomous Bot'
      },
      scene4: {
        brand: 'webify.io',
        cta: "Comment 'LEADS' to steal this setup",
        urgency: 'Free 20-Lead Scrape for first 50 comments'
      }
    }
  };

  return React.createElement(Composition, {
    id: 'WebifyKineticReel',
    component: WebifyKineticReel,
    durationInFrames: 480, // 16.0s at 30fps
    fps: 30,
    width: 1080,
    height: 1920,
    defaultProps: {
      scriptData: defaultScriptData
    }
  });
}

module.exports = { RemotionRoot, WebifyKineticReel };
