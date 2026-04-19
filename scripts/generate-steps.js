#!/usr/bin/env node
const fs = require('fs'); const path = require('path');
const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error('GEMINI_API_KEY required'); process.exit(1); }
const MODELS = ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image'];
const steps = [
  { file: 'step-1.png', prompt: 'A cinematic, abstract illustration for a step titled "Get Your API Key". Style: dark navy background (#0a0a1a) with glowing cyan (#00d4ff) accents, minimal geometric shapes suggesting a key or identity token materializing from particles. No text, no logos, no UI mockups. Square 800x800, flat modern 2026 style similar to Stripe/Linear developer tools.' },
  { file: 'step-2.png', prompt: 'A cinematic, abstract illustration for a step titled "Make a Request". Style: dark navy background (#0a0a1a) with glowing cyan (#00d4ff) accents, minimal arrows and geometric flow lines suggesting an HTTP request traveling from a client to a server. No text, no logos, no UI mockups. Square 800x800, flat modern 2026 style similar to Stripe/Linear developer tools.' },
  { file: 'step-3.png', prompt: 'A cinematic, abstract illustration for a step titled "Get Listings". Style: dark navy background (#0a0a1a) with glowing cyan (#00d4ff) accents, minimal stacked cards or data nodes suggesting sorted structured data arriving. No text, no logos, no UI mockups. Square 800x800, flat modern 2026 style similar to Stripe/Linear developer tools.' }
];
(async () => {
  for (const s of steps) {
    const out = path.join(__dirname, '..', 'src', 'public', s.file);
    if (fs.existsSync(out) && !process.argv.includes('--force')) { console.log('skip', s.file); continue; }
    let ok = false;
    for (const m of MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${KEY}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: s.prompt }] }], generationConfig: { responseModalities: ['IMAGE'] } })
        });
        if (!res.ok) throw new Error(`${m} ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const json = await res.json();
        const img = (json?.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
        if (!img) throw new Error(`${m} no image`);
        fs.writeFileSync(out, Buffer.from(img.inlineData.data, 'base64'));
        console.log(`✓ ${s.file} via ${m}`);
        ok = true; break;
      } catch (e) { console.warn('✗', e.message); }
    }
    if (!ok) { console.error('failed', s.file); process.exit(1); }
  }
})();
