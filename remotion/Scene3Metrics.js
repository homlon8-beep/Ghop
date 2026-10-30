const React = require('react');
const { interpolate, spring, useCurrentFrame, useVideoConfig } = require('remotion');

function Scene3Metrics({ header, stat1, stat2, stat3 }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const card1Spring = spring({
    frame,
    fps,
    config: { damping: 12 }
  });

  const card2Spring = spring({
    frame: Math.max(0, frame - 15),
    fps,
    config: { damping: 12 }
  });

  const card3Spring = spring({
    frame: Math.max(0, frame - 30),
    fps,
    config: { damping: 12 }
  });

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
    // Section Title
    React.createElement(
      'h2',
      {
        style: {
          color: '#ffffff',
          fontSize: '46px',
          fontWeight: '900',
          marginBottom: '40px',
          textAlign: 'center'
        }
      },
      header || 'AUTONOMOUS REVENUE HARVEST'
    ),
    // Stat Card 1
    React.createElement(
      'div',
      {
        style: {
          width: '900px',
          backgroundColor: '#111827',
          border: '3px solid #10b981',
          borderRadius: '20px',
          padding: '32px 40px',
          marginBottom: '24px',
          transform: `scale(${card1Spring})`,
          boxShadow: '0 10px 30px rgba(16, 185, 129, 0.2)'
        }
      },
      React.createElement(
        'div',
        { style: { color: '#10b981', fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' } },
        'LEAD GENERATION FIREHOSE'
      ),
      React.createElement(
        'div',
        { style: { color: 'white', fontSize: '48px', fontWeight: '900' } },
        stat1 || '300+ Verified Leads'
      )
    ),
    // Stat Card 2
    React.createElement(
      'div',
      {
        style: {
          width: '900px',
          backgroundColor: '#111827',
          border: '3px solid #38bdf8',
          borderRadius: '20px',
          padding: '32px 40px',
          marginBottom: '24px',
          transform: `scale(${card2Spring})`,
          boxShadow: '0 10px 30px rgba(56, 189, 248, 0.2)'
        }
      },
      React.createElement(
        'div',
        { style: { color: '#38bdf8', fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' } },
        'AUTOMATED WEBSITE UPSELL'
      ),
      React.createElement(
        'div',
        { style: { color: 'white', fontSize: '48px', fontWeight: '900' } },
        stat2 || '$599 Site Closed'
      )
    ),
    // Stat Card 3
    React.createElement(
      'div',
      {
        style: {
          width: '900px',
          backgroundColor: '#1e293b',
          border: '2px solid #64748b',
          borderRadius: '20px',
          padding: '24px 40px',
          textAlign: 'center',
          transform: `scale(${card3Spring})`
        }
      },
      React.createElement(
        'div',
        { style: { color: '#e2e8f0', fontSize: '32px', fontWeight: 'bold' } },
        stat3 || 'Zero Cold Calling • 100% Autonomous Bot'
      )
    )
  );
}

module.exports = Scene3Metrics;
