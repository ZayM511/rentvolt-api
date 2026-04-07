// Terms Acceptance Middleware
const acceptedVersions = new Set();

const termsAcceptance = (req, res, next) => {
  // Terms must be accepted for paid plans
  if (req.apiKey.plan === 'free') {
    return next();
  }
  
  // For paid plans, terms acceptance is checked
  const accepted = req.headers['x-terms-accepted'];
  if (!accepted) {
    return res.status(403).json({
      error: 'Terms of Service must be accepted',
      message: 'Include header: x-terms-accepted: true',
      termsUrl: 'https://github.com/ZayM511/rentvolt-api/blob/main/legal/TermsOfService.md'
    });
  }
  next();
};

module.exports = termsAcceptance;
