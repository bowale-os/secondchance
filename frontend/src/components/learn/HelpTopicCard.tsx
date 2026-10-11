import type { HelpLink, HelpTopic, ResourceQuery } from "../../types";
import HelpLinkBadge from "./HelpLinkBadge";

interface Props {
  topic: HelpTopic;
  role: "staff" | "client";
  /** Opens Resources with the topic's filter. Leave out to hide the "Find ... nearby" button. */
  onFindNearby?: (filters: ResourceQuery) => void;
}

/** "2026-10-10" -> "Oct 2026". */
function checkedLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/** One help topic: title, a plain-language summary, and its links. */
export default function HelpTopicCard({ topic, role, onFindNearby }: Props) {
  const headingId = `help-${topic.id}`;
  const filter = topic.related?.resourceFilter;
  return (
    <article className="help-card" aria-labelledby={headingId}>
      <h3 id={headingId}>{topic.title.en}</h3>
      <p>{topic.summary.en}</p>
      <ul className="help-links">
        {topic.links.map((link) => (
          <li key={link.url}>
            <LinkRow link={link} role={role} />
          </li>
        ))}
      </ul>
      {filter && onFindNearby && (
        <button type="button" className="dash-btn help-find" onClick={() => onFindNearby(filter)}>
          {topic.related?.findLabel ?? "Find help nearby"}
        </button>
      )}
    </article>
  );
}

function LinkRow({ link, role }: { link: HelpLink; role: Props["role"] }) {
  const checked = checkedLabel(link.last_checked);
  return (
    <div className="help-link-row">
      {/* Videos open on their own site too: no embeds, so nothing autoplays on metered data. */}
      <a className="help-link" href={link.url} target="_blank" rel="noopener noreferrer">
        <HelpLinkBadge kind={link.kind} />
        <span className="help-link-text">
          <span className="help-link-label">
            {link.label}
            {link.kind === "pdf" && " (PDF)"}
          </span>
          <span className="help-link-meta">
            {link.source}
            {checked && ` · Checked ${checked}`}
          </span>
        </span>
        <span className="help-sr">(opens on another site)</span>
      </a>
      {role === "staff" && (
        <button type="button" className="dash-btn dash-btn-quiet help-send" disabled title="Coming soon">
          Text to client
        </button>
      )}
    </div>
  );
}
