/**
 * Bemisaal Wellness - Ayurvedic & Unani Health Outreach Consultant
 * Official Health Consultation Team: Bemisaal Wellness (Sharik Shah Blueprint)
 * Pure 100% Indian (+91) Health Outreach & Dignified Hinglish Consultation
 * 
 * In-Chat Direct Engagement: Zero external helpline numbers.
 * Every lead consults and books directly inside this WhatsApp chat.
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const BRAND_NAME = process.env.BRAND_NAME || 'Bemisaal Wellness';

const SYSTEM_PROMPT = `Aap Bemisaal Dawakhana ki Senior Unani Health Consultant team hain.
Aap bohot shaant, respectful, knowledgeable aur empathetic hain.

Halaat:
User ne online search par mardana kamzori, timing ki samasya, shighrapatan, naso ki kamzori ya herbal ilaj ke bare me poocha tha.
Aapka lakshya: Unki samasya ko bina kisi sharam ke samajhna, unhe bharosa dilana, aur hamare 100% natural Unani 2 Shahi Majoon + 30 Tablets + 1 Special Tila Oil 30-Day Sexual Wellness Course ke bare me samjhana.

Sharik Shah Official Treatment Blueprint:
1. 2 Shahi Majoon – virya ko gaadha karne aur timing increase karne ke liye.
2. 30 Tablet pack – daily stamina, vigor aur power boost ke liye.
3. 1 Special Tila Oil – naso ki taqat, hard erection aur blood circulation ke liye.
4. Target: Sirf mardon (gents) ke sexual wellness ke liye. Ladies ko entertain nahi karna.
5. 0% Steroids, 0% Chemicals. 100% Shuddh Ayurvedic & Unani Nuskha.
6. Payment Policy: Hum courier dispatch aur order booking ke liye ₹200 advance online lete hain aur baki remaining payment delivery ke waqt COD (Cash on Delivery) par parcel aane par deni hoti hai.
7. All India 100% discreet confidential plain packaging bina kisi label ke aati hai.
8. Consultation & Booking Rule: Kisi bhi doosre phone number ya helpline par call karne ko bilkul mat bolein! Patient se isi WhatsApp chat par seedhi baat karein, unki pareshani samjhein, unhe reassure karein, aur unka delivery address (Naam, Pincode, Address) mangkar order isi chat me confirm karein.

Expert Objection Handling Guidelines:
- Agar patient puche "₹200 advance kyun de? Pura COD karo":
  Samjhao ki: "Bhai, all India courier booking aur confidential dispatch verify karne ke liye company rule mutabiq sirf ₹200 advance booking lagta hai, baki pure paise aap parcel haath me lene ke baad hi delivery boy ko cash dete hain."
- Agar patient puche "Koi side effect toh nahi hai?":
  Samjhao ki: "Yeh 100% certified Ayurvedic aur Unani jari bootiyon se banta hai, zero chemicals aur zero steroids. Iska shareer par koi bhi side effect nahi hota."
- Agar patient puche "Kitne din me asar dikhega?":
  Samjhao ki: "Pehle 7-10 din me naso me takat aur energy me fark aana shuru ho jata hai, aur pura 30-day course lene par permanent result milta hai."
- Agar patient puche "Packaging kaisi hogi, ghar wale na dekh le":
  Samjhao ki: "Packing 100% discreet aur plain hoti hai. Bahar box par kisi tarah ka product name ya bimari ka zikr nahi hota, bilkul private rehta hai."
- Agar patient puche "Course ki price kitni hai?":
  Samjhao ki: "Complete 30-Day Course (2 Shahi Majoon + 30 Tablets + 1 Special Tila Oil) ka normal rate ₹2499 hai, lekin abhi direct consultation offer me sirf ₹1499 me All India home delivery ke sath mil raha hai. Sirf ₹200 advance booking lagti hai aur baki ₹1299 parcel milne par COD dena hota hai."
- Bhasha: Natural, respectful, simple Hinglish (jaise ek experienced Unani hakim WhatsApp par patient se baat karta hai).
- Kabhi bhi ashlil ya vulgar shabd mat use karna. Clean, dignified medical tone rakhna.`;

/**
 * Call Groq API
 */
