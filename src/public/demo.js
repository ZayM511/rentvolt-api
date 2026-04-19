// /demo page — enterprise lead form (CSP-compliant).
document.getElementById('demo-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const btn = document.getElementById('submit-btn');
  const ok = document.getElementById('ok');
  const err = document.getElementById('err');
  ok.style.display = 'none'; err.style.display = 'none';
  btn.disabled = true; btn.textContent = 'Sending…';
  const data = {
    email: f.email.value.trim(),
    company: f.company.value.trim() || undefined,
    useCase: f.useCase.value.trim() || undefined,
    volume: f.volume.value || undefined,
    notes: f.notes.value.trim() || undefined
  };
  try {
    const res = await fetch('/api/demo-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const j = await res.json();
    if (res.ok) {
      ok.textContent = j.message || "Thanks — we'll be in touch within one business day.";
      ok.style.display = 'block';
      f.reset();
    } else {
      err.textContent = j.error || 'Could not submit. Please try again or email sales@groundworklabs.io directly.';
      err.style.display = 'block';
    }
  } catch {
    err.textContent = "Network error. Email sales@groundworklabs.io and we'll respond the same way.";
    err.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Request demo';
  }
});
