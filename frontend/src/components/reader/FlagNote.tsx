import type { Flag } from "../../types/reader";

/** "Double-check this" notes from the server's number checks, shown to the client as-is. */
export default function FlagNote({ flags }: { flags: Flag[] }) {
  if (!flags.length) return null;
  return (
    <div className="flag-note" role="note">
      <p className="flag-note-head">Double-check this</p>
      <ul>
        {flags.map((f, i) => <li key={i}>{f.detail}</li>)}
      </ul>
    </div>
  );
}
