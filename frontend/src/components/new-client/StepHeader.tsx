interface Props {
  step: number;
  total: number;
  title: string;
  hint?: string;
}

export default function StepHeader({ step, total, title, hint }: Props) {
  return (
    <header className="step-header">
      <span className="step-count">
        Step {step} of {total}
      </span>
      <h2>{title}</h2>
      {hint && <p className="hint">{hint}</p>}
    </header>
  );
}
