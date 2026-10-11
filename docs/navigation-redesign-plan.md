# Navigation redesign plan: side rail + queue (Concept 3)

Four tabs for case workers and clients: **Home, Resources, Calendar, Learn**.
Case workers get a left side rail on laptops and a bottom bar on phones. Clients get the same
four names. Prototype: https://claude.ai/artifact/57iKE7EPdfk6DRXsM8SBek (Concept 3).

## Decisions made

- Layout is Concept 3: left rail with counts, Home is a work queue with a client preview.
- Learn is a placeholder in the frontend. No backend for it yet.
- Calendar events are client obligations. There are no appointments.
- Case workers enter obligations at registration only. After that, clients add their own events.
- Case workers are notified of client-added events (in the app, no push or email). They do not approve or edit them.
- Case workers mark events done (status only). Clients cannot mark done.
- Client-added events are flagged `added_by_client` and keep `verified=False`.

## Design rules (from research)

- Every nav item shows a word next to its icon. No icon-only navigation.
- Plain language, about 5th grade reading level.
- Three to five top-level tabs. Targets at least 48px. Visible focus. `aria-current="page"` on the active tab.
- One clear next step per screen. "Call my case worker" always reachable for clients.
- Tell people where they are and what comes next. Offer choice and a way out.

## Backend (done, uncommitted)

Migration `e6a0c4f29b83` (not yet applied): `due_time`, `location`, `added_by_client`, `staff_seen_at` on
`client_obligations`; `OTHER` in `ObligationType`.

| Who | Endpoint | Purpose |
|---|---|---|
| Client | `GET /auth/client/obligations` | List my events |
| Client | `POST /auth/client/obligations` | Add an event |
| Client | `PUT`, `DELETE /auth/client/obligations/{id}` | Edit or remove an event I added |
| Client | `GET /auth/client/case-worker` | Who to call |
| Case worker | `GET /obligations?from&to&status` | Events across my clients |
| Case worker | `GET /obligations?unseen_only=true` | Notification feed |
| Case worker | `PATCH /obligations/{id}/status` | Mark done or reopen |
| Case worker | `POST /clients/{id}/obligations/seen` | Dismiss notifications |

Still to build on the backend: `GET /clients/attention` (see Phase 4).

## Frontend phases

Each phase should end with `npm run build` passing and its own commit.

### Phase 0: Apply and sync

1. Run `alembic upgrade head` against Neon (confirm with the team first, shared DB).
2. `types/enums.ts`: add `OTHER: "other"` to `ObligationType`.
3. `types/profile.ts` (or wherever `ClientObligationRead` lives): add `due_time`, `location`,
   `added_by_client`, `staff_seen_at`.
4. New `types/event.types.ts`: `EventRead`, `StaffEventRead`, `EventWrite`, `EventStatusUpdate`,
   `CaseWorkerRead`. Export from `types/index.ts`.
5. New `api/events.ts` with `createEventsApi(http)` (staff: `list`, `setStatus`, `markSeen`) and
   `createClientEventsApi(http)` (client: `list`, `add`, `edit`, `remove`). Add `case-worker` to
   `clientAuth.ts`. Register in `api/index.ts` for both `createApi` and `createClientApi`.

### Phase 1: Shared shell and nav

1. `components/layout/AppShell.tsx`: left rail (laptop) / bottom bar (phone), logo, user, log out, skip link,
   `<nav aria-label="Main">`. Takes `role: "staff" | "client"` and an `items` list.
2. `components/layout/nav.ts`: `Section = "home" | "resources" | "calendar" | "learn"`, the labels, and icons
   (inline SVG, always with a text label).
3. `layout.css`: rail, bottom bar, breakpoint (about 720px), 48px targets, focus ring, reduced motion.
4. Update `AppNav` and `App.tsx`: `View` gains `calendar` and `learn`. The client page and new-client flow keep
   living under Home.
5. Move `Dashboard`, `ResourcesPage`, `ClientPage`, `NewClientFlow` inside the shell and delete `AppBar.tsx`.
   Resources has no logic change.

### Phase 2: Calendar

1. Staff `CalendarPage`: week strip plus agenda list grouped Overdue / Today / This week / Later.
   Filter by client. Each row has a "Mark done" button (status only, no edit). Calls `GET /obligations` for the
   visible range.
2. Client `MyCalendar`: same layout, plus an "Add event" form (what, date, time, place, type). Edit and delete
   on events the client added. Registration events are read-only for the client.
3. Event rows use text status pills (Overdue, Today, Done), not color alone.
4. Empty states: "Nothing coming up. Add something you need to remember." (client) and
   "No events in this range." (staff).

### Phase 3: Learn placeholder

1. `LearnPage` with the final layout: topic chips, video card grid, guides list, "Read instead" button.
2. Content is a small static list in `lib/learnContent.ts` clearly marked as sample. No fake data shown as real.
3. Staff see "Assign to client" (disabled with a "Coming soon" note). Clients see "Save for later" (disabled likewise).

### Phase 4: Home

Backend first: `GET /clients/attention` returns, per assigned client, the reasons they need action:
overdue or due-soon obligations, unverified rows, missing or expired IDs, release date soon, no phone,
and unseen client-added events. Keeping the rules on the server avoids one request per client.

Staff Home:
1. `Dashboard` becomes the queue: table of clients sorted by urgency, with reason text and a due pill.
2. Click or press Enter on a row to show a preview panel (reason, key facts, "Open client").
3. "Added by client" notification section fed by `GET /obligations?unseen_only=true`; opening the client or
   "Got it" calls `markSeen`.
4. Keep search and "+ New client". The three stat tiles move to a compact summary row above the queue.
5. Rail shows the count of clients needing action on Home and unseen events on Calendar.

Client Home (replaces `ClientHome` tabs):
1. Greeting, release badge.
2. "Next up" card: soonest open event, with place and time.
3. "Needs you" card: for example a missing ID or an unverified item.
4. "Open near you now": top 2 from `/me/resources`, link to Resources.
5. "Call my case worker" button using `GET /auth/client/case-worker`; show the number as text too.
6. "My information" and documents move to a section under Home (existing `OverviewTab` and `MyDocuments` reused).

### Phase 5: Client shell and polish

1. `ClientHome` renders inside `AppShell` with the same four tab names; Resources reuses `MyResources`.
2. Responsive pass: rail to bottom bar, table to card list on phones, preview becomes a full screen.
3. Accessibility pass: keyboard-only walkthrough, screen reader labels, contrast in `dashboard.css` tokens,
   200% zoom, reduced motion.
4. Replace the old tab styles in `client.css` and `dashboard.css` that are no longer used.

## Testing

- `npm run build` (type-check and bundle) after every phase.
- Manual: log in as a case worker and as a client; add an event as the client; see it appear in the case
  worker's notifications; mark it done as the case worker; confirm the client cannot edit a registration event.
- Backend: add tests for the assignment checks (a case worker cannot read or change another worker's client
  events; a client cannot touch another client's events or registration events). No test setup exists yet,
  so this needs a small pytest harness.
- Usability: put two or three real clients in front of the client Home and Calendar before polishing.

## Risks and open questions

- Shared Neon database: the migration affects everyone. Apply it once, agreed with the team.
- Postgres cannot remove an enum value, so `OTHER` is permanent.
- Notifications are in-app only. If clients should not rely on the app, texting is a separate feature.
- Undated obligations show in the agenda under "No date".
- Nothing yet updates client-added events if a case worker edits the client afterward; revisit if needed.
- The client portal has no rate limiting on event creation. Consider a cap per client.
