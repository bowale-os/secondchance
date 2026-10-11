import type { KeepState } from "../../lib/reader";

interface Props {
  state: KeepState;
  onKeep: () => void;
  onDrop: () => void;
  onDone: () => void;
}

/** Pinned under the results: keep the paper or let it go. Nothing is saved until Keep. */
export default function KeepBar({ state, onKeep, onDrop, onDone }: Props) {
  return (
    <div className="keep-bar" role="region" aria-label="Keep this paper">
      {state.status === "kept" ? (
        <>
          <p role="status">Kept. Your to-dos are in My papers.</p>
          <button type="button" className="dash-btn" onClick={onDone}>Done</button>
        </>
      ) : state.status === "dropped" ? (
        <>
          <p role="status">Not kept. Nothing was saved.</p>
          <button type="button" className="dash-btn" onClick={onDone}>Done</button>
        </>
      ) : (
        <>
          <p className="keep-ask">
            Keep this paper? Your case worker will be able to see it, and your to-dos go to My papers.
          </p>
          {state.status === "error" && <p className="dash-error" role="alert">{state.message}</p>}
          <div className="keep-buttons">
            <button type="button" className="dash-btn" onClick={onKeep} disabled={state.status === "saving"}>
              {state.status === "saving" ? "Keeping…" : "Keep this paper"}
            </button>
            <button type="button" className="dash-btn dash-btn-quiet" onClick={onDrop} disabled={state.status === "saving"}>
              Done, don't keep
            </button>
          </div>
        </>
      )}
    </div>
  );
}
