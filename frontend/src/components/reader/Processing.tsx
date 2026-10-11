import type { ProgressEvent } from "../../types/reader";

const STEPS: { label: string; doneAt: ProgressEvent["stage"] }[] = [
  { label: "Reading your pages", doneAt: "extracted" },
  { label: "Working out what this paper is", doneAt: "classified" },
  { label: "Writing it in plain words", doneAt: "simplified" },
  { label: "Finding what you need to do", doneAt: "actions" },
];

interface Props {
  events: ProgressEvent[];
  onRetry: () => void;
  onCancel: () => void;
}

/** Live steps while the paper is read. Announced politely to screen readers. */
export default function Processing({ events, onRetry, onCancel }: Props) {
  const seen = new Set(events.map((e) => e.stage));
  const error = events.find((e): e is Extract<ProgressEvent, { stage: "error" }> => e.stage === "error");
  const retake = events.find((e): e is Extract<ProgressEvent, { stage: "retake_suggested" }> => e.stage === "retake_suggested");
  const current = STEPS.find((s) => !seen.has(s.doneAt));

  return (
    <section className="dash-panel reader-processing" aria-labelledby="processing-heading">
      <h2 id="processing-heading">{error ? "We couldn't read this paper" : "Reading your paper…"}</h2>

      <ol className="step-list">
        {STEPS.map((s) => {
          const done = seen.has(s.doneAt);
          return (
            <li key={s.label} className={done ? "step-done" : s === current && !error ? "step-now" : "step-wait"}>
              <span aria-hidden="true">{done ? "✓" : s === current && !error ? "…" : "○"}</span> {s.label}
            </li>
          );
        })}
      </ol>

      <div className="sr-only" aria-live="polite">
        {error ? error.message : current ? `${current.label}…` : "Almost done…"}
      </div>

      {retake && (
        <p className="today-late">
          {retake.pages.length === 1 ? `Page ${retake.pages[0]} was` : `Pages ${retake.pages.join(", ")} were`} hard to
          read. You can keep going, or cancel and take {retake.pages.length === 1 ? "that photo" : "those photos"} again.
        </p>
      )}

      {error && <p className="dash-error" role="alert">{error.message}</p>}
      <div className="reader-pick-buttons">
        {error && <button type="button" className="dash-btn" onClick={onRetry}>Try again</button>}
        <button type="button" className="dash-btn dash-btn-quiet" onClick={onCancel}>
          {error ? "Back" : "Cancel"}
        </button>
      </div>
    </section>
  );
}
