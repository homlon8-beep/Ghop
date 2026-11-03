/**
 * Bemisaal Wellness - Ayurvedic & Unani Health Outreach Consultant
 * Official Health Consultation Team: Bemisaal Wellness (Sharik Shah Blueprint)
 * Helpline: 9990394794
 * Pure 100% Indian (+91) Health Outreach & Dignified Hinglish Consultation
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const BRAND_NAME = process.env.BRAND_NAME || 'Bemisaal Wellness';
const HELPLINE = process.env.HELPLINE_NUMBER || '9990394794';

const SYSTEM_PROMPT = `Aap Bemisaal Dawakhana ki Senior Unani Health Consultant team hain.
Aap bohot shaant, respectful, knowledgeable aur empathetic hain.

Halaat:
User ne online search par mardana kamzori, timing ki samasya, shighrapatan, naso ki kamzori ya herbal ilaj ke bare me poocha tha.
Aapka lakshya: Unki samasya ko bina kisi sharam ke samajhna, unhe bharosa dilana, aur hamare 100% natural Unani 2 Shahi Majoon + 30 Tablets + 1 Special Tila Oil 30-Day Sexual Wellness Course ke bare me samjhana.

Sharik Shah Official Treatment Blueprint:
1. 2 Shahi Majoon – virya aur timing ke liye.
2. 30 Tablet pack – stamina aur power boost.
3. 1 Special Tila Oil – naso ki takat aur blood circulation ke liye.
4. Target: Sirf mardon (gents) ke sexual wellness ke liye. Ladies ko entertain nahi karna.
5. 0% Steroids, 0% Chemicals. 100% Shuddh Unani Nuskha.
6. Payment Policy: Hum order booking ke liye ₹200 advance online lete hain aur baki remaining payment delivery ke waqt COD (Cash on Delivery) par deni hoti hai.
7. All India 100% discreet confidential packaging.
8. Helpline: ${HELPLINE}

Expert Objection Handling Guidelines:
- Agar patient puche "₹200 advance kyun de? Pura COD karo":
  Samjhao ki: "Bhai, all India courier booking aur confidential dispatch verify karne ke liye company rule mutabiq ₹200 booking charge lagta hai, baki pure paise aap parcel haath me lene ke baad hi cash dete hain."
- Agar patient puche "Koi side effect toh nahi hai?":
  Samjhao ki: "Yeh 100% certified Ayurvedic aur Unani jari bootiyon se banta hai, zero chemicals aur zero steroids. Koi bhi side effect nahi hota."
- Agar patient puche "Kitne din me asar dikhega?":
  Samjhao ki: "Pehle 7-10 din me naso me takat aur energy me fark aana shuru ho jata hai, aur pura 30-day course lene par permanent result milta hai."
- Agar patient puche "Packaging kaisi hogi, ghar wale na dekh le":
  Samjhao ki: "Packing 100% discreet aur plain hoti hai. Bahar box par kisi tarah ka product name ya bimari ka zikr nahi hota, bilkul private rehta hai."
- Bhasha: Natural, respectful, simple Hinglish (jaise WhatsApp par ek doctor patient se baat karta hai).
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
 * Sharik Shah Exact Human Outreach Templates (100% Authentic Bemisaal Dawakhana Copy)
 * Specification:
 * - Opening: Welcome to Bemisaal Dawakhana
 * - Kit: 2 Majoon + 30 Tablets + 1 Special Oil (For Sexual Wellness)
 * - Audience: Sirf Gents (Mardon ke liye)
 * - Terms: ₹200 advance booking + baki COD on delivery
 * - Helpline: 9990394794
 */
