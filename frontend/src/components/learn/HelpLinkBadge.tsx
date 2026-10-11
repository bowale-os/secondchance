import type { HelpLinkKind } from "../../types";

export const KIND_LABELS: Record<HelpLinkKind, string> = {
  article: "Article",
  video: "Video",
  pdf: "PDF",
  official: "Official site",
};

/** Article / Video / PDF / Official site. Always shown as text, never as an icon alone. */
export default function HelpLinkBadge({ kind }: { kind: HelpLinkKind }) {
  return <span className={`help-badge help-badge-${kind}`}>{KIND_LABELS[kind]}</span>;
}
