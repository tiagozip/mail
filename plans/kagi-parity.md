# Kagi Mail parity

Source: https://blog.kagi.com/kagi-mail-public-beta (2026-11-23).

## Already in Estrogen Mail

- own address, aliases, custom domains (BYOD)
- tracking pixels stripped, remote images proxied through `/api/img`
- AI spam and phishing classification (`src/spam.js`)
- label rules and filters, folders bound to aliases
- keyboard shortcuts and search operators (`listMessages` in `src/api.js`)
- OIDC sign-in through hrtID
- MCP server, built in another session (`src/mcp.js`)
- PGP, scheduled send, snooze, push

## Gaps, in order of value

1. Built-in calendar: month and week views, event creation, ICS invites parsed from incoming mail with accept and decline replies, an `.ics` feed. Done.
2. Sender screening: hold mail from first-time senders in Screener until let in or blocked. Done, opt-in in Settings, Filters.
3. Newsletter view: list mail with a `List-Unsubscribe` header goes to a Newsletters folder. Done as a folder, opt-in. Not done: a feed-style reader and one-click unsubscribe.
4. One-click export of mail and calendar.
5. Command palette.
6. BIMI logos for verified senders.
7. Inbox highlights, ask-your-inbox, plain-language rules (AI features).
8. Translate and proofread in compose.
9. IMAP, JMAP, CalDAV access for third-party clients. Needs a server outside Workers, out of scope here.
10. Shared addresses with per-person access.

## Calendar limits left for later

- Inviting guests from an event you create. Events you make have no attendees yet.
- RSVP replies go out as an `.ics` attachment, because the Workers email binding has no way to add a `text/calendar` alternative part. Most clients still read it, but Outlook may not update the organizer's view.
- Recurrence covers FREQ with INTERVAL, COUNT, UNTIL and weekly BYDAY. EXDATE and per-occurrence overrides from invites are ignored, and editing one occurrence edits the series.
- Invite details are stored in plaintext in D1 even when PGP is on, since they are parsed at ingest.

## One-click unsubscribe

Done. Mail with a List-Unsubscribe header shows a bar in the thread. The server tries an RFC 8058 POST, then a mailto message, then gives the client the link to open. Needs migration 006 on remote D1.
