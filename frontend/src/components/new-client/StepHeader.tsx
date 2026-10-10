const STEP_LABELS = ["Upload", "Read", "Review"];

interface Props {
  step: number;
  total: number;
  title: string;
  hint?: string;
  /** Defaults to the new-client flow's steps. */
  labels?: string[];
  /** Defaults to 1; use 3 inside a panel that already has headings. */
  headingLevel?: 1 | 2 | 3;
}

export default function StepHeader({ step, total, title, hint, labels = STEP_LABELS, headingLevel = 1 }: Props) {
  const Heading = `h${headingLevel}` as const;
  return (
    <header className="step-header">
      <ol className="stepper" aria-label={step > total ? `All ${total} steps done` : `Step ${step} of ${total}`}>
        {labels.slice(0, total).map((label, i) => {
          const state = i + 1 < step ? "done" : i + 1 === step ? "current" : "";
          return (
            <li key={i} className={state} aria-current={state === "current" ? "step" : undefined}>
              <span className="stepper-dot" aria-hidden="true">{state === "done" ? "✓" : i + 1}</span>
              {label}
            </li>
          );
        })}
      </ol>
      <Heading>{title}</Heading>
      {hint && <p className="hint">{hint}</p>}
    </header>
  );
}
