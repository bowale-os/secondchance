import { useState } from "react";
import { HELP_SECTIONS, HELP_TOPICS } from "../../lib/commonHelp";
import type { HelpTopic, ResourceQuery } from "../../types";
import HelpTopicCard from "./HelpTopicCard";
import "./learn.css";

interface Props {
  role: "staff" | "client";
  /** Switches to Resources with these filters ("Find SNAP help nearby"). */
  onFindNearby?: (filters: ResourceQuery) => void;
}

/** Everything a search can match on: title, summary, and each link's label and source. */
function searchText(topic: HelpTopic): string {
  return [topic.title.en, topic.summary.en, ...topic.links.flatMap((l) => [l.label, l.source])].join(" ").toLowerCase();
}

function matches(topic: HelpTopic, words: string[]): boolean {
  const text = searchText(topic);
  return words.every((w) => text.includes(w));
}

/** Common Help: hand-picked how-to guides, grouped into sections, with a search box. */
export default function LearnView({ role, onFindNearby }: Props) {
  const [query, setQuery] = useState("");
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = HELP_TOPICS.filter((t) => matches(t, words));

  return (
    <div className="learn">
      <input
        type="search"
        className="dash-search learn-search"
        placeholder="Search guides, like ID or SNAP"
        aria-label="Search guides"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <p className="learn-count" role="status" aria-live="polite">
        {words.length > 0 && `${shown.length} ${shown.length === 1 ? "guide matches" : "guides match"} your search`}
      </p>

      {HELP_SECTIONS.map(({ section, label }) => {
        const topics = shown.filter((t) => t.section === section);
        if (topics.length === 0) return null;
        return (
          <section key={section} aria-labelledby={`learn-${section}`}>
            <h2 id={`learn-${section}`}>{label}</h2>
            <div className="learn-grid">
              {topics.map((t) => <HelpTopicCard key={t.id} topic={t} role={role} onFindNearby={onFindNearby} />)}
            </div>
            {section === "wellbeing" && <CrisisNote />}
          </section>
        );
      })}

      {shown.length === 0 && <p className="learn-empty">No guides match. Try a different word.</p>}
    </div>
  );
}

/** Matches the text bot's crisis reply. */
function CrisisNote() {
  return (
    <p className="help-crisis">
      In crisis? Call or text <a href="tel:988">988</a>. For local help with food, housing, or bills, call{" "}
      <a href="tel:211">211</a>.
    </p>
  );
}
