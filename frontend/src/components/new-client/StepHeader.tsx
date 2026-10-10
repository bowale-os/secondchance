const STEP_LABELS = ["Upload", "Read", "Review"];

interface Props {
  step: number;
  total: number;
  title: string;
  hint?: string;
}

export default function StepHeader({ step, total, title, hint }: Props) {
  return (
    <header className="step-header">
      <ol className="stepper" aria-label={`Step ${step} of ${total}`}>
        {STEP_LABELS.slice(0, total).map((label, i) => {
          const state = i + 1 < step ? "done" : i + 1 === step ? "current" : "";
          return (
            <li key={label} className={state} aria-current={state === "current" ? "step" : undefined}>
              <span className="stepper-dot" aria-hidden="true">{state === "done" ? "✓" : i + 1}</span>
              {label}
            </li>
          );
        })}
      </ol>
      <h1>{title}</h1>
      {hint && <p className="hint">{hint}</p>}
    </header>
  );
}
