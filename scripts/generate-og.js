#!/usr/bin/env node
/**
 * Generate src/public/og.png (1200x630) using Gemini Image (Nano Banana / Pro).
 * Usage: GEMINI_API_KEY=... node scripts/generate-og.js [--force]
 *
 * Idempotent: exits early if og.png exists unless --force is passed.
 */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'src', 'public', 'og.png');
const FORCE = process.argv.includes('--force');

if (fs.existsSync(OUT) && !FORCE) {
  console.log('og.png already exists — pass --force to regenerate.');
  process.exit(0);
}

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) {
  console.error('GEMINI_API_KEY env var is required.');
  process.exit(1);
}

const PROMPT = [
  'A professional, modern Open Graph social share image, 1200x630 pixels, 16:8.4 aspect ratio.',
  'Deep navy gradient background transitioning from #0a0a1a in the top-left to #0f1a2e in the bottom-right.',
  'A subtle cyan (#00d4ff) lightning-bolt motif positioned on the left third, suggesting speed and electricity without dominating.',
  'Bold white sans-serif headline on the right two-thirds: "Rental market intelligence. One API call."',
  'Smaller cyan text below the headline: "RentVolt by Groundwork Labs"',
  'Minimal, confident, in the visual style of modern API developer tools like Stripe, Resend, and Supabase.',
  'Clean composition with generous negative space. No UI mockups, no screenshots, no charts.',
  'No emojis, no watermarks, no photography — just elegant typography and abstract brand elements on the gradient.',
  'The overall feel: trustworthy, technical, 2026-modern.'
].join(' ');

const MODELS_TO_TRY = [
  'gemini-3-pro-image-preview',
  'gemini-2.5-flash-image',
  'imagen-3.0-generate-001'
];

async function tryGenerate(model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`;
  const body = {
    contents: [{ parts: [{ text: PROMPT }] }],
    generationConfig: { responseModalities: ['IMAGE'] }
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${model} → HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  const parts = json?.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find((p) => p.inlineData?.data);
  if (!imgPart) {
    throw new Error(`${model} returned no inline image data. Response: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return Buffer.from(imgPart.inlineData.data, 'base64');
}

(async () => {
  let lastErr;
  for (const model of MODELS_TO_TRY) {
    try {
      console.log(`→ Trying ${model}…`);
      const png = await tryGenerate(model);
      fs.writeFileSync(OUT, png);
      console.log(`✓ Wrote ${OUT} (${png.length} bytes) via ${model}`);
      return;
    } catch (err) {
      console.warn(`✗ ${err.message}`);
      lastErr = err;
    }
  }
  console.error('\nAll models failed. Last error:', lastErr?.message);
  process.exit(1);
})();
