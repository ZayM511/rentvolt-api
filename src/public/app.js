// Client-side glue for pricing buttons, free-key generation, demo clipboard, etc.
// External file so CSP can block inline handlers while we keep rich UX.

(function () {
  // ─── Toast ──────────────────────────────────────────
  function showToast(msg, tone) {
    const existing = document.querySelector('.toast-msg');
    if (existing) existing.remove();
    const t = document.createElement('div');
    t.className = 'toast-msg' + (tone ? ' toast-' + tone : '');
    t.textContent = msg;
    t.setAttribute('role', 'alert');
    t.setAttribute('aria-live', tone === 'error' ? 'assertive' : 'polite');
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('visible'));
    setTimeout(() => { t.classList.remove('visible'); setTimeout(() => t.remove(), 300); }, 4000);
  }
  window.showToast = showToast;

  function showErr(msg) {
    const err = document.getElementById('err');
    if (err) { err.textContent = msg; err.style.display = 'block'; }
    else { showToast(msg); }
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function clearChildren(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function copyToClipboard(str) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(str).then(() => showToast('API key copied!'));
    } else {
      const ta = document.createElement('textarea');
      ta.value = str;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); showToast('API key copied!'); }
      finally { document.body.removeChild(ta); }
    }
  }

  async function generateFreeKey(btn) {
    const original = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Creating your key…'; }
    showToast('Creating your key…');
    // Second toast if the cold-start is slow — reassures rather than hangs silent.
    const slowTimer = setTimeout(() => showToast('Our cold-start warmed up — key almost ready.'), 2500);
    try {
      const res = await fetch('/api/keys/free', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      clearTimeout(slowTimer);
      const data = await res.json();
      if (!res.ok || !data.success || !data.apiKey) {
        showToast(data.error || data.message || 'Could not generate key. Try again later.', 'error');
        if (btn) { btn.disabled = false; btn.textContent = original; }
        return;
      }
      showToast('✓ Key ready. Copy it now — it won\'t be shown again.');
      if (btn) { btn.textContent = '✓ Key Generated'; btn.style.opacity = '0.65'; }
      const container = btn && (btn.closest('.pricing-card') || btn.parentElement);
      const resultDiv = container && container.querySelector('.key-result');
      if (resultDiv) {
        resultDiv.style.display = 'block';
        clearChildren(resultDiv);
        const label = el('div', 'key-label', 'Your API Key');
        const value = el('div', 'key-value', data.apiKey);
        value.title = 'Click to copy';
        value.addEventListener('click', () => copyToClipboard(data.apiKey));
        const hint = el('div', 'key-hint', 'Click the key to copy. Save it now — it will not be shown again.');
        const actions = el('div', 'key-actions');
        const copyBtn = el('button', 'key-copy-btn', 'Copy Key');
        copyBtn.type = 'button';
        copyBtn.addEventListener('click', () => copyToClipboard(data.apiKey));
        const docsLink = el('a', 'key-docs-link', 'View Docs');
        docsLink.href = '/api-docs';
        actions.append(copyBtn, docsLink);
        resultDiv.append(label, value, hint, actions);
      } else {
        window.prompt('Your RentVolt API key (save it now — it will not be shown again):', data.apiKey);
      }
    } catch (err) {
      clearTimeout(slowTimer);
      showToast('Network error. Please try again.', 'error');
      if (btn) { btn.disabled = false; btn.textContent = original; }
    }
  }

  async function startCheckout(plan, btn) {
    const original = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Redirecting…'; }
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan })
      });
      const data = await res.json();
      if (!res.ok) {
        showErr(data.error || 'Checkout failed');
        if (btn) { btn.disabled = false; btn.textContent = original; }
        return;
      }
      if (data.url) { window.location.href = data.url; return; }
      showErr('No redirect URL returned');
      if (btn) { btn.disabled = false; btn.textContent = original; }
    } catch (e) {
      showErr('Network error — please try again');
      if (btn) { btn.disabled = false; btn.textContent = original; }
    }
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'checkout') startCheckout(btn.dataset.plan, btn);
    else if (action === 'free-key') generateFreeKey(btn);
  });
})();
