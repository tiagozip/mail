# mail.estrogen.delivery api

The webmail JSON API can be driven programmatically with an API key: send mail, read messages, manage folders and labels from scripts.

## Base URL

```
https://mail.estrogen.delivery/api
```

All request and response bodies are JSON unless noted (attachment uploads use multipart form data, downloads return raw bytes).

## Authentication

Mint a key in the web app, then pass it on every request as a bearer token:

```
Authorization: Bearer emk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Or, equivalently:

```
X-API-Key: emk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

A valid cookie session takes precedence over an API key when both are present.

API-key requests are exempt from the browser origin/CSRF check, so mutating calls (POST, PUT, DELETE) work directly from scripts. Cookie-based requests from a browser still require a same-origin request.

### Creating a key

1. Open the web app and sign in.
2. Go to the developer settings and create a key with a name.
3. The full key (`emk_` followed by 40 hex characters) is shown once, at creation. Copy it then. Only a SHA-256 hash and a short display prefix (for example `emk_1a2b3c4d`) are stored, so the key cannot be retrieved again.

Key management endpoints (`GET/POST /api/keys`, `DELETE /api/keys/:id`) require a real cookie session, not an API key. A leaked key cannot mint or revoke keys.

## Examples

List the inbox:

```bash
curl https://mail.estrogen.delivery/api/messages?folder=inbox \
  -H "Authorization: Bearer $EMK"
```

Send a message (`from` is optional and must be one of your owned addresses; it defaults to your primary address):

```bash
curl -X POST https://mail.estrogen.delivery/api/send \
  -H "Authorization: Bearer $EMK" \
  -H "content-type: application/json" \
  -d '{"to":["someone@example.com"],"subject":"hi","text":"hello from a script","from":"me@estrogen.delivery"}'
```

Get a single message (returns the full body, including decrypted HTML and attachment metadata):

```bash
curl https://mail.estrogen.delivery/api/messages/MESSAGE_ID \
  -H "Authorization: Bearer $EMK"
```

## Rate limits

Every endpoint is rate limited. Limits are counted per account (per client IP for the endpoints that work without a session), in fixed windows, and apply the same way to cookie sessions and API keys.

Successful responses carry the state of the tightest bucket the request touched:

```
x-ratelimit-limit: 20
x-ratelimit-remaining: 17
x-ratelimit-reset: 1785059041
```

`x-ratelimit-reset` is a unix timestamp in seconds. When a bucket is exhausted the request is rejected with `429`, a `retry-after` header, and a JSON body:

```json
{ "error": "too many aliases created, retry in 3600s", "code": "E_RATE_LIMIT", "retryAfter": 3600 }
```

Retry after the window closes; retrying sooner just burns another rejection. The main buckets:

| Bucket | Limit | Applies to |
| --- | --- | --- |
| account ceiling | 1200/min | every authenticated request, on top of the per-route bucket |
| reads | 600/min | `GET` endpoints |
| writes | 180/min | mutations without a bucket of their own |
| `/api/sync` | 300/min | change polling |
| search | 60/min | `GET /api/contacts` |
| bulk | 60/min | `POST /api/messages/bulk`, `POST /api/threads/bulk` |
| send | 30/min, 120/hour, 200/day | `POST /api/send`, including scheduled sends when they fire |
| alias creation | 20/hour, 60/day | `POST /api/aliases`, `POST /api/hidden-aliases` (shared) |
| alias edits | 120/hour | renaming, identity, enable/disable, delete |
| uploads | 200/hour | `POST /api/attachments` |
| avatars | 30/hour | account and per-alias avatar uploads |
| drafts | 240/min | draft autosave |
| labels / folders / filters | 60/hour each | creating, editing, deleting |
| api keys | 10/day created, 60/day revoked | `POST /api/keys`, `DELETE /api/keys/:id` |
| domains | 30/hour, plus 40/hour verification attempts | `/api/domains*` |
| pgp | 60/hour | `/api/pgp*` |
| push | 60/hour | `/api/push/*` |
| settings | 120/hour | `PUT /api/settings` |
| sign-in | 30 per 10 min per IP | `/api/auth/login`, `/api/auth/callback` |
| native code exchange | 10 per 10 min per IP | `/api/auth/native/exchange` |
| unauthenticated | 120/min per IP | anything else without a session |

Inbound mail is limited too: 1000 messages/hour per mailbox and 200/hour for one sender/recipient pair. Over the limit the SMTP handler answers `451`, so a legitimate sender retries later rather than losing the message.

The daily send ceiling is configurable with the `DAILY_SEND_LIMIT` var; the rest live in `src/ratelimit.js`.

## Selected endpoints

- `GET /api/me` current user and addresses
- `GET /api/folders` per-folder counts
- `GET /api/messages?folder=inbox&q=&label=&starred=&limit=&cursor=` list messages (paginated via `nextCursor`)
- `GET /api/threads/:threadId` full thread
- `GET /api/messages/:id` single message (`?images=1` to allow remote images)
- `DELETE /api/messages/:id` delete a message
- `POST /api/messages/:id/read` `{ read }`
- `POST /api/messages/:id/star` `{ star }`
- `POST /api/messages/:id/move` `{ folder }`
- `POST /api/messages/:id/labels` `{ add: [], remove: [] }`
- `POST /api/messages/bulk` `{ ids, action: read|star|move|delete, value }`
- `POST /api/send` `{ to, cc?, bcc?, subject, text, html?, from?, inReplyTo?, references?, attachmentIds?, draftId? }`
- `POST /api/drafts` and `PUT /api/drafts/:id` `{ to, cc, bcc, subject, text }`
- `POST /api/attachments` multipart upload (field `file`), returns `{ id }` to reference in `attachmentIds`
- `GET /api/attachments/:id` download (raw bytes); `GET /api/attachments/:id/inline` inline
- `GET/POST /api/labels`, `DELETE /api/labels/:id`
- `GET/POST /api/aliases`, `DELETE /api/aliases/:address`, `POST /api/aliases/primary` `{ address }`
- `GET /api/contacts?q=` contact autocomplete
- `PUT /api/settings` `{ displayName, signature, settings }`
- `GET /api/keys`, `POST /api/keys` `{ name }`, `DELETE /api/keys/:id` (cookie session only)

## Encryption at rest

Message blobs stored in R2 (raw `.eml`, sanitized HTML bodies, attachment contents) are encrypted at rest with AES-256-GCM (a random 12-byte IV is prepended to each ciphertext). Reads decrypt transparently, so the API returns plaintext bodies and real attachment bytes.

By design, D1 metadata stays plaintext: the message list fields (subject, sender, snippet, `body_text`) and the full-text search index (`messages_fts`) are not encrypted, so listing messages and `q=` search keep working. This is an intentional boundary: searchable text lives in D1 in plaintext; only the larger R2 blobs are encrypted.
