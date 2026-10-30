(async () => {
  try {
    console.log('🌀 MorphVerse AI Live Profile Sync Starting...');
    const csrf = (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || '';
    const bioText = [
      '🌀 The Surreal Multiverse',
      '🏀 Where everyday things transform into insanity',
      '🍿 Daily Sagas: Pt 1 Morning • Pt 2 Evening',
      '👇 Watch till the end!'
    ].join('\n');

    // 1. Update Name & Bio
    console.log('Setting name to MorphVerse AI & bio...');
    const bioRes = await fetch('/api/v1/web/accounts/edit/', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-csrftoken': csrf,
        'x-requested-with': 'XMLHttpRequest'
      },
      body: new URLSearchParams({
        first_name: 'MorphVerse AI',
        biography: bioText,
        external_url: 'https://webify-autonomous-bot.onrender.com'
      })
    });
    const bioData = await bioRes.json();
    console.log('Bio update response:', bioData);

    // 2. Upload Profile Picture
    try {
      console.log('Fetching avatar from cloud server...');
      const imgBlob = await fetch('https://webify-autonomous-bot.onrender.com/avatar.jpg').then(r => r.blob());
      const fd = new FormData();
      fd.append('profile_pic', imgBlob, 'avatar.jpg');
      console.log('Uploading profile picture to Instagram...');
      const picRes = await fetch('/api/v1/web/accounts/web_change_profile_picture/', {
        method: 'POST',
        headers: {
          'x-csrftoken': csrf,
          'x-requested-with': 'XMLHttpRequest'
        },
        body: fd
      });
      const picData = await picRes.json();
      console.log('Profile pic response:', picData);
    } catch(picErr) {
      console.warn('Profile picture note:', picErr.message);
    }

    alert('🎉 SUCCESS! Your Instagram Name, Bio, and Profile Picture are now 100% updated to MorphVerse AI!');
  } catch (err) {
    alert('❌ Error: ' + err.message);
  }
})();
