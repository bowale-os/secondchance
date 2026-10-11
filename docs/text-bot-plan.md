# Text bot: Photon Spectrum integration plan

A text-message version of the app for clients. Clients can ask for their daily or weekly schedule, send photos of documents and get a simplified or translated version back, look up nearby resources, and get a local map. **Nothing is texted until the client has verified their name and PIN.**

> **Before building:** finish the secret rotation flagged in the Resources tab plan. Rotating `PIN_PEPPER` forces PIN resets, so launch the bot after the rotation, not before. Store the Spectrum project secret in the secrets manager, never in a shared doc.

## What Spectrum provides

Spectrum is Photon's open-source messaging SDK (`spectrum-ts`) and cloud platform. It connects one agent to iMessage, WhatsApp, Telegram, Slack, and Discord. Photon also advertises iMessage → RCS → SMS fallback from one codebase.

| Need | Spectrum feature |
|---|---|
| Receive photos | Inbound attachment bytes through `content.read()` (cloud mode) |
| Send map images | Outbound files through the `attachment()` content builder |
| Optional interactive views | `app()` sends a URL as a tappable card, shown on iMessage as a native mini-app card |
| Formatting | Markdown on iMessage, Telegram, and WhatsApp; SMS needs plain text |

**Setup decisions**

- **Channel reach:** many clients use Android or prepaid phones. Confirm that RCS/SMS fallback is included on your plan before committing.
- **Dedicated line:** the free tier uses a shared line pool, so different recipients may see different sending numbers. Clients need one number they can save and trust, so use a dedicated line.

## Architecture

The backend is Python and `spectrum-ts` is TypeScript. Keep business logic in Python and put a thin bridge in front of it.

```
Client's phone ⇄ Spectrum Cloud ⇄ textbot sidecar (Bun/Node, spectrum-ts)
                                        │  service-to-service auth
                                        ▼
                              FastAPI: routers/bot.py
                     (auth state machine, intent router, client-scoped services)
                                        │
                Neon (clients, resources, schedule) · Gemini · Maps API
```

**The sidecar only handles message I/O:** the Spectrum connection, debouncing bursts of messages, attachment upload and download, and rendering replies per channel. It never sees client data the backend hasn't released.

**Shared service layer:** current endpoints are case-worker scoped (Auth0 plus assignment checks). Move their logic into services with two callers:

1. The existing case-worker routes.
2. A new client-scoped bot path, where the only client ID available comes from an authenticated bot session.

## Identity: name and PIN first

### Enrollment

A case worker turns on texting from `ClientPage`, recording the phone number (E.164), consent, and a timestamp. The system sends a welcome text with no personal details.

The bot only engages with enrolled numbers. Everyone else gets one generic reply: *"This service is for enrolled clients. Ask your case worker to set it up."* This acts as a third factor and prevents name guessing.

### Session state machine

| State | Bot says | Next |
|---|---|---|
| `awaiting_name` | "Reply with your full name." | Any reply → `awaiting_pin` |
| `awaiting_pin` | "Now reply with your PIN." | Server checks name against the client linked to the phone, and PIN hash with `PIN_PEPPER` |
| failed check | "That name and PIN don't match." | Never reveals which part was wrong |
| `active` | Answers requests | ~15 min idle timeout, absolute cap of a few hours, then re-authenticate |
| `locked` | "Contact your case worker." | After 5 failed attempts; case worker is flagged |

There is no PIN reset over text. Resets go through the case worker.

### Proactive messages carry no content

Scheduled pushes and lock-screen previews would break the PIN rule, so any message the system starts on its own is a nudge only:

- *"Your schedule for today is ready. Reply to sign in."*
- The drawer's **Text to client** action sends *"Your case worker shared a resource with you,"* and details appear only after sign-in.

### Risks and policy calls

- **PIN in message history:** a typed PIN stays visible in the thread. A later iMessage option is a PIN pad opened through an `app()` card. SMS users will still type it.
- **SMS is unencrypted:** keep replies minimal. Never send SSNs or full ID numbers.
- **Keywords:** handle `STOP` and `HELP`.
- **Crisis exception (recommended, your call):** messages about overdose, self-harm, or having nowhere to sleep tonight get 988, 911, or 211 immediately, with no sign-in. The reply contains no client data.

## Understanding requests

Gemini classifies messages into a fixed set of tools with arguments. The backend runs the tool and enforces scope. The model never queries the database.

**Fast path (keywords and numbered menus):** `TODAY`, `WEEK`, `FOOD`, `SHELTER`, `JOBS`, `MAP`, `MORE`, `1`–`5`, `MENU`. These work for low-literacy users and on SMS. Free text, such as "where can I eat tonight near Five Points," goes to the model.

