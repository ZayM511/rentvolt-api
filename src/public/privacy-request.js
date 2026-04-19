// /privacy-request — CCPA/CPRA form (CSP-compliant).
document.getElementById('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const data = {
    email: f.email.value,
    requestType: f.requestType.value,
    notes: f.notes.value || undefined
  };
  const ok = document.getElementById('ok');
  const err = document.getElementById('err');
  ok.style.display = 'none';
  err.style.display = 'none';
  try {
    const res = await fetch('/api/privacy-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const j = await res.json();
    if (res.ok) { ok.style.display = 'block'; f.reset(); }
    else { err.textContent = j.error || 'Could not submit'; err.style.display = 'block'; }
  } catch {
    err.textContent = 'Network error'; err.style.display = 'block';
  }
});
