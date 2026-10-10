import { formatBytes } from "../../lib/format";

interface Props {
  files: File[];
  onRemove: (index: number) => void;
}

export default function SelectedFiles({ files, onRemove }: Props) {
  if (files.length === 0) return null;

  return (
    <ul className="row-list nc-files">
      {files.map((file, i) => (
        <li key={`${file.name}-${file.lastModified}`} className="nc-record">
          <div className="nc-record-main">
            <span className="file-name">{file.name}</span>
            <span className="hint">{formatBytes(file.size)}</span>
          </div>
          <button type="button" className="dash-btn dash-btn-quiet" aria-label={`Remove ${file.name}`} onClick={() => onRemove(i)}>
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}
