// /success page — post-checkout polling for provisioned key details (CSP-compliant).
(async function () {
  const params = new URLSearchParams(location.search);
  const sid = params.get('session_id');
  const $ = (id) => document.getElementById(id);
  if (!sid) {
    $('loading').textContent = 'Missing session ID — please check your email for the welcome message.';
    return;
  }
  let tries = 0;
  async function fetchDetails() {
    try {
      const res = await fetch('/api/stripe/session/' + encodeURIComponent(sid));
      if (res.status === 202 && tries < 6) {
        tries++;
        setTimeout(fetchDetails, 1500);
        return;
      }
      if (!res.ok) throw new Error('Could not fetch session');
      const data = await res.json();
      $('loading').style.display = 'none';
      $('details').style.display = 'block';
      $('plan').textContent = (data.plan || '').toUpperCase();
      $('quota').textContent = (data.monthlyRequests || 0).toLocaleString() + ' req/mo';
      $('prefix').textContent = (data.apiKeyPrefix || '—') + '…';
      if (data.email) $('email').textContent = data.email;
    } catch {
      $('loading').textContent = 'Your key is ready — please check your email.';
    }
  }
  fetchDetails();
})();
