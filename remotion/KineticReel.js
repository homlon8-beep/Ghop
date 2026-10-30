const React = require('react');
const { Sequence } = require('remotion');
const Scene1Hook = require('./Scene1Hook');
const Scene2WhatsApp = require('./Scene2WhatsApp');
const Scene3Metrics = require('./Scene3Metrics');
const Scene4CTA = require('./Scene4CTA');

function WebifyKineticReel({ scriptData }) {
  const data = scriptData || {};
  const s1 = data.kineticText?.scene1 || {};
  const s2 = data.kineticText?.scene2 || {};
  const s3 = data.kineticText?.scene3 || {};
  const s4 = data.kineticText?.scene4 || {};

  return React.createElement(
    'div',
    {
      style: {
        width: 1080,
        height: 1920,
        backgroundColor: '#0b0f19',
        overflow: 'hidden',
        position: 'relative'
      }
    },
    // Scene 1: 0 - 4s (Frames 0 to 120)
    React.createElement(
      Sequence,
      { from: 0, durationInFrames: 120 },
      React.createElement(Scene1Hook, {
        tag: s1.tag,
        header: s1.header,
        subtitle: s1.subtitle
      })
    ),
    // Scene 2: 4 - 8s (Frames 120 to 240)
    React.createElement(
      Sequence,
      { from: 120, durationInFrames: 120 },
      React.createElement(Scene2WhatsApp, {
        header: s2.header,
        msg1: s2.msg1,
        reply: s2.reply,
        statusBadge: s2.statusBadge
      })
    ),
    // Scene 3: 8 - 12s (Frames 240 to 360)
    React.createElement(
      Sequence,
      { from: 240, durationInFrames: 120 },
      React.createElement(Scene3Metrics, {
        header: s3.header,
        stat1: s3.stat1,
        stat2: s3.stat2,
        stat3: s3.stat3
      })
    ),
    // Scene 4: 12 - 16s (Frames 360 to 480)
    React.createElement(
      Sequence,
      { from: 360, durationInFrames: 120 },
      React.createElement(Scene4CTA, {
        brand: s4.brand,
        cta: s4.cta,
        urgency: s4.urgency
      })
    )
  );
}

module.exports = WebifyKineticReel;
