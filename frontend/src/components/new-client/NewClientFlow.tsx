import { useState } from "react";
import { useApi } from "../../api";
import { errorText } from "../../lib/errors";
import type { ClientDraft, ClientRead } from "../../types";
import "./new-client.css";
import ReadingStep from "./ReadingStep";
import ReviewStep from "./ReviewStep";
import UploadStep from "./UploadStep";

type Step = { name: "upload" } | { name: "reading" } | { name: "review"; draft: ClientDraft };

interface Props {
  onCreated: (client: ClientRead) => void;
  onCancel: () => void;
}

/**
 * Create-a-client flow: upload documents -> Gemini reads them -> case worker reviews
 * the filled-in profile and creates the client.
 */
export default function NewClientFlow({ onCreated, onCancel }: Props) {
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

  switch (step.name) {
    case "upload":
      return (
        <UploadStep files={files} onFilesChange={setFiles} onRead={readDocuments} onCancel={onCancel} error={error} />
      );
    case "reading":
      return <ReadingStep count={files.length} />;
    case "review":
      return (
        <ReviewStep
          draft={step.draft}
          onCreated={onCreated}
          onStartOver={() => {
            setFiles([]);
            setStep({ name: "upload" });
          }}
        />
      );
  }
}
