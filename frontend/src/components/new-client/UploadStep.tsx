import { useState } from "react";
import { addFiles } from "../../lib/files";
import DocumentDropzone from "./DocumentDropzone";
import SelectedFiles from "./SelectedFiles";
import StepHeader from "./StepHeader";

interface Props {
  files: File[];
  onFilesChange: (files: File[]) => void;
  onRead: () => void;
  onCancel: () => void;
  /** Failure from a previous attempt to read the documents. */
  error: string | null;
}

export default function UploadStep({ files, onFilesChange, onRead, onCancel, error }: Props) {
  const [fileErrors, setFileErrors] = useState<string[]>([]);

  function handleFiles(incoming: File[]) {
    const result = addFiles(files, incoming);
    onFilesChange(result.files);
    setFileErrors(result.errors);
  }

  const remove = (index: number) => onFilesChange(files.filter((_, i) => i !== index));

  return (
    <div className="nc-form">
      <StepHeader
        step={1}
        total={3}
        title="Upload documents"
        hint="Add everything you have about this client: court notices, ID, benefit letters, medication papers. We'll read them and fill in the profile for you to review."
      />
      <section className="dash-panel">
        <div className="nc-body">
          <DocumentDropzone onFiles={handleFiles} />
        </div>
        <SelectedFiles files={files} onRemove={remove} />
      </section>
      {fileErrors.map((message) => (
        <p key={message} className="dash-error" role="alert">
          {message}
        </p>
      ))}
      {error && (
        <p className="dash-error" role="alert">
          {error}
        </p>
      )}
      <div className="nc-actions">
        <button type="button" className="dash-btn" disabled={files.length === 0} onClick={onRead}>
          Read {files.length > 0 ? `${files.length} document${files.length > 1 ? "s" : ""}` : "documents"}
        </button>
        <button type="button" className="dash-btn dash-btn-quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
