#!/usr/bin/env node
/**
 * Generate a brand mark PNG (logo.png) via Gemini 3 Pro Image.
 * Usage: GEMINI_API_KEY=... node scripts/generate-logo.js [--force]
 */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'src', 'public', 'logo.png');
const FORCE = process.argv.includes('--force');
if (fs.existsSync(OUT) && !FORCE) { console.log('logo.png exists — --force to regenerate'); process.exit(0); }
const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error('GEMINI_API_KEY required'); process.exit(1); }

const PROMPT = [
  'A clean, minimal square brand mark for a developer API product called "RentVolt".',
  'The mark: a single abstract lightning-bolt / wave hybrid in solid cyan (#00d4ff).',
  'Style: geometric, confident, 2026-modern — like the logos of Stripe, Linear, Resend, or Vercel, but with a hint of electrical motion.',
  'Transparent / dark background — assume deep navy (#0a0a1a) surroundings.',
  'No text, no letters, no wordmark. The mark alone.',
  'Composition: centered, with ~20% padding. Output 512x512.',
  'Must be instantly recognizable at 32x32 favicon size.'
].join(' ');

const MODELS = ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image'];

async function tryOne(model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT }] }],
      generationConfig: { responseModalities: ['IMAGE'] }
    })
  });
  if (!res.ok) throw new Error(`${model} ${res.status}: ${(await res.text()).slice(0, 250)}`);
  const json = await res.json();
  const img = (json?.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
  if (!img) throw new Error(`${model} no image returned`);
  return Buffer.from(img.inlineData.data, 'base64');
}

(async () => {
  for (const m of MODELS) {
    try {
      console.log(`→ ${m}`);
      const png = await tryOne(m);
      fs.writeFileSync(OUT, png);
      console.log(`✓ ${OUT} (${png.length} bytes) via ${m}`);
      return;
    } catch (e) { console.warn(`✗ ${e.message}`); }
  }
  process.exit(1);
})();
