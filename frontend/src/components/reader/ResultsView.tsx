import { useEffect, useRef, useState, type ReactNode } from "react";
import { DISCLAIMER, DOC_TYPE_LABELS, flagsFor } from "../../lib/reader";
import { formatDate } from "../../lib/format";
import type { ReadingResult } from "../../types/reader";
import ActionCard from "./ActionCard";
import FlagNote from "./FlagNote";
import ListenTab from "./ListenTab";
import SimpleTab from "./SimpleTab";

type Tab = "todo" | "simple" | "listen";
const TABS: { tab: Tab; label: string }[] = [
  { tab: "todo", label: "To-do" },
  { tab: "simple", label: "Simple version" },
  { tab: "listen", label: "Listen" },
];

interface Props {
  result: ReadingResult;
  /** The client's language: what the simple version and to-dos are written in. */
  language: string;
  /** Kept papers only: check a to-do off. */
  onToggle?: (actionId: string, done: boolean) => Promise<void>;
  /** Pinned at the bottom (the Keep bar for a new reading). */
  footer?: ReactNode;
  /** Extra buttons under the heading (Back, Remove...). */
  actions?: ReactNode;
}

/** A finished reading: To-do, Simple version and Listen tabs, with the disclaimer. */
export default function ResultsView({ result, language, onToggle, footer, actions }: Props) {
  const [tab, setTab] = useState<Tab>("todo");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  const { meta, flags } = result;
  const loose = flags.filter((f) => !f.actionId);

  return (
    <section className="dash-panel reader-results" aria-labelledby="reader-results-heading">
      <div className="reader-results-head">
        <p className="today-type">{DOC_TYPE_LABELS[meta.docType]}</p>
        <h2 id="reader-results-heading" ref={heading} tabIndex={-1}>{meta.title}</h2>
        <p className="hint">
          {[meta.issuer, meta.documentDate && `Dated ${formatDate(meta.documentDate)}`].filter(Boolean).join(" · ")}
        </p>
        {actions && <div className="reader-head-actions">{actions}</div>}
      </div>

      <p className="reader-disclaimer">{DISCLAIMER}</p>
      <FlagNote flags={loose} />

      <div className="reader-tabs" role="tablist" aria-label="How to see this paper">
        {TABS.map((t) => (
          <button
            key={t.tab}
            type="button"
            role="tab"
            id={`reader-tab-${t.tab}`}
            aria-selected={tab === t.tab}
            aria-controls={`reader-panel-${t.tab}`}
            className={`reader-tab${tab === t.tab ? " is-active" : ""}`}
            onClick={() => setTab(t.tab)}
          >
            {t.label}
            {t.tab === "todo" && ` (${result.actions.filter((a) => !a.completed).length})`}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`reader-panel-${tab}`} aria-labelledby={`reader-tab-${tab}`} className="reader-panel">
        {tab === "todo" &&
          (result.actions.length ? (
            <ul className="action-list">
              {result.actions.map((a) => (
                <ActionCard
                  key={a.id}
                  action={a}
                  flags={flagsFor(flags, a.id)}
                  onToggle={onToggle ? (done) => onToggle(a.id, done) : undefined}
                />
              ))}
            </ul>
          ) : (
            <p className="hint">This paper doesn't ask you to do anything.</p>
          ))}
        {tab === "simple" && <SimpleTab simplified={result.simplified} />}
        {tab === "listen" && <ListenTab result={result} language={language} />}
      </div>

      {footer}
    </section>
  );
}
