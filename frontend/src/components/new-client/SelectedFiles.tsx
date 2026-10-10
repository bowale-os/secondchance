import { formatBytes } from "../../lib/format";

interface Props {
  files: File[];
  onRemove: (index: number) => void;
}

export default function SelectedFiles({ files, onRemove }: Props) {
  if (files.length === 0) return null;

  return (
    <ul className="file-list">
      {files.map((file, i) => (
        <li key={`${file.name}-${file.lastModified}`} className="file-item">
          <span className="file-name">{file.name}</span>
          <span className="hint">{formatBytes(file.size)}</span>
          <button type="button" className="icon-button" aria-label={`Remove ${file.name}`} onClick={() => onRemove(i)}>
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
