import { useEffect, useState } from "react";
import type { DocumentCheck, JobStep, RequiredDocument } from "../../types";
import StepHeader from "../new-client/StepHeader";
import DocumentList from "./DocumentList";
import "../new-client/new-client.css";

/** Used when the backend sends no steps for a job. */
function defaultSteps(requiredDocuments: RequiredDocument[]): JobStep[] {
  return [
    { title: "Check eligibility", detail: "Read the job requirements together and make sure the shifts and pay work for the client." },
    {
      title: "Gather documents",
      detail: "Get these together before applying.",
      documents: requiredDocuments.length ? requiredDocuments : ["photo_id", "ssn_card"],
    },
    { title: "Apply", detail: "Fill out the application. Answer questions about records honestly; this employer hires people with records." },
    { title: "Prepare for the interview", detail: "Practice explaining the gap in work history briefly and focusing on what comes next. Plan the route there." },
    { title: "Follow up", detail: "Call or email a few days after applying or interviewing to check on the application." },
  ];
}

const STORAGE_PREFIX = "resources.jobProgress.";

/** Saved step number (1-based; total + 1 = finished). Storage can be missing or blocked, so fall back to 1. */
function readProgress(key: string | undefined): number {
  if (!key) return 1;
  try {
    const n = Number(localStorage.getItem(STORAGE_PREFIX + key));
    return Number.isInteger(n) && n >= 1 ? n : 1;
  } catch {
    return 1;
  }
}

function writeProgress(key: string | undefined, step: number) {
  if (!key) return;
  try {
    localStorage.setItem(STORAGE_PREFIX + key, String(step));
  } catch {
    // Not saved; the walkthrough still works for this visit.
  }
}

interface Props {
  steps: JobStep[];
  /** Fills the "Gather documents" step when the backend sends no steps. */
  requiredDocuments: RequiredDocument[];
  /** The resource's document_checks: null outside a client context. */
  checks: DocumentCheck[] | null;
  /** Remembers progress under this key, e.g. `${clientId}:${resourceId}`. */
  progressKey?: string;
}

/** Fair-chance job application, one step at a time; the documents step shows the server's document checks. */
export default function JobWalkthrough({ steps: fromBackend, requiredDocuments, checks, progressKey }: Props) {
  const steps = fromBackend.length ? fromBackend : defaultSteps(requiredDocuments);
  const total = steps.length;
  const [step, setStep] = useState(() => Math.min(readProgress(progressKey), total + 1));

  useEffect(() => writeProgress(progressKey, step), [progressKey, step]);

  const finished = step > total;
  const current = steps[Math.min(step, total) - 1];

  return (
    <div className="res-walkthrough">
      <StepHeader
        step={step}
        total={total}
        labels={steps.map((s) => s.title)}
        headingLevel={3}
        title={finished ? "All steps done" : `Step ${step}: ${current.title}`}
      />

      {finished ? (
        <p>Every step is marked done. Start over if the client is applying again.</p>
      ) : (
        <>
          <p>{current.detail}</p>
          {current.documents && current.documents.length > 0 && (
            <DocumentList documents={current.documents} checks={checks} />
          )}
        </>
      )}

      <div className="res-walkthrough-actions">
        {step > 1 && (
          <button type="button" className="dash-btn dash-btn-quiet" onClick={() => setStep(finished ? 1 : step - 1)}>
            {finished ? "Start over" : "Back"}
          </button>
        )}
        {!finished && (
          <button type="button" className="dash-btn" onClick={() => setStep(step + 1)}>
            {step === total ? "Mark done" : "Done, next step"}
          </button>
        )}
      </div>
    </div>
  );
}
