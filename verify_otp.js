const fs = require('fs');
const path = require('path');
const config = require('./config');

async function verifyOtp(code) {
  if (!code) {
    console.error('Error: No OTP code provided. Usage: node verify_otp.js <code>');
    process.exit(1);
  }

  const pendingFile = path.join(__dirname, 'pending_2fa.json');
  if (!fs.existsSync(pendingFile)) {
    console.error('Error: pending_2fa.json not found. Trigger login first.');
    process.exit(1);
  }

  const pendingData = JSON.parse(fs.readFileSync(pendingFile, 'utf8'));
  const { cookieMap, loginResponse } = pendingData;
  const twoFactorInfo = loginResponse.two_factor_info;
  const identifier = twoFactorInfo.two_factor_identifier;
  const csrf = cookieMap['csrftoken'] || '';
  const cookieHeader = Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join('; ');

  const cleanCode = code.trim().replace(/\s+/g, '');
  console.log(`Submitting 2FA Code [${cleanCode}] for @${twoFactorInfo.username} to Meta...`);

  const body = new URLSearchParams({
    username: twoFactorInfo.username,
    verificationCode: cleanCode,
    identifier: identifier,
    trust_this_device: '1',
    queryParams: '{}'
  }).toString();

  const res = await fetch('https://www.instagram.com/api/v1/web/accounts/login/ajax/two_factor/', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-csrftoken': csrf,
      'x-requested-with': 'XMLHttpRequest',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'referer': 'https://www.instagram.com/accounts/login/two_factor',
      'cookie': cookieHeader
    },
    body
  });

  const resCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
  resCookies.forEach(c => {
    if (!c) return;
    const parts = c.split(';')[0].split('=');
    if (parts.length >= 2) cookieMap[parts[0].trim()] = parts.slice(1).join('=');
  });

  const data = await res.json();
  console.log('2FA VERIFY RESPONSE:', JSON.stringify(data, null, 2));

  if (data.authenticated || data.status === 'ok' || cookieMap['sessionid']) {
    console.log('🎉 SUCCESS! Authenticated session established!');
    console.log('Session ID:', cookieMap['sessionid'] ? 'Present (valid)' : 'Missing');

    // Save persistent session
    const sessionFile = config.INSTAGRAM.SESSION_FILE;
    const finalSession = {
      authenticated: true,
      username: twoFactorInfo.username,
      userId: twoFactorInfo.pk,
      sessionId: cookieMap['sessionid'],
      cookieMap,
      fullCookieString: Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join('; '),
      authenticatedAt: new Date().toISOString()
    };

    fs.writeFileSync(sessionFile, JSON.stringify(finalSession, null, 2));
    console.log(`✅ Session saved to ${sessionFile}`);

    // Update ig_config.json as well
    const igConfigFile = config.INSTAGRAM.CONFIG_FILE;
    let igConfig = {};
    if (fs.existsSync(igConfigFile)) {
      try { igConfig = JSON.parse(fs.readFileSync(igConfigFile, 'utf8')); } catch(e){}
    }
    igConfig.username = twoFactorInfo.username;
    igConfig.sessionId = cookieMap['sessionid'];
    igConfig.simulationMode = false;
    fs.writeFileSync(igConfigFile, JSON.stringify(igConfig, null, 2));
    console.log(`✅ Updated ig_config.json with permanent session`);

    // Clean up pending file
    fs.unlinkSync(pendingFile);
    return { success: true, username: twoFactorInfo.username, userId: twoFactorInfo.pk };
  } else {
    console.error('❌ Verification failed:', data.message || data);
    return { success: false, error: data.message || 'Verification failed' };
  }
}

if (require.main === module) {
  const code = process.argv[2];
  verifyOtp(code).then(r => console.log('Final Result:', r)).catch(e => console.error(e));
}

module.exports = { verifyOtp };
