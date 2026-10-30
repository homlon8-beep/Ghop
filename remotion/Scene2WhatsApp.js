const React = require('react');
const { interpolate, spring, useCurrentFrame, useVideoConfig } = require('remotion');

function Scene2WhatsApp({ header, msg1, reply, statusBadge }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const msg1Slide = interpolate(frame, [5, 20], [100, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
  const msg1Opacity = interpolate(frame, [5, 20], [0, 1], {
    extrapolateRight: 'clamp'
  });

  const replySlide = interpolate(frame, [35, 55], [100, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
  const replyOpacity = interpolate(frame, [35, 55], [0, 1], {
    extrapolateRight: 'clamp'
  });

  const badgeScale = spring({
    frame: Math.max(0, frame - 65),
    fps,
    config: { damping: 10 }
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
    // Device Chat Card
    React.createElement(
      'div',
      {
        style: {
          width: '940px',
          backgroundColor: '#0b141a',
          border: '3px solid #10b981',
          borderRadius: '28px',
          overflow: 'hidden',
          boxShadow: '0 25px 60px rgba(16, 185, 129, 0.25)'
        }
      },
      // Header
      React.createElement(
        'div',
        {
          style: {
            backgroundColor: '#1f2c34',
            padding: '24px 32px',
            color: '#25d366',
            fontSize: '32px',
            fontWeight: 'bold',
            borderBottom: '1px solid #2a3942'
          }
        },
        `📱 ${header || 'LIVE 2-STEP WHATSAPP CLOSING'}`
      ),
      // Chat Body
      React.createElement(
        'div',
        { style: { padding: '40px 32px' } },
        // Message 1 (Outbound Webify)
        React.createElement(
          'div',
          {
            style: {
              backgroundColor: '#005c4b',
              color: 'white',
              borderRadius: '20px 20px 4px 20px',
              padding: '24px 28px',
              marginBottom: '36px',
              transform: `translateY(${msg1Slide}px)`,
              opacity: msg1Opacity
            }
          },
          React.createElement(
            'div',
            { style: { color: '#34d399', fontSize: '22px', fontWeight: 'bold', marginBottom: '8px' } },
            'Webify Autonomous Outreach (Step 1)'
          ),
          React.createElement(
            'div',
            { style: { fontSize: '28px', lineHeight: '1.4' } },
            msg1 || 'Hey, taking on new projects this week?'
          )
        ),
        // Message 2 (Contractor Inbound Reply)
        React.createElement(
          'div',
          {
            style: {
              backgroundColor: '#202c33',
              color: 'white',
              borderRadius: '20px 20px 20px 4px',
              padding: '24px 28px',
              marginBottom: '36px',
              transform: `translateY(${replySlide}px)`,
              opacity: replyOpacity
            }
          },
          React.createElement(
            'div',
            { style: { color: '#38bdf8', fontSize: '22px', fontWeight: 'bold', marginBottom: '8px' } },
            'Verified Local Contractor (Step 2)'
          ),
          React.createElement(
            'div',
            { style: { fontSize: '28px', lineHeight: '1.4' } },
            reply || 'Yes we have 2 crews available. What project?'
          )
        ),
        // Verification Badge
        React.createElement(
          'div',
          {
            style: {
              backgroundColor: 'rgba(16, 185, 129, 0.2)',
              border: '2px solid #10b981',
              borderRadius: '16px',
              padding: '20px',
              textAlign: 'center',
              color: '#34d399',
              fontSize: '26px',
              fontWeight: 'bold',
              transform: `scale(${badgeScale})`
            }
          },
          `🛡️ ${statusBadge || 'ORGANIC FIRST TOUCH • ZERO COLD CALLS'}`
        )
      )
    )
  );
}

module.exports = Scene2WhatsApp;
