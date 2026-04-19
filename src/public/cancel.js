// Cancel-page feedback form (external file — CSP-compliant).
document.getElementById('fb').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const data = {
    reason: f.reason.value || undefined,
    message: f.message.value || undefined,
    email: f.email.value || undefined
  };
  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (res.ok) {
      document.getElementById('ok').style.display = 'block';
      f.reset();
    }
  } catch {}
});
