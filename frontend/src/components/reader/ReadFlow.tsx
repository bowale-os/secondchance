import { useEffect, useReducer, useRef, useState } from "react";
import type { ReaderApi } from "../../api/reader";
import { errorText } from "../../lib/errors";
import { isUnsaved, keepReducer } from "../../lib/reader";
import type { ProgressEvent, ReadingResult } from "../../types/reader";
import KeepBar from "./KeepBar";
import PagePicker from "./PagePicker";
import Processing from "./Processing";
import ResultsView from "./ResultsView";
import "./reader.css";

interface Props {
  reader: ReaderApi;
  /** The client's language: what the paper is written up in. */
  language: string;
  /** A case worker reading with a client passes the client's id. */
  clientId?: string;
  /** Leave the flow (after Done, Cancel or Back). */
  onClose: (kept: boolean) => void;
  /** Tells the page whether leaving now would lose an unkept result. */
  onUnsavedChange?: (unsaved: boolean) => void;
}

const LEAVE_WARNING = "You haven't kept this paper. If you leave, the reading will be lost.";

/** Pick pages → read them (streamed) → results with Keep / Don't keep. Pages stay in browser
 * memory only; nothing is stored unless the person presses Keep. */
export default function ReadFlow({ reader, language, clientId, onClose, onUnsavedChange }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [step, setStep] = useState<"pick" | "processing" | "results">("pick");
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [result, setResult] = useState<ReadingResult | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [keep, dispatch] = useReducer(keepReducer, { status: "choosing" });
  const abort = useRef<AbortController | null>(null);

  const unsaved = step === "results" && isUnsaved(keep);
  useEffect(() => onUnsavedChange?.(unsaved), [unsaved, onUnsavedChange]);

  // Closing the tab or reloading with an unkept result: the browser asks once.
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = LEAVE_WARNING;
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  // Leaving mid-read stops the request; the server stops reading too.
  useEffect(() => () => abort.current?.abort(), []);

  async function read() {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setEvents([]);
    setStep("processing");

    const partial: Partial<ReadingResult> = {};
    await reader.process(files, (e) => {
      if (controller.signal.aborted) return;
      setEvents((all) => [...all, e]);
      if (e.stage === "classified") partial.meta = e.meta;
      if (e.stage === "simplified") partial.simplified = e.simplified;
      if (e.stage === "actions") {
        partial.actions = e.actions;
        partial.flags = e.flags;
      }
      if (e.stage === "done" && partial.meta && partial.simplified && partial.actions && partial.flags) {
        setResult(partial as ReadingResult);
        setReceipt(e.receipt ?? null);
        setStep("results");
      }
    }, { signal: controller.signal, clientId });
  }

  function cancel() {
    abort.current?.abort();
    onClose(false);
  }

  async function doKeep() {
    if (!receipt) return dispatch({ type: "failed", message: "This reading can't be kept. Please read the paper again." });
    dispatch({ type: "keep" });
    try {
      const saved = await reader.keep(files, receipt, clientId);
      dispatch({ type: "saved", readingId: saved.readingId });
    } catch (e) {
      dispatch({ type: "failed", message: errorText(e) });
    }
  }

  function drop() {
    dispatch({ type: "drop" });
    setFiles([]);   // let go of the pages right away
  }

  if (step === "pick") return <PagePicker files={files} onChange={setFiles} onRead={read} onCancel={cancel} />;
  if (step === "processing" || !result) {
    return <Processing events={events} onRetry={read} onCancel={() => { abort.current?.abort(); setStep("pick"); }} />;
  }
  return (
    <ResultsView
      result={result}
      language={language}
      footer={
        <KeepBar
          state={keep}
          onKeep={doKeep}
          onDrop={drop}
          onDone={() => onClose(keep.status === "kept")}
        />
      }
    />
  );
}

export { LEAVE_WARNING };
