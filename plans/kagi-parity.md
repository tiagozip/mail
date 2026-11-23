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

1. Built-in calendar: month and week views, event creation, ICS invites parsed from incoming mail with accept and decline replies, an `.ics` feed. Done in this branch.
2. Sender screening: hold mail from first-time senders until approved.
3. Newsletter view: the spam classifier already tags newsletters, but there is no feed view for them.
4. One-click export of mail and calendar.
5. Command palette.
6. BIMI logos for verified senders.
7. Inbox highlights, ask-your-inbox, plain-language rules (AI features).
8. Translate and proofread in compose.
9. IMAP, JMAP, CalDAV access for third-party clients. Needs a server outside Workers, out of scope here.
10. Shared addresses with per-person access.
