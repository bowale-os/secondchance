import { useEffect, useRef, useState, type ReactNode } from "react";
import { errorText } from "../../lib/errors";
import { formatDate, humanize } from "../../lib/format";
import type { OpeningHours, RequiredDocument, Resource } from "../../types";
import {
  ACCESS_LABELS,
  CATEGORY_LABELS,
  COST_LABELS,
  DAY_NAMES,
  DOCUMENT_LABELS,
  GENDER_LABELS,
  RECORDS_LABELS,
  VERIFICATION_LABELS,
  formatMiles,
  formatPhone,
  formatStart,
  formatTime,
  languageName,
  safeLink,
  todayIndex,
} from "./labels";
import TransitBadge from "./TransitBadge";

interface Props {
  resourceId: string;
  /** GET /resources/{id}, from whichever API (staff or client) the page uses. */
  load: (id: string) => Promise<Resource>;
  onClose: () => void;
  /** With a client selected: true if they have this document, false if missing, null if unknown. */
  hasDocument?: (doc: RequiredDocument) => boolean | null;
}

/**
 * Full details for one resource. A modal <dialog>: the browser traps focus inside it and
 * closes it on Escape; focus goes back to whatever opened it.
 */
export default function ResourceDrawer({ resourceId, load, onClose, hasDocument }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [resource, setResource] = useState<Resource | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => opener?.focus();
  }, []);

  useEffect(() => {
    let current = true;
    setResource(null);
    setError(null);
    load(resourceId)
      .then((r) => current && setResource(r))
      .catch((e) => current && setError(errorText(e)));
    return () => {
      current = false;
    };
  }, [resourceId, load]);

  return (
    <dialog
      ref={dialogRef}
      className="res-drawer"
      aria-labelledby="res-drawer-title"
      onCancel={(e) => {
        e.preventDefault(); // let React unmount it rather than the browser closing it
        onClose();
      }}
      onClick={(e) => e.target === dialogRef.current && onClose()} // backdrop click
    >
      <div className="res-drawer-body">
        <div className="res-drawer-head">
          <h2 id="res-drawer-title">{resource?.name ?? (error ? "Couldn't load this resource" : "Loading…")}</h2>
          <button type="button" className="dash-btn dash-btn-quiet" onClick={onClose}>
            Close
          </button>
        </div>

        {error && <p className="dash-error" role="alert">{error}</p>}
        {resource && <Details resource={resource} hasDocument={hasDocument} />}
      </div>
    </dialog>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="res-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Details({ resource: r, hasDocument }: { resource: Resource; hasDocument?: Props["hasDocument"] }) {
  const serves = [
    GENDER_LABELS[r.gender],
    r.families_welcome ? "Families welcome" : null,
    RECORDS_LABELS[r.records_policy],
    r.languages.length ? `Speaks ${r.languages.map(languageName).join(", ")}` : null,
    COST_LABELS[r.cost_type],
  ].filter(Boolean);

  return (
    <>
      <div className="res-badges res-drawer-badges">
        <span className="res-badge res-badge-transit">{CATEGORY_LABELS[r.category]}</span>
        <span className={`res-badge res-badge-${r.verification}`}>{VERIFICATION_LABELS[r.verification]}</span>
      </div>
      <p>{r.description}</p>

      <Section title="Where">
        {r.address ? (
          <address className="res-address">
            {r.address.street}
            <br />
            {r.address.city}, {r.address.state} {r.address.zip}
          </address>
        ) : (
          <p>No walk-in address. Reach them by phone.</p>
        )}
        {/* Step 7: one-pin ResourceMap goes here when r.location is set. */}
        {r.phone && (
          <a className="dash-btn res-call" href={`tel:${r.phone}`}>
            Call {formatPhone(r.phone)}
          </a>
        )}
      </Section>

      <Section title="When">
        <Hours hours={r.hours} />
        {r.hours_note && <p className="res-note">{r.hours_note}</p>}
      </Section>

      <CategoryDetails resource={r} />

      <Section title="Who it serves">
        <ul className="res-list">
          {serves.map((s) => <li key={s}>{s}</li>)}
        </ul>
        {r.restrictions_note && <p className="res-note">{r.restrictions_note}</p>}
      </Section>

      <Section title="How to get in">
        {r.access_methods.length > 0 && <p>{r.access_methods.map((a) => ACCESS_LABELS[a]).join(" · ")}</p>}
        {r.required_documents.length > 0 ? (
          <>
            <p className="res-subhead">Bring:</p>
            <DocumentList documents={r.required_documents} hasDocument={hasDocument} />
          </>
        ) : (
          <p>No documents needed.</p>
        )}
      </Section>

      <Section title="Getting there">
        <TransitBadge near={r.near_transit} stop={r.nearest_stops[0]} />
        {r.nearest_stops.length > 0 ? (
          <ul className="res-list">
            {r.nearest_stops.map((s) => (
              <li key={s.stop_name}>
                <strong>{s.stop_name}</strong>, {formatMiles(s.distance_m)}
                {s.routes.length > 0 && <span className="res-muted"> · Routes {s.routes.join(", ")}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p>No transit stops on file.</p>
        )}
      </Section>

      <Section title="Can I trust this?">
        <p>
          <span className={`res-badge res-badge-${r.verification}`}>{VERIFICATION_LABELS[r.verification]}</span>{" "}
          {r.last_verified_at ? `Last checked ${formatDate(r.last_verified_at.slice(0, 10))}.` : "Not checked by a person yet."}
        </p>
        <ExternalLink label="Source" url={r.source_url} />
        <ExternalLink label="Website" url={r.website} />
      </Section>
    </>
  );
}

function ExternalLink({ label, url }: { label: string; url: string | null }) {
  const link = safeLink(url);
  if (!link) return null;
  return (
    <p className="res-muted">
      {label}: <a href={link.href} target="_blank" rel="noopener noreferrer">{link.host}</a>
    </p>
  );
}

/** The whole week, Monday first, with today marked. A day can have several entries. */
function Hours({ hours }: { hours: OpeningHours[] }) {
  if (hours.length === 0) return <p>Hours not listed. Call ahead.</p>;
  const today = todayIndex();
  return (
    <table className="res-hours">
      <tbody>
        {DAY_NAMES.map((name, day) => {
          const entries = hours.filter((h) => h.day === day);
          return (
            <tr key={name} className={day === today ? "res-today" : undefined} aria-current={day === today ? "date" : undefined}>
              <th scope="row">{name}{day === today && " (today)"}</th>
              <td>
                {entries.length === 0
                  ? "Closed"
                  : entries.map((h, i) => (
                      <span key={i} className="res-hours-entry">
                        {formatTime(h.opens)} – {formatTime(h.closes)}
                        {h.label && <span className="res-muted"> ({h.label})</span>}
                      </span>
                    ))}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Documents to bring; with a client selected, each says whether they have it. */
export function DocumentList({ documents, hasDocument }: { documents: RequiredDocument[]; hasDocument?: Props["hasDocument"] }) {
  return (
    <ul className="res-list">
      {documents.map((d) => {
        const has = hasDocument?.(d) ?? null;
        return (
          <li key={d} className={has === false ? "res-doc-missing" : undefined}>
            {DOCUMENT_LABELS[d]}
            {has === true && <span className="res-doc-has"> ✓ on file</span>}
            {has === false && <strong> ✗ missing, get this first</strong>}
          </li>
        );
      })}
    </ul>
  );
}

function CategoryDetails({ resource: r }: { resource: Resource }) {
  switch (r.category) {
    case "shelter": {
      const d = r.details;
      const facts = [
        d.check_in_time && `Check in at ${formatTime(d.check_in_time)}`,
        d.curfew && `Curfew ${formatTime(d.curfew)}`,
        d.max_stay_days !== null && `Stay up to ${d.max_stay_days} days`,
        d.sober_required && "Must be sober",
      ].filter(Boolean) as string[];
      return facts.length ? <Section title="Shelter rules"><ul className="res-list">{facts.map((f) => <li key={f}>{f}</li>)}</ul></Section> : null;
    }
    case "food": {
      const d = r.details;
      return (
        <Section title="Food">
          <p>{d.kind.map(humanize).join(" · ").replace("Snap help", "SNAP help")}</p>
          {d.visit_limit && <p className="res-note">{d.visit_limit}</p>}
        </Section>
      );
    }
    case "jobs": {
      const d = r.details;
      return (
        <Section title="The job">
          <ul className="res-list">
            <li>Employer: {d.employer}</li>
            {d.pay_note && <li>Pay: {d.pay_note}</li>}
            {d.shift_note && <li>Shifts: {d.shift_note}</li>}
          </ul>
          {/* Step 5: JobWalkthrough (d.steps) goes here. */}
          <ExternalLink label="Apply at" url={d.apply_url} />
        </Section>
      );
    }
    case "addiction": {
      const d = r.details;
      return (
        <Section title="Recovery support">
          <p>{d.setting.map(humanize).join(" · ")}</p>
          {d.medication_assisted && <p>Offers medication-assisted treatment.</p>}
        </Section>
      );
    }
    case "classes":
    case "events": {
      const d = r.details;
      return (
        <Section title={r.category === "classes" ? "Class" : "Event"}>
          <ul className="res-list">
            {d.starts_at && <li>Starts {formatStart(d.starts_at)}</li>}
            {d.ends_at && <li>Ends {formatStart(d.ends_at)}</li>}
            {d.recurrence && <li>{d.recurrence}</li>}
            <li>{d.signup_required ? "Sign-up required" : "No sign-up needed"}</li>
          </ul>
        </Section>
      );
    }
  }
}