const BEMISAAL_TEMPLATES = [
  // 1. Sharik Shah Core Blueprint (Direct, high-converting)
  (name) => `Welcome to Bemisaal Dawakhana 🙏\n\nKya aap mardana kamzori, timing ya stamina ki samasya se pareshan hain?\n\nBemisaal Dawakhana ki taraf se hum mardon (gents) ke sexual wellness ke liye 100% natural Unani 30-day course provide karte hain:\n✅ 2 Shahi Majoon – virya aur timing ke liye\n✅ 30 Tablets – stamina aur power boost\n✅ 1 Special Oil – naso ki taqat aur blood circulation ke liye\n\n📦 Order & Delivery: Hum booking ke liye ₹200 advance online lete hain aur baaki remaining payment COD (Cash on Delivery) par parcel aane par deni hoti hai. 100% confidential discreet packaging.\n\nFree medical consultation ya order ke liye humein call ya WhatsApp karein: ${HELPLINE}\n\n(Reply STOP to opt out)`,

  // 2. Personal Greeting Variation
  (name) => `Welcome to Bemisaal Dawakhana 🙏\n${name ? `Namaste ${name} bhai!` : 'Namaste bhai!'}\n\nKya aap timing, mardana kamzori ya naso ki kamzori se pareshan hain?\n\nHamara 100% Shuddh Unani 30-Day Sexual Wellness Course sirf mardon (gents) ke liye taiyar kiya gaya hai:\n• 2 Majoon (Timing & Virya)\n• 30 Tablets (Stamina & Power)\n• 1 Special Oil (Naso ki Taqat)\n\n📦 Booking: Sirf ₹200 advance online, baaki pura payment Cash on Delivery (COD) par parcel aane par. Plain discreet packaging.\n\nDirect doctor consultation ke liye call ya WhatsApp karein: ${HELPLINE}\n\n(Reply STOP to opt out)`,

  // 3. Quick Consultation Variation
  () => `Welcome to Bemisaal Dawakhana 🙏\n\nGents Sexual Wellness ke liye hamara certified 30-Day Unani Course (2 Majoon + 30 Tablets + 1 Special Oil) safe aur permanent result deta hai virya, timing aur stamina me.\n\n📦 Booking Policy: ₹200 advance online booking charge aur baaki remaining amount COD (Cash on Delivery) par parcel deliver hone par dena hota hai. 100% private packaging.\n\nDetailed jankari ya booking ke liye direct call/WhatsApp karein: ${HELPLINE}\n\n(Reply STOP to opt out)`
];

/**
 * Generate Initial Outreach Message
 */
async function generateOutreachMessage(leadOrName = '') {
  let rawName = '';
  if (typeof leadOrName === 'object' && leadOrName !== null) {
    rawName = leadOrName.name || '';
  } else {
    rawName = leadOrName || '';
  }

  const validName = cleanLeadName(rawName);
  const templateFn = BEMISAAL_TEMPLATES[Math.floor(Math.random() * BEMISAAL_TEMPLATES.length)];
  return templateFn(validName);
}

/**
 * Handle incoming reply from a lead/patient (Sharik Shah Official Response)
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

  // Sharik Shah exact official response
  return `Welcome to Bemisaal Dawakhana 🙏\n\nNamaste, mujhe aapki pareshani samajh aa rahi hai aur aapko behtar health dene ke liye humara 30-din ka Unani 2 Shahi Majoon + 30 Tablets + 1 Special Tila Oil Sexual Wellness Course bilkul natural, steroid-free solution hai.\n\n✅ 2 Shahi Majoon – virya aur timing ke liye\n✅ 30 Tablets pack – stamina aur power boost\n✅ 1 Special Oil – naso ki takat aur blood circulation ke liye\n\n📦 Order & Payment: Hum delivery booking ke liye ₹200 advance online lete hain aur baki remaining payment parcel milne par Cash on Delivery (COD) par dena hota hai. All India discreet packaging.\n\nDetailed guidance ke liye aap humari medical team se call ya WhatsApp kar sakte hain: ${HELPLINE}\n\n💡 Note: Aap yeh helpline number save kar sakte hain taaki future guidance aur order updates ke liye direct contact bana rahe.`;
}

module.exports = {
  generateOutreachMessage,
  handleIncomingMessage,
  SYSTEM_PROMPT,
  HELPLINE
};
