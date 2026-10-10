interface Props {
  title: string;
  labels: string[];
  onRemove: (index: number) => void;
}

/** A titled list of extracted rows, each removable if Gemini got it wrong. */
export default function RowGroup({ title, labels, onRemove }: Props) {
  if (labels.length === 0) return null;

  return (
    <div className="row-group">
      <h4>{title}</h4>
      <ul className="file-list">
        {labels.map((label, i) => (
          <li key={`${label}-${i}`} className="file-item">
            <span className="file-name">{label}</span>
            <button type="button" className="icon-button" aria-label={`Remove ${label}`} onClick={() => onRemove(i)}>
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