| Tool | Purpose |
|---|---|
| `get_schedule(range)` | Daily or weekly schedule |
| `process_photo(mode, target_lang)` | Simplify or translate a document photo |
| `search_resources(query)` | Nearby resources |
| `resource_detail(n)` | Details for item *n* in the last list |
| `job_steps(n, step)` | Fair-chance job walkthrough |
| `send_map(scope)` | Static map of the last results |

The session stores the last result list, so "2" or "map" refers back to it.

## Features

### Daily and weekly schedule

- **Endpoint:** `GET /bot/schedule?range=day|week` on the client-scoped service.
- **Sources:** calendar events, plus classes and events added to the client's plan (`starts_at` and `recurrence` from `ClassEventDetails`, expanded on the server).
- **Daily view:** events in time order, each with place, nearest transit stop, and documents to bring.
- **Weekly view:** compact list grouped by day.
- **Locale:** America/New_York time; profile `language`.
- **Optional:** opt-in morning nudge, following the no-content rule.

### Photos: simplify or translate

1. A photo arrives. If the sender isn't signed in, hold it briefly in memory and ask them to sign in. If the hold expires, ask them to resend.
2. With no caption, ask *"Reply 1 to simplify or 2 to translate."* Translation defaults to the profile language.
3. Send it to Gemini vision using the `extraction.py` pattern. Debounce several photos into one job so multi-page letters are handled together.
4. Reply with a plain-language summary, key dates and deadlines, and next steps. Legal or court documents include a short note to check with the case worker.
5. Delete the image after processing by default. Later, offer *"Save to my documents?"* to file it in the Documents tab. Confirm the Gemini tier doesn't keep inputs for training.

### Nearby resources

- Reuse the `ResourceQuery` path, with the `clientNeeds` mapping applied on the server.
- **Origin:** profile address, or a place the user names (for example "near West End station"), geocoded on the server.
- **Recovery is never inferred.** The bot searches the addiction category only when the user asks.

**List reply:** 3–5 numbered `ResourceSummary` lines (name, distance, open now, transit badge), then *"Reply 1–5 for details, MORE for more."* `MORE` maps to `next_cursor`.

**Detail reply:**

- Address, tappable phone number, hours, and hours note
- Who it serves
- Documents to bring, compared against the client's ID records (*"You'll need an SSN card, and we don't have one on file"*)
- Nearest stops
- Verified / last-checked line; unverified results are clearly marked or left out

**Fair-chance jobs:** a text stepper over `JobStep[]`, advanced with `NEXT`.

### Local map

- Generate a static map on the server with `MAPS_API_KEY`. Numbered markers match the numbered list; transit stops are optional.
- Send it as an attachment, with a transit-mode directions link per resource. The resource is the destination and "current location" is the origin.
- Never put the client's exact home on the image or in links. Center on the area instead.
- **Later:** an `app()` card opening the `ResourceMap` component on a short-lived, token-protected page for iMessage users.

## Data and backend additions

**`tables.py`**

| Table | Fields |
|---|---|
| `BotEnrollment` | client, phone (encrypted, plus hashed lookup), channel, consent date, enrolled by, status |
| `BotSession` | state, failed attempts, expiry, last results, pending-attachment reference |
| `BotAuditLog` | intent, timestamp, outcome — no message content |

**Files**

```
backend/app/
  routers/bot.py              inbound endpoint for the sidecar + client-scoped tools
  services/                   shared logic used by case-worker routes and the bot
  tables.py                   + BotEnrollment, + BotSession, + BotAuditLog

textbot/                      Bun/Node sidecar running spectrum-ts

frontend/src/
  ClientPage                  + texting enrollment toggle
  ResourceDrawer.tsx          "Text to client" sends a notify-only message
```

## Rollout

| Phase | Scope |
|---|---|
| 1. Foundation | Secret rotation, Spectrum project and dedicated line, sidecar, enrollment, sign-in state machine, STOP/HELP, crisis reply, audit log |
| 2. Schedule | Daily and weekly views, opt-in nudges |
| 3. Resources | Search, details, pagination |
| 4. Maps | Static images, directions links |
| 5. Photos | Simplify and translate |
| 6. Polish | Full Spanish pass, job walkthrough, iMessage PIN pad and interactive map |

Pilot each phase with a few case workers and clients before going wide. Test on an older Android phone over plain SMS, the worst-case channel.

## Assumptions and open questions

- **Calendar source:** assumed to be appointments stored in the app. If it's Google Calendar or another outside source, the schedule phase needs a sync job and consent flow first.
- **RCS/SMS fallback:** confirm availability on the chosen Photon plan.
- **Crisis exception:** needs a policy decision.

## References

- Photon Spectrum docs: https://photon.codes/docs
- `spectrum-ts` repo: https://github.com/photon-hq/spectrum-ts
- Spectrum Cloud dashboard: https://app.photon.codes
