import { useRef } from "react";
import { formatBytes } from "../../lib/format";

export const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.docx";
const MAX_PAGES = 30;

interface Props {
  files: File[];
  onChange: (files: File[]) => void;
  onRead: () => void;
  onCancel: () => void;
}

/** Take photos or pick files, put them in order, then read. */
export default function PagePicker({ files, onChange, onRead, onCancel }: Props) {
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  function add(list: FileList | null) {
    if (list?.length) onChange([...files, ...Array.from(list)].slice(0, MAX_PAGES));
  }

  function move(i: number, by: number) {
    const next = [...files];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    onChange(next);
  }

  return (
    <section className="dash-panel reader-picker" aria-labelledby="picker-heading">
      <h2 id="picker-heading">Read a paper</h2>
      <p>Take a photo of each page, or pick a PDF or Word file. Put the pages in order, then press Read.</p>

      <div className="reader-pick-buttons">
        <button type="button" className="dash-btn" onClick={() => camera.current?.click()}>Take a photo</button>
        <button type="button" className="dash-btn dash-btn-quiet" onClick={() => picker.current?.click()}>Pick a file</button>
      </div>
      {/* `capture` opens the camera on phones; desktops fall back to a file picker. */}
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      <input ref={picker} type="file" accept={ACCEPT} multiple hidden
        onChange={(e) => { add(e.target.files); e.target.value = ""; }} />

      {files.length > 0 && (
        <ol className="page-list" aria-label="Pages to read">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="page-item">
              <span className="page-name">
                Page {i + 1}: {f.name} <span className="hint">({formatBytes(f.size)})</span>
              </span>
              <span className="page-buttons">
                <button type="button" className="dash-btn dash-btn-quiet" onClick={() => move(i, -1)} disabled={i === 0}
                  aria-label={`Move page ${i + 1} up`}>Up</button>
                <button type="button" className="dash-btn dash-btn-quiet" onClick={() => move(i, 1)} disabled={i === files.length - 1}
                  aria-label={`Move page ${i + 1} down`}>Down</button>
                <button type="button" className="dash-btn dash-btn-quiet" onClick={() => onChange(files.filter((_, j) => j !== i))}
                  aria-label={`Remove page ${i + 1}`}>Remove</button>
              </span>
            </li>
          ))}
        </ol>
      )}

      <div className="reader-pick-buttons">
        <button type="button" className="dash-btn" onClick={onRead} disabled={!files.length}>
          Read {files.length === 1 ? "this page" : files.length ? `these ${files.length} pages` : ""}
        </button>
        <button type="button" className="dash-btn dash-btn-quiet" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}
