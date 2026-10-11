import { useCallback, useEffect, useState } from "react";
import { useApi } from "../../api";
import { errorText } from "../../lib/errors";
import { formatDate, humanize } from "../../lib/format";
import type { ClientDetail } from "../../types";
import type { PaperListItem, ProgressEvent, ReadingView } from "../../types/reader";
import Processing from "../reader/Processing";
import ReadFlow from "../reader/ReadFlow";
import ResultsView from "../reader/ResultsView";
import ScheduleForm from "../reader/ScheduleForm";
import "../reader/reader.css";

interface Props {
  client: ClientDetail;
  onOpen: (id: string) => void;
  onDownload: (id: string, filename: string) => void;
  /** Reload the client (document statuses and counts changed). */
  onChanged: () => void;
}

/** Types the reader can open: photos, PDFs and Word files. */
const READABLE = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/;

/** Each document with its reading and to-dos. Case workers can read papers that have no
 * reading yet, add to-dos to the schedule, mark papers reviewed, and read a new paper with
 * the client (same flow as the portal, with Keep). */
export default function DocumentsTab({ client, onOpen, onDownload, onChanged }: Props) {
  const api = useApi();
  const [papers, setPapers] = useState<PaperListItem[]>([]);
  const [open, setOpen] = useState<Record<string, ReadingView>>({});
  const [reading, setReading] = useState<{ docId: string; events: ProgressEvent[] } | null>(null);
  const [scheduling, setScheduling] = useState<string | null>(null);
  const [withClient, setWithClient] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPapers = useCallback(
    () => api.reader.clientPapers(client.id).then(setPapers).catch((e) => setError(errorText(e))),
    [api, client.id],
  );
  useEffect(() => { loadPapers(); }, [loadPapers]);

  const paperFor = (docId: string) => papers.find((p) => p.documentId === docId);

  async function refresh(readingId: string) {
    const view = await api.reader.paper(readingId);
    setOpen((all) => ({ ...all, [view.documentId]: view }));
  }

  async function toggleReading(docId: string, readingId: string) {
    if (open[docId]) {
      setOpen(({ [docId]: _closed, ...rest }) => rest);
      return;
    }
    try {
      await refresh(readingId);
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function readStored(docId: string) {
    setError(null);
    setReading({ docId, events: [] });
    let savedId: string | undefined;
    await api.reader.readStored(docId, (e) => {
      setReading((r) => (r && r.docId === docId ? { docId, events: [...r.events, e] } : r));
      if (e.stage === "done") savedId = e.readingId;
    });
    if (savedId) {
      setReading(null);
      await loadPapers();
      await refresh(savedId).catch(() => {});
      onChanged();
    }
  }

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorText(e));
    }
  }

  if (withClient) {
    return (
      <ReadFlow
        reader={api.reader}
        language={client.language}
        clientId={client.id}
        onClose={(kept) => {
          setWithClient(false);
          if (kept) {
            loadPapers();
            onChanged();
          }
        }}
      />
    );
  }

  return (
    <>
      <div className="docs-head">
        <p className="hint">Papers the client kept show here with their to-dos. Add a to-do to the schedule once you've checked it.</p>
        <button type="button" className="dash-btn" onClick={() => setWithClient(true)}>Read a paper with this client</button>
      </div>
      {error && <p className="dash-error" role="alert">{error}</p>}

      {client.documents.length === 0 ? (
        <p className="dash-empty">No documents.</p>
      ) : (
        <ul className="row-list">
          {client.documents.map((d) => {
            const paper = paperFor(d.id);
            const view = open[d.id];
            const isReading = reading?.docId === d.id;
            return (
              <li key={d.id} className="record">
                <div className="record-main">
                  <div className="record-title">
                    {paper?.title ?? d.original_filename ?? "Document"} <span className="doc-type">{humanize(d.doc_type)}</span>{" "}
                    {d.status === "read" && <span className="doc-status">Needs review</span>}
                  </div>
                  <div className="record-details">
                    Added {formatDate(d.created_at.slice(0, 10))}
                    {paper && ` · ${paper.openCount} open to-do${paper.openCount === 1 ? "" : "s"}`}
                    {paper && (paper.keptByCaseWorker ? " · kept by a case worker" : " · kept by the client")}
                  </div>
                  {!paper && d.ai_summary && <p className="doc-summary">{d.ai_summary}</p>}
                  {!paper && d.ai_warnings?.map((w) => <p key={w} className="doc-warning">⚠ {w}</p>)}
                </div>
                <div className="doc-actions">
                  <button type="button" className="dash-btn dash-btn-quiet" onClick={() => onOpen(d.id)}>View</button>
                  <button type="button" className="dash-btn dash-btn-quiet" onClick={() => onDownload(d.id, d.original_filename ?? "document")}>
                    Download
                  </button>
                  {paper ? (
                    <button type="button" className="dash-btn dash-btn-quiet" aria-expanded={!!view}
                      onClick={() => toggleReading(d.id, paper.readingId)}>
                      {view ? "Hide reading" : "Show reading"}
                    </button>
                  ) : (
                    d.mime_type && READABLE.test(d.mime_type) && (
                      <button type="button" className="dash-btn dash-btn-quiet" disabled={!!reading} onClick={() => readStored(d.id)}>
                        Read this paper
                      </button>
                    )
                  )}
                  {d.status === "read" && (
                    <button type="button" className="dash-btn" onClick={() => run(async () => { await api.reader.markReviewed(d.id); onChanged(); })}>
                      Mark reviewed
                    </button>
                  )}
                </div>

                {isReading && (
                  <div className="doc-reading">
                    <Processing events={reading.events} onRetry={() => readStored(d.id)} onCancel={() => setReading(null)} />
                  </div>
                )}
                {view && (
                  <div className="doc-reading">
                    <ResultsView
                      result={view}
                      language={view.language || client.language}
                      noFocus
                      onToggle={(actionId, done) => run(async () => { await api.reader.setDone(actionId, done); await refresh(view.id); loadPapers(); })}
                      actionExtra={(a) =>
                        a.checkedByCaseWorker ? (
                          <p className="on-schedule">✓ On the schedule</p>
                        ) : scheduling === a.id ? (
                          <ScheduleForm
                            action={a}
                            onCancel={() => setScheduling(null)}
                            onSave={async (body) => {
                              await api.reader.schedule(a.id, body);
                              setScheduling(null);
                              await refresh(view.id);
                            }}
                          />
                        ) : (
                          <button type="button" className="dash-btn dash-btn-quiet" onClick={() => setScheduling(a.id)}>
                            Add to schedule
                          </button>
                        )
                      }
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
