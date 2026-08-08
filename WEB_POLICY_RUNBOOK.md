# Cencori Web policy operations

Cencori Web treats fetched pages as untrusted data and applies policy at three boundaries: before network access, after retrieval, and before a result is served.

## Automated controls

- `robots.txt` is checked before HTTP and browser navigation.
- `X-Robots-Tag` and HTML robots directives enforce `noindex`, `nofollow`, `noarchive`, and `nosnippet`.
- Private cache responses and sensitive account/auth/payment URL patterns are excluded.
- SSRF checks reject local, private, reserved, and credential-bearing destinations.
- Corpus jobs may restrict paths and languages.
- Tombstoned canonical URLs cannot be re-indexed by later crawls.

## Domain policies

Internal operators use `POST /api/internal/web/policies` with a host, path prefix, action, and reason. Actions are `allow`, `deny`, `noindex`, `noarchive`, and `nosnippet`. The most specific matching path wins. Policies may include an expiration and jurisdiction.

Use `DELETE /api/internal/web/policies?id=<uuid>` to remove a policy. Every policy decision should reference a ticket, legal request, or documented crawler decision in `reason`.

## Takedowns

Authenticated customers submit `POST /api/v1/web/takedown`. Requests remain pending until an internal operator verifies requester identity and authority, confirms the exact URLs, records the applicable basis, and checks whether a narrower action is sufficient.

Operators list requests with `GET /api/internal/web/takedowns`, then decide with `PATCH /api/internal/web/takedowns`:

```json
{
  "id": "request-uuid",
  "status": "approved",
  "reason": "Verified copyright owner request, case LEGAL-123"
}
```

Approval atomically creates durable tombstones and removes matching indexed documents. Rejection and withdrawal preserve the record without removing content.

## Privacy and copyright response

For privacy requests, verify identity without collecting more personal data than necessary. For copyright requests, preserve the submitted statement, scope removal to identified works and URLs, and retain the decision record. Escalate court orders, broad domain removals, repeat-infringer claims, and jurisdiction conflicts to counsel before acting.

## Crawler identity and contact

Crawler user agent: `CencoriWeb/1.0 (+https://cencori.com/web)`. Publish a working contact and crawler-policy page at that URL before expanding beyond the curated technical corpus.
