#!/usr/bin/env node
/**
 * Generate src/public/hero-bg.png via Gemini 3 Pro Image (Nano Banana Pro).
 * Usage: GEMINI_API_KEY=... node scripts/generate-hero.js [--force]
 */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'src', 'public', 'hero-bg.png');
const FORCE = process.argv.includes('--force');

if (fs.existsSync(OUT) && !FORCE) {
  console.log('hero-bg.png already exists — pass --force to regenerate.');
  process.exit(0);
}
const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error('GEMINI_API_KEY required'); process.exit(1); }

const PROMPT = [
  'An abstract, cinematic hero-section background image for a modern developer API tool website.',
  'Aspect ratio 16:9, 1920x1080 pixels.',
  'Deep navy to near-black gradient base (#0a0a1a dominant).',
  'Layered soft cyan (#00d4ff) light orbs floating in the middle distance, like distant stars or data nodes.',
  'Subtle electric-blue light rays emanating diagonally from the upper-left, no literal lightning bolts.',
  'A faint grid pattern or topographic contour lines subtly visible, evoking maps and data without being literal.',
  'Extremely minimal — mostly dark negative space, so bold white headline text can layer on top and remain readable.',
  'Style: Stripe landing page, Linear.app, Vercel, 2026 modern. Cinematic, atmospheric, technical.',
  'No text, no logos, no UI elements, no buildings, no people.'
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
  if (!res.ok) throw new Error(`${model} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  const parts = json?.candidates?.[0]?.content?.parts || [];
  const img = parts.find((p) => p.inlineData?.data);
  if (!img) throw new Error(`${model} returned no image`);
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
