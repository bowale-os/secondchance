import type { HelpTopic } from "../../types";
import { KIND_LABELS } from "./HelpLinkBadge";
import "./learn.css";

/**
 * A topic's main link, shown in place elsewhere in the app (for example under "photo ID ✗ missing"),
 * so nobody has to leave what they are doing to find the guide.
 */
export default function GuideLink({ topic }: { topic: HelpTopic | undefined }) {
  const link = topic?.links[0];
  if (!topic || !link) return null;
  return (
    <p className="guide-link">
      Guide: {topic.title.en}.{" "}
      <a href={link.url} target="_blank" rel="noopener noreferrer">
        {link.label}
        {link.kind === "pdf" ? " (PDF)" : ` (${KIND_LABELS[link.kind]}, ${link.source})`}
        <span className="help-sr"> (opens on another site)</span>
      </a>
    </p>
  );
}
