// Landing-page interactivity (external file — CSP-compliant).
(function () {
  const $ = (id) => document.getElementById(id);
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  // ── Sticky nav ──
  const nav = $('nav');
  if (nav) {
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 50);
    }, { passive: true });
  }

  // ── Mobile hamburger ──
  const hamburger = $('hamburger');
  const navLinks = $('navLinks');
  if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('open');
      hamburger.setAttribute('aria-expanded', String(isOpen));
      hamburger.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
    });
    navLinks.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
        hamburger.setAttribute('aria-label', 'Open menu');
      });
    });
  }

  // ── Newsletter ──
  const nlForm = $('newsletter-form');
  if (nlForm) {
    nlForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = ($('newsletter-email').value || '').trim();
      const btn = $('newsletter-btn');
      const msg = $('newsletter-msg');
      msg.textContent = ''; msg.style.color = '';
      if (!/.+@.+\..+/.test(email)) {
        msg.textContent = 'Enter a valid email address.';
        msg.style.color = '#ffb0b0';
        return;
      }
      btn.disabled = true; const t = btn.textContent; btn.textContent = 'Subscribing…';
      try {
        const res = await fetch('/api/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, source: 'homepage' })
        });
        const j = await res.json();
        if (res.ok) {
          msg.textContent = j.message || 'Subscribed.';
          msg.style.color = '#7ee0a6';
          nlForm.reset();
        } else {
          msg.textContent = j.error || 'Could not subscribe.';
          msg.style.color = '#ffb0b0';
        }
      } catch {
        msg.textContent = 'Network error. Try again in a moment.';
        msg.style.color = '#ffb0b0';
      } finally {
        btn.disabled = false; btn.textContent = t;
      }
    });
  }

  // ── Scroll reveal ──
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.animate-on-scroll').forEach((e2) => observer.observe(e2));

  // ── Hero mesh-gradient scroll parallax ──
  const hero = document.querySelector('.hero');
  if (hero && window.matchMedia('(prefers-reduced-motion: no-preference)').matches) {
    let latest = 0, ticking = false;
    const update = () => {
      const h = window.innerHeight;
      const pct = Math.min(1, Math.max(0, latest / h));
      hero.style.setProperty('--hero-shift-y', (pct * 40).toFixed(1) + 'px');
      hero.style.setProperty('--hero-fade',    (1 - pct * 0.25).toFixed(3));
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      latest = window.scrollY;
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
  }

  // ── "Clean, Simple API" code tabs + copy ──
  document.querySelectorAll('.code-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.code-tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.code-panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      const target = $('panel-' + tab.dataset.tab);
      if (target) target.classList.add('active');
    });
  });
  const copyBtn = $('copyBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const pre = document.querySelector('.code-panel.active pre');
      if (!pre) return;
      navigator.clipboard.writeText(pre.textContent).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
      });
    });
  }

  // ── /#tryit language-snippet tabs (B2) ──
  const snippetTabs = document.querySelectorAll('.snippet-tab');
  const snippetPanels = document.querySelectorAll('.snippet-panel');
  function setSnippetCity(city) {
    snippetPanels.forEach((panel) => {
      const tmpl = panel.dataset.template || '';
      const codeEl = panel.querySelector('code');
      if (codeEl) codeEl.textContent = tmpl.replaceAll('{CITY}', city || 'oakland');
    });
  }
  snippetTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      snippetTabs.forEach((t) => t.classList.remove('active'));
      snippetPanels.forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      const target = document.querySelector('.snippet-panel[data-lang="' + tab.dataset.lang + '"]');
      if (target) target.classList.add('active');
    });
  });
  const snippetCopy = $('snippetCopy');
  if (snippetCopy) {
    snippetCopy.addEventListener('click', () => {
      const active = document.querySelector('.snippet-panel.active code');
      if (!active) return;
      navigator.clipboard.writeText(active.textContent).then(() => {
        snippetCopy.textContent = 'Copied!';
        setTimeout(() => { snippetCopy.textContent = 'Copy'; }, 1800);
      });
    });
  }

  // ── /#tryit live demo (DOM-builder, no innerHTML) ──
  const citySelect = $('citySelect');
  const executeBtn = $('executeBtn');
  const resultsBody = $('resultsBody');
  const resultsCount = $('resultsCount');
  if (citySelect) {
    citySelect.addEventListener('change', () => setSnippetCity(citySelect.value));
    setSnippetCity(citySelect.value);
  }

  function message(icon, title, body) {
    clear(resultsBody);
    const wrap = el('div', 'demo-message');
    wrap.appendChild(el('span', 'msg-icon', icon));
    wrap.appendChild(el('h4', null, title));
    wrap.appendChild(el('p', null, body));
    resultsBody.appendChild(wrap);
  }

  function skeleton() {
    clear(resultsBody);
    const wrap = el('div', 'listings-container');
    for (let i = 0; i < 5; i++) {
      const card = el('div', 'skeleton-card');
      card.appendChild(el('div', 'skeleton-line w30'));
      card.appendChild(el('div', 'skeleton-line w80'));
      card.appendChild(el('div', 'skeleton-line w40'));
      wrap.appendChild(card);
    }
    resultsBody.appendChild(wrap);
    if (resultsCount) resultsCount.textContent = 'Loading…';
  }

  function render(data) {
    clear(resultsBody);
    if (!data.listings || data.listings.length === 0) {
      message('🤷', 'No listings found', 'Try a different city or check the docs.');
      if (resultsCount) resultsCount.textContent = '0 results';
      return;
    }
    if (resultsCount) resultsCount.textContent = data.total + ' listings · ' + Object.keys(data.sources || {}).length + ' source(s)';

    // ── Market context card (HUD FMR + Census) ──
    const mc = data.marketContext;
    if (mc && (mc.hud || mc.census)) {
      const card = el('div', 'market-context');
      card.appendChild(el('div', 'mc-label', 'Market context · ZIP ' + (mc.zip || '—')));
      const grid = el('div', 'mc-grid');
      const twoBr = mc.hud?.fmr?.twoBr;
      if (twoBr) {
        const s = el('div', 'mc-stat');
        s.appendChild(el('div', 'mc-stat-value', '$' + Number(twoBr).toLocaleString()));
        s.appendChild(el('div', 'mc-stat-label', 'HUD Fair Market Rent · 2BR'));
        grid.appendChild(s);
      }
      const mgr = mc.census?.medianGrossRent;
      if (mgr) {
        const s = el('div', 'mc-stat');
        s.appendChild(el('div', 'mc-stat-value', '$' + Number(mgr).toLocaleString()));
        s.appendChild(el('div', 'mc-stat-label', 'Census median gross rent'));
        grid.appendChild(s);
      }
      const inc = mc.census?.medianHouseholdIncome;
      if (inc) {
        const s = el('div', 'mc-stat');
        s.appendChild(el('div', 'mc-stat-value', '$' + Number(inc).toLocaleString()));
        s.appendChild(el('div', 'mc-stat-label', 'Median household income'));
        grid.appendChild(s);
      }
      const vac = mc.census?.vacancyRate;
      if (vac != null) {
        const s = el('div', 'mc-stat');
        s.appendChild(el('div', 'mc-stat-value', vac + '%'));
        s.appendChild(el('div', 'mc-stat-label', 'Rental vacancy rate'));
        grid.appendChild(s);
      }
      card.appendChild(grid);
      resultsBody.appendChild(card);
    }

    const wrap = el('div', 'listings-container');
    data.listings.forEach((l, i) => {
      const card = el('div', 'listing-card');
      card.style.animationDelay = (i * 0.08) + 's';
      const header = el('div', 'listing-header');
      header.appendChild(el('span', 'source-badge source-apartments', l.source || 'rentcast'));
      const price = el('span', 'listing-price', '$' + (typeof l.price === 'number' ? l.price.toLocaleString() : (l.price || '—')));
      price.appendChild(el('span', 'period', '/mo'));
      header.appendChild(price);
      card.appendChild(header);
      card.appendChild(el('div', 'listing-address', l.address || '—'));
      const details = el('div', 'listing-details');
      if (l.beds)  details.appendChild(el('span', 'detail-badge', l.beds));
      if (l.baths) details.appendChild(el('span', 'detail-badge', l.baths));
      if (l.sqft)  details.appendChild(el('span', 'detail-badge', l.sqft + ' sqft'));
      card.appendChild(details);
      wrap.appendChild(card);
    });
    resultsBody.appendChild(wrap);
  }

  if (executeBtn && citySelect && resultsBody) {
    const DEMO_MAX = 3;
    let demoCount = parseInt(sessionStorage.getItem('rentvolt_demo_count') || '0', 10);
    let demoUsed = demoCount >= DEMO_MAX;

    function updateDemoBtn() {
      if (demoUsed) {
        executeBtn.disabled = true;
        executeBtn.textContent = 'Demo Used (3/3)';
      } else {
        executeBtn.textContent = '⚡ Execute Request (' + demoCount + '/' + DEMO_MAX + ')';
      }
    }
    updateDemoBtn();

    executeBtn.addEventListener('click', async () => {
      if (demoUsed) return;
      const city = citySelect.value;
      if (!city) {
        message('ℹ️', 'Pick a city first', 'Choose one from the dropdown, then hit Execute.');
        return;
      }
      executeBtn.disabled = true;
      executeBtn.textContent = '⏳ Fetching…';
      skeleton();
      const slowTimer = setTimeout(() => {
        const notice = el('p', 'slow-notice', 'Taking a bit longer than usual — cold-start warmup.');
        resultsBody.appendChild(notice);
      }, 8000);
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        const res = await fetch('/demo/listings?city=' + encodeURIComponent(city) + '&state=' + encodeURIComponent(inferState(city)), { signal: controller.signal });
        clearTimeout(timeout); clearTimeout(slowTimer);
        if (res.status === 429) {
          message('🔒', 'Demo limit reached', 'You\'ve used all 3 demo requests today. Grab a free API key below for 100 req/month.');
          demoUsed = true; demoCount = DEMO_MAX;
          sessionStorage.setItem('rentvolt_demo_count', String(DEMO_MAX));
          updateDemoBtn();
          return;
        }
        const data = await res.json();
        if (res.ok && data.success) render(data);
        else throw new Error(data.error || ('HTTP ' + res.status));
      } catch (err) {
        clearTimeout(slowTimer);
        if (err.name === 'AbortError') {
          message('⏳', 'Request timed out', 'Try again — the server may be warming up.');
        } else {
          message('⚠️', 'Something went wrong', err.message || 'Please try again.');
        }
        if (resultsCount) resultsCount.textContent = '';
        executeBtn.disabled = false;
        executeBtn.textContent = '⚡ Execute Request';
        return;
      }
      demoCount++;
      sessionStorage.setItem('rentvolt_demo_count', String(demoCount));
      demoUsed = demoCount >= DEMO_MAX;
      updateDemoBtn();
    });
  }

  function inferState(city) {
    const map = {
      oakland: 'ca', 'san-francisco': 'ca', 'san-jose': 'ca', 'los-angeles': 'ca',
      seattle: 'wa', portland: 'or', austin: 'tx', denver: 'co', chicago: 'il',
      'new-york': 'ny', boston: 'ma', miami: 'fl'
    };
    return map[city] || 'ca';
  }
})();
