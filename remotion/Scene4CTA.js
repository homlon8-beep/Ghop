const React = require('react');
const { interpolate, spring, useCurrentFrame, useVideoConfig } = require('remotion');

function Scene4CTA({ brand, cta, urgency }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const brandScale = spring({
    frame,
    fps,
    config: { damping: 10 }
  });

  const cardScale = spring({
    frame: Math.max(0, frame - 10),
    fps,
    config: { damping: 12 }
  });

  const pulse = Math.sin(frame / 5) * 0.05 + 1;

  return React.createElement(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        backgroundColor: '#0b0f19',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '50px',
        fontFamily: 'sans-serif',
        boxSizing: 'border-box'
      }
    },
    // Brand Lockup Pill
    React.createElement(
      'div',
      {
        style: {
          backgroundColor: '#10b981',
          color: 'white',
          borderRadius: '24px',
          padding: '16px 48px',
          marginBottom: '20px',
          transform: `scale(${brandScale})`,
          boxShadow: '0 10px 40px rgba(16, 185, 129, 0.4)'
        }
      },
      React.createElement(
        'h1',
        { style: { fontSize: '64px', margin: 0, fontWeight: '900', letterSpacing: '1px' } },
        brand || 'webify.io'
      )
    ),
    React.createElement(
      'p',
      { style: { color: '#94a3b8', fontSize: '36px', margin: '0 0 50px 0', fontWeight: 'bold' } },
      'Autonomous B2B Lead Machine'
    ),
    // Call to Action Card
    React.createElement(
      'div',
      {
        style: {
          width: '920px',
          backgroundColor: '#111827',
          border: '4px solid #38bdf8',
          borderRadius: '28px',
          padding: '48px 40px',
          textAlign: 'center',
          transform: `scale(${cardScale})`,
          boxShadow: '0 20px 60px rgba(56, 189, 248, 0.3)'
        }
      },
      React.createElement(
        'div',
        {
          style: {
            color: '#38bdf8',
            fontSize: '42px',
            fontWeight: '900',
            marginBottom: '20px'
          }
        },
        'WANT THIS SYSTEM?'
      ),
      // CTA Action Button
      React.createElement(
        'div',
        {
          style: {
            backgroundColor: '#0284c7',
            color: 'white',
            fontSize: '46px',
            fontWeight: '900',
            padding: '24px 32px',
            borderRadius: '20px',
            marginBottom: '24px',
            transform: `scale(${pulse})`,
            boxShadow: '0 8px 30px rgba(2, 132, 199, 0.5)'
          }
        },
        cta || "Comment 'LEADS' to steal this setup"
      ),
      React.createElement(
        'div',
        {
          style: {
            color: '#10b981',
            fontSize: '28px',
            fontWeight: 'bold'
          }
        },
        `⚡ ${urgency || 'First 20 accounts get free lead scrape'}`
      )
    )
  );
}

module.exports = Scene4CTA;