async function callGroq(messages, temperature = 0.6) {
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: messages,
        temperature: temperature,
        max_tokens: 350
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content?.trim() || '';
    if (!content && data.choices?.[0]?.message?.reasoning) {
      content = data.choices[0].message.reasoning.trim();
    }
    return content;
  } catch (err) {
    console.error('❌ Groq API Failure:', err.message);
    return null;
  }
}

/**
 * Clean & Sanitize Lead Name
 * Eradicates bot placeholders ('Health Lead', 'Lead', 'Patient') so they NEVER leak into messages!
 */
function cleanLeadName(rawName) {
  if (!rawName) return '';
  let name = String(rawName).trim();
  const BANNED_PATTERNS = /\b(health|lead|patient|inquiry|doctor|clinic|ayurvedic|unani|hospital|care|desk|team|service|services|treatment|centre|dawakhana|dr|specialist|contact|admin|owner)\b/i;
  if (BANNED_PATTERNS.test(name)) return '';
  name = name.replace(/[^\w\s]/g, '').trim();
  if (name.length < 3 || name.length > 15) return '';
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

/**
 * High-Entropy Permutation Matrix for Bemisaal Dawakhana Outreach
 * Permutations: 6 Greetings * 6 Hooks * 4 Kits * 4 Terms * 6 CTAs * 4 Footers = 34,560 Combinations!
 * Guarantees zero identical signatures and pure in-chat conversion with zero helpline numbers.
 */
const MATRIX_GREETINGS = [
  'Welcome to Bemisaal Dawakhana 🙏',
  'Bemisaal Dawakhana me aapka swagat hai 🙏',
  'Namaste! Welcome to Bemisaal Dawakhana 🙏',
  'Aadab, Welcome to Bemisaal Dawakhana 🙏',
  'Namaste bhai, Bemisaal Dawakhana me swagat hai 🙏',
  'Welcome to Bemisaal Dawakhana Health Consultation 🙏'
];

const MATRIX_HOOKS = [
  (n) => n ? `${n} bhai, kya aap mardana kamzori, timing ya stamina ki samasya se pareshan hain?` : 'Kya aap mardana kamzori, timing ya stamina ki samasya se pareshan hain?',
  (n) => n ? `${n} ji, kya aap virya ki kami, shighrapatan ya naso ki kamzori ka pakka aur natural ilaj chahte hain?` : 'Kya aap virya ki kami, shighrapatan ya naso ki kamzori ka pakka aur natural ilaj dhoondh rahe hain?',
  (n) => n ? `${n} bhai, agar aap physical weakness ya timing ko lekar pareshan hain toh bilkul fikar mat kijiye.` : 'Agar aap private weakness, timing ya physical stamina ko lekar fikar-mand hain, toh ab pareshan hone ki zaroorat nahi hai.',
  (n) => n ? `${n} ji, kya aap bina kisi side effect ke apni mardana taqat aur timing ko naturally improve karna chahte hain?` : 'Kya aap bina kisi side effect ke apni mardana taqat aur timing ko naturally improve karna chahte hain?',
  (n) => n ? `${n} bhai, kya timing ki kami ya lingering weakness ki wajah se aapka confidence low ho raha hai?` : 'Kya timing ki kami ya lingering weakness ki wajah se aapka confidence low ho raha hai?',
  (n) => n ? `${n} ji, mardana taqat, lambi timing aur full stamina ke liye kya aap ek shuddh unani nuskha chahte hain?` : 'Mardana taqat, lambi timing aur full stamina ke liye kya aap ek certified shuddh unani nuskha chahte hain?'
];

const MATRIX_KITS = [
  `Bemisaal Dawakhana ki taraf se hum mardon (gents) ke sexual wellness ke liye 100% natural Unani 30-day course provide karte hain:\n✅ 2 Shahi Majoon – virya aur timing ke liye\n✅ 30 Tablets – stamina aur power boost\n✅ 1 Special Oil – naso ki taqat aur blood circulation ke liye`,
  `Hamara 100% Shuddh Unani 30-Day Sexual Wellness Course sirf mardon (gents) ke liye taiyar kiya gaya hai:\n• 2 Majoon (Timing & Virya retention)\n• 30 Tablets (Stamina & Power boost)\n• 1 Special Oil (Naso ki Taqat & Blood flow)`,
  `Gents Sexual Wellness ke liye hamara certified 30-Day Unani Course (2 Shahi Majoon + 30 Tablets + 1 Special Oil) safe aur permanent result deta hai virya, timing aur stamina me. Zero chemicals, zero steroids.`,
  `Hamara complete 30-Day Men's Wellness Course 100% Ayurvedic & Unani jari-bootiyon se bana hai:\n🌿 2 Shahi Majoon – Timing aur natural retention me behtareen\n🌿 30 Power Tablets – All-day vigor aur physical stamina\n🌿 1 Herbal Oil – Naso ki kamzori door karne aur blood flow ke liye`
];

const MATRIX_TERMS = [
  `📦 Order & Delivery: Hum booking ke liye ₹200 advance online lete hain aur baaki remaining payment COD (Cash on Delivery) par parcel aane par deni hoti hai. 100% confidential discreet packaging bina kisi label ke.`,
  `📦 Booking Policy: Sirf ₹200 advance online booking charge aur baaki remaining amount COD (Cash on Delivery) par parcel deliver hone par dena hota hai. 100% private plain packaging.`,
  `📦 Delivery & Terms: All India confidential packaging available hai. Order booking ke liye ₹200 advance online aur baaki amount parcel milne par Cash on Delivery. Parcel par kisi bimari ya product ka naam nahi hota.`,
  `📦 Safe Booking: Courier dispatch verify karne ke liye sirf ₹200 advance charge online lagta hai, aur baki remaining payment parcel haath me milne par COD dijiye. 100% confidential discreet packing.`
];

const MATRIX_CTAS = [
  `Free medical consultation ya order book karne ke liye aap yahan directly reply kar sakte hain.`,
  `Direct doctor consultation ya apna course order karne ke liye yahan reply karein.`,
  `Detailed jankari ya booking ke liye aap isi chat par directly reply karein.`,
  `Apni pareshani bina kisi jhijhak ke share karein ya course mangwane ke liye yahan reply karein.`,
  `Hamare Senior Unani Hakim se free salah ya course book karne ke liye yahan message karein.`,
  `Agar aapko koi bhi jankari chahiye ya order confirm karna hai toh bas yahan 'YES' likhkar reply karein.`
];

const MATRIX_FOOTERS = [
  `(Reply STOP to opt out)`,
  `(Agar aage message nahi chahiye toh STOP reply karein)`,
  `(Reply STOP to unsubscribe)`,
  `(Opt out karne ke liye STOP bhej dein)`
];

/**
 * Handcrafted Curated Templates (100% Helpline-Free)
 */
const BEMISAAL_TEMPLATES = [
  (name) => `Welcome to Bemisaal Dawakhana 🙏\n\nKya aap mardana kamzori, timing ya stamina ki samasya se pareshan hain?\n\nBemisaal Dawakhana ki taraf se hum mardon (gents) ke sexual wellness ke liye 100% natural Unani 30-day course provide karte hain:\n✅ 2 Shahi Majoon – virya aur timing ke liye\n✅ 30 Tablets – stamina aur power boost\n✅ 1 Special Oil – naso ki taqat aur blood circulation ke liye\n\n📦 Order & Delivery: Hum booking ke liye ₹200 advance online lete hain aur baaki remaining payment COD (Cash on Delivery) par parcel aane par deni hoti hai. 100% confidential discreet packaging.\n\nFree medical consultation ya order book karne ke liye aap yahan directly reply kar sakte hain.\n\n(Reply STOP to opt out)`,

  (name) => `Welcome to Bemisaal Dawakhana 🙏\n${name ? `Namaste ${name} bhai!` : 'Namaste bhai!'}\n\nKya aap timing, mardana kamzori ya naso ki kamzori se pareshan hain?\n\nHamara 100% Shuddh Unani 30-Day Sexual Wellness Course sirf mardon (gents) ke liye taiyar kiya gaya hai:\n• 2 Majoon (Timing & Virya)\n• 30 Tablets (Stamina & Power)\n• 1 Special Oil (Naso ki Taqat)\n\n📦 Booking: Sirf ₹200 advance online, baaki pura payment Cash on Delivery (COD) par parcel aane par. Plain discreet packaging.\n\nDirect doctor consultation ke liye yahan reply karein.\n\n(Reply STOP to opt out)`,

  () => `Welcome to Bemisaal Dawakhana 🙏\n\nGents Sexual Wellness ke liye hamara certified 30-Day Unani Course (2 Majoon + 30 Tablets + 1 Special Oil) safe aur permanent result deta hai virya, timing aur stamina me.\n\n📦 Booking Policy: ₹200 advance online booking charge aur baaki remaining amount COD (Cash on Delivery) par parcel deliver hone par dena hota hai. 100% private packaging.\n\nDetailed jankari ya booking ke liye aap isi chat par directly reply karein.\n\n(Reply STOP to opt out)`
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate Initial Outreach Message with High-Entropy Permutation Matrix
 */
async function generateOutreachMessage(leadOrName = '') {
  let rawName = '';
  if (typeof leadOrName === 'object' && leadOrName !== null) {
    rawName = leadOrName.name || '';
  } else {
    rawName = leadOrName || '';
  }

  const validName = cleanLeadName(rawName);

  // 70% dynamic permutation matrix, 30% curated classic template
  if (Math.random() < 0.70) {
    const greeting = pickRandom(MATRIX_GREETINGS);
    const hookFn = pickRandom(MATRIX_HOOKS);
    const hook = hookFn(validName);
    const kit = pickRandom(MATRIX_KITS);
    const terms = pickRandom(MATRIX_TERMS);
    const cta = pickRandom(MATRIX_CTAS);
    const footer = pickRandom(MATRIX_FOOTERS);

    return `${greeting}\n\n${hook}\n\n${kit}\n\n${terms}\n\n${cta}\n\n${footer}`;
  }

  const templateFn = pickRandom(BEMISAAL_TEMPLATES);
  return templateFn(validName);
}

/**
 * Handle incoming reply from a lead/patient (Sharik Shah Official In-Chat Response)
 */
async function handleIncomingMessage(senderName, incomingText, history = []) {
  const prompt = [
    { role: 'system', content: SYSTEM_PROMPT }
  ];

  if (Array.isArray(history)) {
    history.slice(-6).forEach(h => {
      prompt.push({ role: h.role, content: h.content });
    });
  }

  prompt.push({
    role: 'user',
    content: incomingText
  });

  const reply = await callGroq(prompt, 0.6);
  if (reply && reply.trim().length > 30) return reply.trim();

  // Sharik Shah exact official response (100% in-chat, zero external numbers)
  return `Welcome to Bemisaal Dawakhana 🙏\n\nNamaste, mujhe aapki pareshani samajh aa rahi hai. Aap bilkul nishchint rahiye — hamara 30-din ka Unani 2 Shahi Majoon + 30 Tablets + 1 Special Tila Oil Course 100% natural aur steroid-free herbal formula hai jo naso ki taqat, virya aur natural timing ko restore karta hai.\n\n✅ 2 Shahi Majoon – virya aur timing ke liye\n✅ 30 Tablets pack – stamina aur power boost\n✅ 1 Special Oil – naso ki takat aur blood circulation ke liye\n\n📦 Order & Payment: Sirf ₹200 advance dispatch charge lagta hai aur baaki remaining amount parcel milne par Cash on Delivery (COD) par dena hota hai. 100% plain discreet packaging.\n\nFree medical consultation ya apna order book karwane ke liye aap yahan directly reply karke apni samasya ya delivery address bhej sakte hain.`;
}

module.exports = {
  generateOutreachMessage,
  handleIncomingMessage,
  SYSTEM_PROMPT,
  cleanLeadName
};
