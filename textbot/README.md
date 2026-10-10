# textbot

Thin Bun sidecar between Photon Spectrum and the FastAPI backend. It only moves
messages; sign-in, scope checks and all client data stay in `backend/app/routers/bot.py`.

```
phone ⇄ Spectrum Cloud ⇄ textbot ──POST /bot/inbound──▶ FastAPI
                           ▲
                           └──POST /send (welcome, nudges)── FastAPI
```

## Run locally (no Photon account)

1. Backend: set `BOT_SERVICE_SECRET` in `backend/.env`, run the API on :3000.
2. In ClientPage, enroll a test client with the number in `TEST_SENDER_PHONE`.
3. Here:

```bash
cp .env.example .env      # set BOT_SERVICE_SECRET to the backend's value
bun install
bun run dev               # terminal chat UI; your messages come from TEST_SENDER_PHONE
```

Proactive texts (the welcome text) show up in an "outbound" chat in the terminal UI.

## Run with Spectrum Cloud

Set `TEXTBOT_MODE=cloud`, `SPECTRUM_PROJECT_ID`, `SPECTRUM_PROJECT_SECRET` (from the
secrets manager), then `bun run start`. Keep port `TEXTBOT_PORT` private to the backend.

Before going live:
- Use a **dedicated line** (Business plan) so clients always see one number.
- Confirm SMS/RCS fallback is on your plan; the channel is read from the sender's `service`.
- Default quota: 50 new conversations per line per day. Each welcome text to a
  never-messaged number counts.

## Behavior

- Messages from one number are processed strictly in order; different numbers run in parallel.
- Before sign-in each message is sent alone (name, then PIN). After sign-in, messages
  sent within `MERGE_WINDOW_MS` (default 2.5 s) are merged into one turn, one line each.
  The backend still honors STOP on any line of a merged burst.
- Group chats, reactions, edits, read receipts and typing events are ignored.
- Attachments are counted and forwarded as `attachment_count` only; bytes are handled in phase 5.
- Replies are sent as plain text so they read the same on SMS.
- If the backend is down, the client gets a generic "try again" reply with no data.

## Test

```bash
bun test && bun run typecheck
```
