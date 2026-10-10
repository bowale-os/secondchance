import { useRef, useState } from "react";
import { ACCEPT_ATTRIBUTE, MAX_FILES } from "../../lib/files";

interface Props {
  onFiles: (files: File[]) => void;
}

/** Click-or-drop area for choosing documents. Validation happens in the parent. */
export default function DocumentDropzone({ onFiles }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handle(list: FileList | null) {
    if (list && list.length > 0) onFiles(Array.from(list));
    if (input.current) input.current.value = ""; // allow re-picking the same file
  }

  return (
    <div
      className={dragging ? "dropzone dragging" : "dropzone"}
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          input.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handle(e.dataTransfer.files);
      }}
    >
      <strong>Drop documents here, or click to choose</strong>
      <span className="hint">PDF or photo (PNG, JPEG, WebP, HEIC), up to {MAX_FILES} files, 10 MB each</span>
      <input
        ref={input}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        multiple
        hidden
        onChange={(e) => handle(e.target.files)}
      />
    </div>
  );
}
