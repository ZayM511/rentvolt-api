# API Versioning & Deprecation Policy

**Version:** 2026.04.18
**Effective Date:** April 18, 2026

RentVolt is an API you build on. These rules tell you what you can count on.

## 1. Stability Tiers

Each endpoint is labeled in the OpenAPI spec with a stability tier:

- **Stable** — no breaking changes without a deprecation cycle. Safe for production.
- **Beta** — functional but may change with 30 days' notice. Call sites should expect occasional field renames.
- **Experimental** — subject to change without notice. Not recommended for production workloads.

Absent a label, assume **Stable**.

## 2. What Counts as a Breaking Change

A breaking change is any of the following:

- Removing an endpoint, request parameter, or response field.
- Renaming a response field.
- Changing a response field's type or meaning.
- Tightening a response header or error-code contract in a way clients would notice.
- Reducing an endpoint's rate limit below the documented quota floor.

Non-breaking changes you should expect freely:

- Adding new endpoints.
- Adding new optional request parameters.
- Adding new fields to responses (your client should ignore unknown fields).
- Adding new HTTP response headers.
- Widening quotas or loosening rate limits.
- Improving internal data freshness.

## 3. Deprecation Timeline

When a Stable endpoint or field is deprecated:

1. We announce the deprecation via the changelog at `/changelog`, an email to the subscription-email on file, and a `Deprecation` response header on affected calls.
2. **A minimum of 180 days (six months)** pass before the endpoint is removed.
3. During the deprecation window the endpoint continues to function identically. Responses include:
   - `Deprecation: true`
   - `Sunset: <RFC 1123 date>` — the date the endpoint will be removed.
   - `Link: <url>; rel="successor-version"` — where applicable.

## 4. Emergency Security Changes

We reserve the right to remove or change behavior immediately if continuing to serve it would violate law, create a security exposure, or harm third parties (e.g., fair-housing, DMCA, fraud). We will communicate afterwards.

## 5. Versioning Scheme

The API does not require a version header today; changes happen in-place under the rules above. If we ever introduce a `v2` namespace, `v1` will receive at least a 180-day co-run before any sunset.

## 6. Changelog

Our public changelog lives at `/changelog` (coming soon) and in the GitHub repo at `github.com/ZayM511/rentvolt-api/blob/main/CHANGELOG.md`. Each entry is dated and tagged `added`, `changed`, `deprecated`, `removed`, or `fixed`.

## 7. Contact

Questions about this policy, a specific deprecation, or a stability label: email `support@groundworklabs.io`.
