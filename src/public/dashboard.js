// Dashboard client — session-cookie based.
(function () {
  const $ = (id) => document.getElementById(id);
  const show = (el) => el.classList.remove('hidden');
  const hide = (el) => el.classList.add('hidden');
  const fmt = (iso) => iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';

  async function loadMe() {
    try {
      // Silent check first — always 200, avoids the 401 console noise.
      const probe = await fetch('/api/auth/session', { credentials: 'same-origin' });
      const p = await probe.json();
      if (!p.authenticated) return renderSignedOut();
      // Signed in — fetch the full account payload.
      const res = await fetch('/api/me', { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      renderSignedIn(await res.json());
    } catch (err) {
      renderSignedOut();
    }
  }

  function renderSignedOut() {
    hide($('signed-in'));
    show($('signed-out'));
  }

  function renderSignedIn(me) {
    hide($('signed-out'));
    show($('signed-in'));
    // Nav: when signed in, swap "Sign in" → "Sign out" so the current-page
    // link is actionable and reflects what clicking it does.
    const navSignin = $('nav-signin');
    if (navSignin) {
      navSignin.textContent = 'Sign out';
      navSignin.removeAttribute('aria-current');
      navSignin.removeAttribute('href');
      navSignin.style.cursor = 'pointer';
      navSignin.addEventListener('click', async (e) => {
        e.preventDefault();
        await fetch('/api/auth/signout', { method: 'POST', credentials: 'same-origin' });
        renderSignedOut();
        navSignin.textContent = 'Sign in';
        navSignin.setAttribute('href', '/dashboard');
        navSignin.setAttribute('aria-current', 'page');
      }, { once: true });
    }
    $('me-email').textContent = me.email;
    if (me.key) {
      show($('card-usage'));
      show($('card-key'));
      $('used').textContent = me.key.used;
      $('limit').textContent = me.key.monthlyRequests;
      $('plan-label').textContent = me.key.plan;
      $('reset').textContent = fmt(me.key.resetAt);
      $('prefix').textContent = me.key.prefix || '—';
      const pct = Math.min(100, Math.round((me.key.used / me.key.monthlyRequests) * 100));
      $('bar').style.width = pct + '%';
    } else {
      hide($('card-usage'));
      hide($('card-key'));
    }
  }

  $('send-link').addEventListener('click', async () => {
    const email = $('email-input').value.trim();
    const btn = $('send-link');
    const okEl = $('link-sent');
    const errEl = $('link-err');
    hide(okEl); hide(errEl);
    if (!email || !/.+@.+\..+/.test(email)) {
      errEl.textContent = 'Enter a valid email address.';
      show(errEl);
      return;
    }
    btn.disabled = true;
    const origText = btn.textContent;
    btn.textContent = 'Sending…';
    try {
      const res = await fetch('/api/auth/request-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        show(okEl);
      } else {
        errEl.textContent = j.message || j.error || 'Could not send link. Try again in a moment.';
        show(errEl);
      }
    } catch {
      errEl.textContent = 'Network error. Check your connection and retry.';
      show(errEl);
    } finally {
      btn.disabled = false;
      btn.textContent = origText;
    }
  });

  $('signout').addEventListener('click', async () => {
    await fetch('/api/auth/signout', { method: 'POST', credentials: 'same-origin' });
    renderSignedOut();
  });

  $('rotate').addEventListener('click', async () => {
    if (!confirm('Rotate API key? The old key is revoked immediately.')) return;
    const btn = $('rotate');
    const errEl = $('rotate-err');
    const out = $('new-key');
    hide(errEl); hide(out);
    btn.disabled = true;
    btn.textContent = 'Rotating…';
    try {
      const res = await fetch('/api/me/key/rotate', { method: 'POST', credentials: 'same-origin' });
      const j = await res.json();
      if (res.ok && j.apiKey) {
        out.textContent = j.apiKey;
        show(out);
        loadMe();
      } else {
        errEl.textContent = j.error || 'Rotation failed';
        show(errEl);
      }
    } catch {
      errEl.textContent = 'Network error';
      show(errEl);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Rotate API key';
    }
  });

  $('manage').addEventListener('click', async () => {
    const errEl = $('manage-err');
    hide(errEl);
    try {
      const res = await fetch('/api/me/stripe/manage', { method: 'POST', credentials: 'same-origin' });
      const j = await res.json();
      if (res.ok && j.url) {
        window.location.href = j.url;
      } else {
        errEl.textContent = j.error || 'Could not open billing portal';
        show(errEl);
      }
    } catch {
      errEl.textContent = 'Network error';
      show(errEl);
    }
  });

  loadMe();
})();
