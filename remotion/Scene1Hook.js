const React = require('react');
const { interpolate, spring, useCurrentFrame, useVideoConfig } = require('remotion');

function Scene1Hook({ tag, header, subtitle }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame,
    fps,
    config: { damping: 12, mass: 0.5 }
  });

  const opacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: 'clamp'
  });

  const subtitleSlide = interpolate(frame, [15, 35], [50, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
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
        padding: '60px',
        fontFamily: 'sans-serif',
        boxSizing: 'border-box'
      }
    },
    // Niche Pill Tag
    React.createElement(
      'div',
      {
        style: {
          backgroundColor: '#1e293b',
          border: '2px solid #38bdf8',
          borderRadius: '32px',
          padding: '12px 36px',
          color: '#38bdf8',
          fontSize: '28px',
          fontWeight: 'bold',
          marginBottom: '40px',
          opacity
        }
      },
      tag || 'TARGET NICHE: B2B LOCAL BUSINESS'
    ),
    // Headline Alert Card
    React.createElement(
      'div',
      {
        style: {
          width: '920px',
          backgroundColor: '#111827',
          border: '4px solid #ef4444',
          borderRadius: '24px',
          padding: '48px 40px',
          textAlign: 'center',
          transform: `scale(${scale})`,
          boxShadow: '0 20px 50px rgba(239, 68, 68, 0.3)'
        }
      },
      React.createElement(
        'div',
        {
          style: {
            display: 'inline-block',
            backgroundColor: '#ef4444',
            color: 'white',
            fontWeight: '900',
            fontSize: '22px',
            padding: '8px 20px',
            borderRadius: '12px',
            marginBottom: '24px'
          }
        },
        'LEAD ALERT'
      ),
      React.createElement(
        'h1',
        {
          style: {
            color: '#ffffff',
            fontSize: '52px',
            lineHeight: '1.2',
            margin: '0 0 24px 0',
            fontWeight: '900'
          }
        },
        header || 'STOP WASTING $10K/MO ON SHARED LEADS'
      ),
      React.createElement(
        'p',
        {
          style: {
            color: '#94a3b8',
            fontSize: '32px',
            margin: 0,
            transform: `translateY(${subtitleSlide}px)`,
            opacity
          }
        },
        subtitle || 'Exclusive direct mobile numbers delivered daily.'
      ),
      React.createElement('div', {
        style: {
          width: '80%',
          height: '4px',
          backgroundColor: '#38bdf8',
          margin: '36px auto 0 auto',
          borderRadius: '2px'
        }
      })
    )
  );
}

module.exports = Scene1Hook;
