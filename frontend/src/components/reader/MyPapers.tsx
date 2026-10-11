import { useCallback, useEffect, useState } from "react";
import type { ClientApi } from "../../api";
import { errorText } from "../../lib/errors";
import { formatDate, humanize } from "../../lib/format";
import { DOC_TYPE_LABELS, dueWords } from "../../lib/reader";
import type { DocumentListItem } from "../../types";
import type { PaperListItem, ReadingView, UpcomingItem } from "../../types/reader";
import ActionCard from "./ActionCard";
import ResultsView from "./ResultsView";
import "./reader.css";

interface Props {
  api: ClientApi;
  language: string;
  /** Opens the read flow. */
  onRead: () => void;
  /** Bumped by the page after a paper is kept, to reload. */
  refreshKey: number;
  /** Tells Home when to-dos change, so Next up stays current. */
  onChanged: () => void;
}

/** The client's kept papers: open to-dos from all of them (Upcoming), or every paper on
 * file (All papers), including ones that were never read. */
export default function MyPapers({ api, language, onRead, refreshKey, onChanged }: Props) {
  const [view, setView] = useState<"upcoming" | "all">("upcoming");
  const [upcoming, setUpcoming] = useState<UpcomingItem[] | null>(null);
  const [papers, setPapers] = useState<PaperListItem[] | null>(null);
  const [docs, setDocs] = useState<DocumentListItem[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<ReadingView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.reader.upcoming().then(setUpcoming).catch((e) => setError(errorText(e)));
    api.reader.papers().then(setPapers).catch((e) => setError(errorText(e)));
    api.auth.documents().then(setDocs).catch(() => setDocs([]));
  }, [api]);

  useEffect(load, [load, refreshKey]);

  async function toggle(actionId: string, done: boolean) {
    try {
      await api.reader.setDone(actionId, done);
    } catch (e) {
      setError(errorText(e));
      return;
    }
    if (open) setOpen(await api.reader.paper(open.id));
    load();
    onChanged();
  }

  async function openPaper(readingId: string) {
    try {
      setOpen(await api.reader.paper(readingId));
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function remove(paper: ReadingView) {
    if (!window.confirm(`Remove "${paper.meta.title}"? The paper and its to-dos will be deleted.`)) return;
    try {
      await api.reader.remove(paper.id);
      setOpen(null);
      load();
      onChanged();
    } catch (e) {
      setError(errorText(e));
    }
  }

  const run = (action: () => Promise<unknown>) => action().catch((e) => setError(errorText(e)));

  if (open) {
    const listed = papers?.find((p) => p.readingId === open.id);
    return (
      <ResultsView
        result={open}
        language={open.language || language}
        onToggle={toggle}
        actions={
          <>
            <button type="button" className="dash-btn dash-btn-quiet" onClick={() => setOpen(null)}>Back to my papers</button>
            <button type="button" className="dash-btn dash-btn-quiet" onClick={() => run(() => api.documents.open(open.documentId))}>
              See the original
            </button>
            {listed && !listed.keptByCaseWorker && (
              <button type="button" className="dash-btn dash-btn-quiet" onClick={() => remove(open)}>Remove this paper</button>
            )}
          </>
        }
      />
    );
  }

  const readDocIds = new Set((papers ?? []).map((p) => p.documentId));
  const otherDocs = docs.filter((d) => !readDocIds.has(d.id));
  const q = query.trim().toLowerCase();
  const shownPapers = (papers ?? []).filter((p) => !q || `${p.title} ${p.issuer ?? ""}`.toLowerCase().includes(q));
  const shownDocs = otherDocs.filter((d) => !q || (d.original_filename ?? "").toLowerCase().includes(q));

  return (
    <section className="dash-panel" aria-labelledby="my-papers-heading">
      <div className="dash-panel-head">
        <h2 id="my-papers-heading">My papers</h2>
        <button type="button" className="dash-btn" onClick={onRead}>Read a paper</button>
      </div>

      <div className="reader-tabs" role="tablist" aria-label="My papers">
        <button type="button" role="tab" aria-selected={view === "upcoming"} className={`reader-tab${view === "upcoming" ? " is-active" : ""}`}
          onClick={() => setView("upcoming")}>
          Upcoming{upcoming ? ` (${upcoming.length})` : ""}
        </button>
        <button type="button" role="tab" aria-selected={view === "all"} className={`reader-tab${view === "all" ? " is-active" : ""}`}
          onClick={() => setView("all")}>
          All papers
        </button>
      </div>

      {error && <p className="dash-error" role="alert">{error}</p>}

      {view === "upcoming" ? (
        !upcoming ? (
          <p className="dash-empty" role="status">Loading your to-dos…</p>
        ) : upcoming.length === 0 ? (
          <p className="dash-empty">No to-dos right now. When you keep a paper, what you need to do shows up here.</p>
        ) : (
          <ul className="action-list">
            {upcoming.map((u) => (
              <ActionCard key={u.action.id} action={u.action} flags={u.flags} paperTitle={u.paperTitle}
                onToggle={(done) => toggle(u.action.id, done)} />
            ))}
          </ul>
        )
      ) : (
        <>
          <label className="papers-search">
            <span>Search my papers</span>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          {!papers ? (
            <p className="dash-empty" role="status">Loading your papers…</p>
          ) : shownPapers.length === 0 && shownDocs.length === 0 ? (
            <p className="dash-empty">{q ? "No papers match." : "No papers yet."}</p>
          ) : (
            <ul className="row-list">
              {shownPapers.map((p) => (
                <li key={p.readingId} className="record">
                  <div className="record-main">
                    <div className="record-title">
                      {p.title} <span className="doc-type">{DOC_TYPE_LABELS[p.docType]}</span>
                    </div>
                    <div className="record-details">
                      Kept {formatDate(p.keptAt.slice(0, 10))}
                      {p.keptByCaseWorker && " by your case worker"}
                      {" · "}
                      {p.openCount ? `${p.openCount} to-do${p.openCount === 1 ? "" : "s"}` : "Nothing to do"}
                      {p.nextDue && ` · next ${dueWords(p.nextDue)}`}
                    </div>
                  </div>
                  <div className="doc-actions">
                    <button type="button" className="dash-btn dash-btn-quiet" onClick={() => openPaper(p.readingId)}>Open</button>
                  </div>
                </li>
              ))}
              {shownDocs.map((d) => (
                <li key={d.id} className="record">
                  <div className="record-main">
                    <div className="record-title">
                      {d.original_filename ?? "Document"} <span className="doc-type">{humanize(d.doc_type)}</span>
                    </div>
                    <div className="record-details">Added {formatDate(d.created_at.slice(0, 10))}</div>
                  </div>
                  <div className="doc-actions">
                    <button type="button" className="dash-btn dash-btn-quiet" onClick={() => run(() => api.documents.open(d.id))}>View</button>
                    <button type="button" className="dash-btn dash-btn-quiet"
                      onClick={() => run(() => api.documents.download(d.id, d.original_filename ?? "document"))}>
                      Download
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
