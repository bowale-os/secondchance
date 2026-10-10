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
      <h3>{title}</h3>
      <ul className="row-list">
        {labels.map((label, i) => (
          <li key={`${label}-${i}`} className="nc-record">
            <span className="file-name">{label}</span>
            <button type="button" className="dash-btn dash-btn-quiet" aria-label={`Remove ${label}`} onClick={() => onRemove(i)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
