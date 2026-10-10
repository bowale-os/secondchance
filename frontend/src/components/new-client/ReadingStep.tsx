import StepHeader from "./StepHeader";

export default function ReadingStep({ count }: { count: number }) {
  return (
    <section>
      <StepHeader step={2} total={3} title="Reading documents" />
      <div className="reading" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        <p>
          Reading {count} document{count > 1 ? "s" : ""}. This can take up to a minute.
        </p>
      </div>
    </section>
  );
}
