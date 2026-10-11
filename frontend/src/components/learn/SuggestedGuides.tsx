import { suggestedGuides } from "../../lib/clientNeeds";
import { helpTopic } from "../../lib/commonHelp";
import type { ClientDetail, ClientRead } from "../../types";
import HelpLinkBadge from "./HelpLinkBadge";
import "./learn.css";

interface Props {
  /** Pass the full ClientDetail when there is one, so ID and SNAP records are checked too. */
  client: ClientRead | ClientDetail;
  role: "staff" | "client";
}

/** A strip of Learn guides that fit this client's profile. Shows nothing when none apply. */
export default function SuggestedGuides({ client, role }: Props) {
  const items = suggestedGuides(client).flatMap((s) => {
    const topic = helpTopic(s.topicId);
    return topic && topic.links[0] ? [{ ...s, topic, link: topic.links[0] }] : [];
  });
  if (items.length === 0) return null;

  return (
    <section className="suggested-guides" aria-labelledby="suggested-guides-heading">
      <h2 id="suggested-guides-heading">{role === "staff" ? "Suggested guides" : "Guides for you"}</h2>
      <ul>
        {items.map(({ topicId, reason, topic, link }) => (
          <li key={topicId}>
            <a className="help-link" href={link.url} target="_blank" rel="noopener noreferrer">
              <HelpLinkBadge kind={link.kind} />
              <span className="help-link-text">
                <span className="help-link-label">
                  {topic.title.en}
                  {link.kind === "pdf" && " (PDF)"}
                </span>
                <span className="help-link-meta">{role === "staff" ? `Because: ${reason}` : link.source}</span>
              </span>
              <span className="help-sr">(opens on another site)</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
