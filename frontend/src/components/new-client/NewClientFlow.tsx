import { useState } from "react";
import { useApi } from "../../api";
import { errorText } from "../../lib/errors";
import type { ClientDraft, ClientRead, StaffRead } from "../../types";
import AppShell, { staffUser } from "../layout/AppShell";
import type { AppNav } from "../layout/nav";
import "../dashboard/dashboard.css";
import "./new-client.css";
import ReadingStep from "./ReadingStep";
import ReviewStep from "./ReviewStep";
import UploadStep from "./UploadStep";

type Step = { name: "upload" } | { name: "reading" } | { name: "review"; draft: ClientDraft };

interface Props {
  staff: StaffRead;
  nav: AppNav;
  onLogout: () => void;
  onCreated: (client: ClientRead) => void;
  onCancel: () => void;
}

/**
 * Create-a-client flow: upload documents -> Gemini reads them -> case worker reviews
 * the filled-in profile and creates the client.
 */
export default function NewClientFlow({ staff, nav, onLogout, onCreated, onCancel }: Props) {
  const api = useApi();
  const [step, setStep] = useState<Step>({ name: "upload" });
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function readDocuments() {
    setError(null);
    setStep({ name: "reading" });
    try {
      setStep({ name: "review", draft: await api.clients.extractDraft(files) });
    } catch (e) {
      setError(errorText(e));
      setStep({ name: "upload" });
    }
  }

  let content;
  switch (step.name) {
    case "upload":
      content = (
        <UploadStep files={files} onFilesChange={setFiles} onRead={readDocuments} onCancel={onCancel} error={error} />
      );
      break;
    case "reading":
      content = <ReadingStep count={files.length} />;
      break;
    case "review":
      content = (
        <ReviewStep
          draft={step.draft}
          onCreated={onCreated}
          onStartOver={() => {
            setFiles([]);
            setStep({ name: "upload" });
          }}
        />
      );
      break;
  }

  return (
    <AppShell user={staffUser(staff)} nav={nav} onLogout={onLogout}>
      <main id="dash-main" className="dash-main nc-main">
        <div>
          <button type="button" className="dash-btn dash-btn-quiet" onClick={onCancel}>‹ Home</button>
        </div>
        {content}
      </main>
    </AppShell>
  );
}
