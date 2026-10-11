import type { ReactElement } from "react";
import { parseMarkdown } from "../../lib/reader";
import type { SimplifiedDocument } from "../../types/reader";

/** The plain-language version and its word list. Rendered as text, never as HTML. */
export default function SimpleTab({ simplified }: { simplified: SimplifiedDocument }) {
  const blocks = parseMarkdown(simplified.markdown);
  const items: ReactElement[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) items.push(<ul key={`ul${items.length}`}>{bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>);
    bullets = [];
  };
  for (const b of blocks) {
    if (b.kind === "bullet") {
      bullets.push(b.text);
      continue;
    }
    flush();
    items.push(b.kind === "heading" ? <h3 key={items.length}>{b.text}</h3> : <p key={items.length}>{b.text}</p>);
  }
  flush();

  return (
    <div className="simple-tab">
      {items}
      {simplified.glossary.length > 0 && (
        <>
          <h3>Words on this paper</h3>
          <dl className="glossary">
            {simplified.glossary.map((g) => (
              <div key={g.term}>
                <dt>{g.term}</dt>
                <dd>{g.meaning}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </div>
  );
}
