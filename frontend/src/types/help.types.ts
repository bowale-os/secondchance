/**
 * Common Help: hand-picked how-to guides (getting an ID, SNAP, MARTA, ...), shown on the Learn tab.
 *
 * A short curated list that changes rarely, so it lives in the frontend (lib/commonHelp.ts) with no
 * table or endpoint. If case workers need to edit topics without a deploy, move this shape into a
 * HelpTopic table.
 */
import type { RequiredDocument, ResourceQuery } from "./resource.types";

export type HelpSection = "getting_started" | "work_school" | "wellbeing";
export type HelpLinkKind = "article" | "video" | "pdf" | "official";

/** English is required; Spanish is optional so topics can launch in English first. */
export interface HelpText {
  en: string;
  es?: string;
}

export interface HelpLink {
  label: string;
  url: string;
  kind: HelpLinkKind;
  source: string; // display name, e.g. "Georgia.gov"
  language: "en" | "es"; // flags English-only links for Spanish speakers
  last_checked: string; // "YYYY-MM-DD"; shown as "Checked Oct 2026"
}

export interface HelpTopic {
  id: string; // "get-id", "snap", "marta", ...
  section: HelpSection;
  title: HelpText;
  summary: HelpText;
  links: HelpLink[];
  /** Ties into the Resources tab. */
  related?: {
    resourceFilter?: Partial<ResourceQuery>;
    document?: RequiredDocument;
  };
}
