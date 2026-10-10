# Resources tab: backend contract notes and open items

The frontend for the Resources tab (`frontend/src/components/resources/`, `frontend/src/api/resources.ts`) is coded against the contract below. The backend is being built separately, so until these endpoints exist the screens show the API error.

## Endpoints the frontend calls

| Endpoint | Returns | Who |
|---|---|---|
| `GET /resources` | `ResourceSearchResponse` | staff or client |
| `GET /resources/{id}` | `ResourceRead` (the `Resource` union) | staff or client. Staff on a client's tab add `?client_id=<id>` so `document_checks` is filled for that client |
| `GET /clients/{id}/resources` | `ClientResourceMatch` | staff, for their own assigned client (404 otherwise) |
| `GET /me/resources` | `ClientResourceMatch` | the logged-in client |

Types are in `frontend/src/types/resource.types.ts`.

## Query string format

- **Lists repeat their key**, FastAPI's default for `list[str]`: `?categories=food&categories=jobs`.
- **`origin` is split** into `origin_lat` and `origin_lng`.
- **`GET /resources`** leaves out unset filters, `false` and `""`. There, `near_transit=false` never appears; a filter is either on or absent.
- **`cursor`** is sent back as-is from `next_cursor` for "Show more".

## Overrides on the two client-matching endpoints

`GET /clients/{id}/resources` and `GET /me/resources` take the same query params as **overrides** on top of the profile-derived filters.

- **A key that is present replaces** the profile's value for that key. A key that is absent keeps the profile's value.
- **`false` turns a profile filter off**, for example `near_transit=false` when the case worker removes the "Near transit · from profile" chip.
- **An empty string clears a profile string filter**: `language=` means "don't filter by language."
- **An empty category list can't be sent** (repeated keys send nothing), so the profile's categories apply. This is intended.
- **`AppliedFilter.reason`** should be `"profile"` only for keys that still come from the profile after overrides; overridden keys are `"manual"`. The frontend shows "from profile" notes based on this.
- **Recovery (`addiction`) is never inferred** from medications or medical documents.

The frontend does not reproduce the needs mapping. `frontend/src/lib/clientNeeds.ts` only turns each applied filter into a short reason for the chip ("no car", "housing: homeless"). If the server mapping changes, update the field lists there.

## Request: restore the `jobs` category

Commit `675cb4c` ("edited resource types") removed `jobs`, `JobDetails` and `JobStep`. The product plan keeps **Fair-chance employers** with an application walkthrough, so this branch adds them back in the same style (`ResourceCategory.JOBS`, `JobDetails`, `JobStep`, and the `jobs` member of the `Resource` union). **@Daniel: please restore `jobs` on the backend side**, or let us know if it was dropped on purpose so we can talk it through.

`JobDetails.steps` drives the walkthrough. When it's empty the frontend shows five default steps (check eligibility, gather documents, apply, prepare for the interview, follow up).

## Fields the frontend added to the shared types

- **`ResourceQuery.starts_within_days?: number`**: the "This week" chip sends `7`. It is only offered when Classes or Community events is selected and should limit classes and events to those starting within N days.
- **`TransitStop.lat` / `TransitStop.lng`**: needed to draw stops on the map. The ingest job already geocodes stops from MARTA GTFS; it should store their coordinates too.

## How the frontend reads the revised types

- **`Tri` and `"unknown"`** (`families_welcome`, `sober_required`, `medication_assisted`, `signup_required`, and `unknown` for gender and cost) show as "<topic>: call to confirm", never as "no".
- **`document_checks`** drives the ✓ on file / ✗ missing / ✗ expired marks in the drawer and the job walkthrough. The frontend no longer works these out from the client's ID records.
- **`near_transit: null`** means no location, so no transit badge is shown.
- **`free_only`** has a "Free only" chip.
- **Not used yet:** `field_meta` and `completeness`.

## Conventions to keep in step

- **`OpeningHours.day`: 0 = Monday.** The older second-chance-reader place data used 0 = Sunday, so don't mix the two.
- **Times** are `"HH:MM"`, 24-hour, Atlanta local.
- **`distance_m` and `TransitStop.distance_m`** are straight-line; the UI says "about".
- **`source_url`, `website` and `apply_url`** are shown only if they are `http(s)` URLs. Anything else (for example `javascript:`) is dropped. The backend should still validate them at ingest.

## Left out on purpose (for now)

- **No "Add to plan", "Text to client" or "Verify" buttons.** There are no endpoints for them yet.
- **No distance on the top-level Resources page.** Staff have no office address on file. `ResourcesPage` keeps an `origin` state ready for when staff can enter one.

## Reminders (not done by this change)

- **Rotate the exposed secrets.** The shared setup doc exposed live values for the Gemini API key, the Auth0 client secret, the Neon database URL, `SESSION_SECRET` and `PIN_PEPPER`. Rotate all of them. Changing `PIN_PEPPER` invalidates every client PIN, so clients will need PIN resets. Plan that before rotating.
- **Job walkthrough progress lives in the browser** (`localStorage`, key `resources.jobProgress.<clientId|me|staff>:<resourceId>`). It stores only a step number and does not follow a case worker to another computer.
