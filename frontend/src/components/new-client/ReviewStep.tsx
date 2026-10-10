import { useState } from "react";
import { useApi } from "../../api";
import type { ClientFormKey } from "../../lib/clientFields";
import { buildClientCreate, formFromDraft } from "../../lib/clientForm";
import { errorText } from "../../lib/errors";
import { removeRow, rowsFromDraft, type RowGroupKey } from "../../lib/extractedRows";
import type { ClientDraft, ClientRead } from "../../types";
import ClientFields from "./ClientFields";
import DocumentSummaries from "./DocumentSummaries";
import ExtractedRowGroups from "./ExtractedRowGroups";
import StepHeader from "./StepHeader";

interface Props {
  draft: ClientDraft;
  onCreated: (client: ClientRead) => void;
  onStartOver: () => void;
}

export default function ReviewStep({ draft, onCreated, onStartOver }: Props) {
  const api = useApi();
  const [form, setForm] = useState(() => formFromDraft(draft));
  const [rows, setRows] = useState(() => rowsFromDraft(draft));
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setField = (key: ClientFormKey, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const remove = (group: RowGroupKey, index: number) => setRows((r) => removeRow(r, group, index));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body = buildClientCreate(form, pin, rows, draft.documents.map((d) => d.id));
      onCreated(await api.clients.create(body));
    } catch (err) {
      setError(errorText(err));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <StepHeader
        step={3}
        total={3}
        title="Review and create"
        hint="Check what we read. Fix anything that is wrong or missing, then set a PIN and create the client."
      />
      <h3 className="section-title">What we read</h3>
      <DocumentSummaries documents={draft.documents} />
      <ClientFields form={form} onChange={setField} />
      <ExtractedRowGroups rows={rows} onRemove={remove} />
      <fieldset className="form-section">
        <legend>Client login</legend>
        <label className="field">
          PIN (4 to 8 digits) <span aria-hidden="true">*</span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            pattern="[0-9]{4,8}"
            title="4 to 8 digits"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            required
          />
        </label>
        <p className="hint">The client signs in with their name and this PIN. It is stored encrypted and cannot be viewed later.</p>
      </fieldset>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button type="submit" disabled={submitting}>
          {submitting ? "Creating…" : "Create client"}
        </button>
        <button type="button" className="secondary" disabled={submitting} onClick={onStartOver}>
          Start over
        </button>
      </div>
    </form>
  );
}
