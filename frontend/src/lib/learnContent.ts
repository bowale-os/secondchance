/**
 * Placeholder content for the Learn tab. There is no backend for this yet, so this list is SAMPLE ONLY:
 * titles and summaries show the layout and are not real videos or advice. Replace with an API call
 * when the content model exists.
 */

export const LEARN_TOPICS = ["ID and papers", "Housing", "Money", "Health", "Your rights"] as const;
export type LearnTopic = (typeof LEARN_TOPICS)[number];

export interface LearnItem {
  id: string;
  kind: "video" | "guide";
  topic: LearnTopic;
  title: string;
  summary: string;
  /** Minutes to watch or read. */
  minutes: number;
}

export const LEARN_ITEMS: LearnItem[] = [
  { id: "v1", kind: "video", topic: "ID and papers", title: "Get a state ID", summary: "What to bring, where to go, and what it costs.", minutes: 2 },
  { id: "v2", kind: "video", topic: "Housing", title: "What a landlord can ask you", summary: "Your record, your income, and what to say.", minutes: 3 },
  { id: "v3", kind: "video", topic: "Money", title: "Open a bank account", summary: "Accounts that do not need a high balance.", minutes: 2 },
  { id: "v4", kind: "video", topic: "Health", title: "Sign up for health coverage", summary: "How to apply and what you need.", minutes: 3 },
  { id: "g1", kind: "guide", topic: "ID and papers", title: "Replace a lost birth certificate", summary: "Step by step, with the forms you need.", minutes: 4 },
  { id: "g2", kind: "guide", topic: "Housing", title: "How to read your lease", summary: "The parts that matter most before you sign.", minutes: 5 },
  { id: "g3", kind: "guide", topic: "Your rights", title: "Your rights during supervision", summary: "What your officer can and cannot ask.", minutes: 6 },
  { id: "g4", kind: "guide", topic: "Money", title: "Paying fines and fees on a budget", summary: "Payment plans and who to ask.", minutes: 4 },
];
