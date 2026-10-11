/** Plain helpers for the document reader screens: wording, the simple-version renderer, and
 * the Keep bar's states. No React here, so they can be tested on their own. */
import type { ActionItem, DocType, Flag } from "../types/reader";
import { daysUntil, formatDate } from "./format";

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  parole_conditions: "Parole",
  probation: "Probation",
  court_order: "Court",
  benefits: "Benefits",
  housing: "Housing",
  employment: "Job",
  medical: "Medical",
  id: "ID",
  child_support: "Child support",
  other: "Other",
};

export const DISCLAIMER =
  "This is a helper, not legal advice. Check the original paper and ask your case manager or legal aid if anything is unclear.";

export const NOT_CHECKED = "From your paper, not checked by your case worker yet.";
export const CHECKED = "Checked by your case worker.";
export const ASK_RELEASE_DATE = "Ask your case worker to add your release date to get the exact day.";

/** "in 3 days", "today", "2 days late". */
export function dueWords(iso: string): string {
  const d = daysUntil(iso);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "1 day late";
  return d < 0 ? `${-d} days late` : `in ${d} days`;
}

/** The when-line of a to-do: a real date, the paper's own wording, or why there is no date. */
export function dueLine(a: ActionItem): string {
  if (a.due.resolvedDate) return `${formatDate(a.due.resolvedDate)} · ${dueWords(a.due.resolvedDate)}`;
  if (a.due.text) return a.due.text.charAt(0).toUpperCase() + a.due.text.slice(1);
  return a.due.type === "relative" ? "Date needed" : "No date on the paper";
}

/** The deadline counts from a release date the profile doesn't have. The case worker owns
 * that field, so the client is told who to ask instead of being shown a date picker. */
export function needsReleaseDate(a: ActionItem): boolean {
  return a.due.anchor === "release_date" && !a.due.resolvedDate;
}

export function flagsFor(flags: Flag[], actionId: string): Flag[] {
  return flags.filter((f) => f.actionId === actionId);
}

/** What the Listen tab reads out for one to-do. */
export function speakAction(a: ActionItem): string {
  return [
    a.priority === "urgent" ? "Urgent." : "",
    `${a.title}.`,
    `${dueLine(a)}.`,
    a.details,
    a.location ? `Where: ${a.location}.` : "",
    a.bring?.length ? `Bring: ${a.bring.join(", ")}.` : "",
    a.consequence ?? "",
  ].filter(Boolean).join(" ");
}

export type Block = { kind: "heading" | "bullet" | "para"; text: string };

/** The simple version uses "## " headings, "- " bullets and paragraphs, nothing else, so a
 * full markdown library isn't needed. Text is rendered as text, never as HTML. */
export function parseMarkdown(md: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of md.split("\n")) {
    const line = raw.replace(/\*\*|__/g, "").trimEnd();
    if (!line.trim()) continue;
    const h = line.match(/^#{1,6}\s+(.*)/);
    const b = line.match(/^\s*[-*•]\s+(.*)/);
    if (h) blocks.push({ kind: "heading", text: h[1] });
    else if (b) blocks.push({ kind: "bullet", text: b[1] });
    else blocks.push({ kind: "para", text: line.trim() });
  }
  return blocks;
}

// ---------- Keep bar ----------

export type KeepState =
  | { status: "choosing" }
  | { status: "saving" }
  | { status: "kept"; readingId: string }
  | { status: "dropped" }
  | { status: "error"; message: string };

export type KeepEvent =
  | { type: "keep" }
  | { type: "saved"; readingId: string }
  | { type: "failed"; message: string }
  | { type: "drop" };

/** Keep or Don't keep. Once kept or dropped the choice is final; a failed save can be retried. */
export function keepReducer(state: KeepState, event: KeepEvent): KeepState {
  switch (event.type) {
    case "keep":
      return state.status === "choosing" || state.status === "error" ? { status: "saving" } : state;
    case "saved":
      return state.status === "saving" ? { status: "kept", readingId: event.readingId } : state;
    case "failed":
      return state.status === "saving" ? { status: "error", message: event.message } : state;
    case "drop":
      return state.status === "choosing" || state.status === "error" ? { status: "dropped" } : state;
  }
}

/** True while leaving would lose a result the person hasn't decided about. */
export function isUnsaved(state: KeepState): boolean {
  return state.status === "choosing" || state.status === "saving" || state.status === "error";
}
