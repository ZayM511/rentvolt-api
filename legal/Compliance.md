# Compliance & Regulatory Information

**Version:** 2026.04.17
**Last Updated:** April 17, 2026

## 1. Company Information

- **Legal Entity:** Groundwork Labs LLC
- **Type:** California Limited Liability Company
- **California Secretary of State Entity ID:** B20260059957
- **Jurisdiction of Formation:** State of California, USA
- **Registered Office / Registered Agent Address:** 2108 N St Ste N, Sacramento, Sacramento County, CA 95816, USA
- **Product:** RentVolt API (https://rentvolt-api.onrender.com)
- **Primary contact:** `legal@groundworklabs.io`

## 2. California Business Compliance

Groundwork Labs LLC is formed under the California Revised Uniform Limited Liability Company Act (Cal. Corp. Code § 17701 et seq.) and in good standing with the California Secretary of State.

## 3. Privacy: CCPA / CPRA

See the [Privacy Policy](/legal/privacy) and [Do Not Sell or Share My Personal Information](/legal/do-not-sell) for full details. Summary:

- We do not sell or share personal information for cross-context behavioral advertising.
- California residents have rights to know, delete, correct, opt out, limit sensitive-data use, and appeal. Respond time: 45 days.
- Privacy contact: `legal@groundworklabs.io` or `/privacy-request`.

## 4. California Automatic Renewal Law (Bus. & Prof. Code § 17602)

Our subscription auto-renewal practices are designed to comply with the California ARL:

- Clear and conspicuous disclosure of auto-renewal terms at the point of sale (on `/pricing` and in Stripe checkout's custom consent language).
- Affirmative consent captured via Stripe's consent collection mechanism.
- Acknowledgment of the subscription terms in a post-purchase confirmation email.
- One-click cancellation available via Stripe's customer portal, the `/dashboard` page, and email.

## 5. Payments (PCI-DSS)

Payment processing is handled by Stripe, Inc., which is PCI DSS Level 1 certified. RentVolt's integration uses Stripe-hosted checkout and customer portal; cardholder data never touches our servers (SAQ-A eligibility).

## 6. Data Security

- All HTTP traffic is encrypted via TLS (HTTPS).
- API keys are stored as SHA-256 hashes, never plaintext.
- The PostgreSQL database is operated by Render with encryption at rest.
- We use least-privilege access, environment-variable secret management, and webhook signature verification (Stripe).
- We monitor for abnormal usage patterns and rate-limit requests.

## 7. Fair Housing

Our [Acceptable Use Policy](/legal/aup) explicitly prohibits use of the Service or Data to discriminate in housing in violation of the Fair Housing Act (42 U.S.C. §§ 3601–3619), California FEHA (Gov't Code § 12900 et seq.), or similar laws.

## 8. DMCA

We maintain a [DMCA Policy](/legal/dmca) and have designated an agent under 17 U.S.C. § 512(c)(2).

## 9. Accessibility

We target WCAG 2.1 Level AA for our public website. If you encounter an accessibility barrier, email `legal@groundworklabs.io`.

## 10. Tax

RentVolt is a SaaS API subscription. California generally does not impose sales tax on electronically delivered software services. Sales-tax treatment in other US states varies; Stripe Tax is used to compute and collect applicable taxes. Customers are responsible for any use tax in their state.

## 11. Reporting Concerns

- Security vulnerabilities: `legal@groundworklabs.io`
- AUP violations: `legal@groundworklabs.io`
- Privacy complaints: `legal@groundworklabs.io`
- Copyright / DMCA: `legal@groundworklabs.io`
- General legal: `legal@groundworklabs.io`

---
*This page is for informational purposes.*
