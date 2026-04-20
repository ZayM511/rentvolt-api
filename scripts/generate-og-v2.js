#!/usr/bin/env node
const fs = require('fs'); const path = require('path');
const OUT = path.join(__dirname, '..', 'src', 'public', 'og.png');
const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error('GEMINI_API_KEY required'); process.exit(1); }
const PROMPT = [
  'A cinematic Open Graph social share image, 1200x630 pixels, 16:8.4 aspect ratio.',
  'Deep navy gradient background (#0a0a1a to #0f1a2e).',
  'On the left third: a glowing cyan (#00d4ff) abstract lightning-bolt/wave hybrid mark — geometric, minimal, confident, with a soft electric glow — identical in style to the RentVolt brand logo.',
  'On the right two-thirds: bold white sans-serif headline "Rental market intelligence." and below it, in italic Instrument Serif cyan: "for the internet."',
  'Below the headline, smaller cyan text: "RentVolt · by Groundwork Labs".',
  'Subtle topographic contour lines or grid texture in the darker areas for depth.',
  'Modern 2026 developer-API-tool aesthetic (like Stripe, Linear, Resend, Vercel).',
  'Clean composition with generous negative space. No UI mockups, no screenshots, no photos, no emoji, no extra text.'
].join(' ');
const MODELS = ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image'];
async function tryOne(m) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT }] }], generationConfig: { responseModalities: ['IMAGE'] } })
  });
  if (!res.ok) throw new Error(`${m} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const img = (j?.candidates?.[0]?.content?.parts || []).find(p => p.inlineData?.data);
  if (!img) throw new Error(`${m} no image`);
  return Buffer.from(img.inlineData.data, 'base64');
}
(async () => {
  for (const m of MODELS) {
    try { console.log('→', m); const png = await tryOne(m); fs.writeFileSync(OUT, png); console.log(`✓ ${OUT} (${png.length}) via ${m}`); return; }
    catch (e) { console.warn('✗', e.message); }
  }
  process.exit(1);
})();
