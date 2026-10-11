import type { ClientAttention, ClientRead, StaffEventRead } from "../types";
import { mergeDuplicates } from "./calendar";
import { daysUntil, formatWhen, humanize } from "./format";

/** The groups of the case worker's to-do list, most urgent first. */
export type TodoGroup = "new" | "overdue" | "soon" | "records" | "check";

export const TODO_GROUPS: { group: TodoGroup; title: string }[] = [
  { group: "new", title: "New from clients" },
  { group: "overdue", title: "Overdue" },
  { group: "soon", title: "Coming up this week" },
  { group: "records", title: "Records and IDs" },
  { group: "check", title: "Check in on" },
];

export interface TodoItem {
  key: string;
  group: TodoGroup;
  clientId: string;
  clientName: string;
  title: string;
  detail: string;
  /** Set for event items, so the row can offer "Mark done". Several when documents listed the same event. */
  eventIds?: string[];
}

const SOON_DAYS = 7;
const RELEASE_DAYS = 30;

const clientName = (c: ClientRead) => `${c.preferred_name || c.first_name} ${c.last_name}`;
const eventTitle = (e: StaffEventRead) => e.description || humanize(e.obligation_type);

/**
 * Builds the to-do list from my clients, their events, and the records that need a look.
 * An event the client added shows once under "New from clients" until I acknowledge it; after that it
 * flows into Overdue or Coming up like any other event.
 */
export function buildTodo(clients: ClientRead[], allEvents: StaffEventRead[], attention: ClientAttention[]): TodoItem[] {
  const items: TodoItem[] = [];

  for (const e of mergeDuplicates(allEvents)) {
    if (e.status === "done") continue;
    const base = { clientId: e.client_id, clientName: e.client_name, eventIds: e.merged_ids ?? [e.id], title: eventTitle(e) };
    const when = e.due_date ? formatWhen(e.due_date, e.due_time) : "No date";
    const where = e.location ? ` · ${e.location}` : "";

    if (e.added_by_client && !e.staff_seen_at) {
      items.push({ ...base, key: `new-${e.id}`, group: "new", detail: `Added by ${e.client_name.split(" ")[0]} · ${when}${where}` });
    } else if (e.status === "overdue") {
      items.push({ ...base, key: `overdue-${e.id}`, group: "overdue", detail: `Was due ${when}${where}` });
    } else if (e.due_date && daysUntil(e.due_date) <= SOON_DAYS) {
      items.push({ ...base, key: `soon-${e.id}`, group: "soon", detail: `${when}${where}` });
    }
  }

  for (const a of attention) {
    const base = { clientId: a.client_id, clientName: a.client_name };
    if (a.unverified_records > 0) {
      const n = a.unverified_records;
      items.push({ ...base, key: `review-${a.client_id}`, group: "records", title: `${n} ${n === 1 ? "record needs" : "records need"} review`, detail: "Check them against the source documents, then confirm." });
    }
    a.problems.forEach((problem, i) => {
      items.push({ ...base, key: `problem-${a.client_id}-${i}`, group: "records", title: problem, detail: "Open the client to follow up." });
    });
  }

  for (const c of clients) {
    const base = { clientId: c.id, clientName: clientName(c) };
    if (c.release_date) {
      const days = daysUntil(c.release_date);
      if (days >= 0 && days <= RELEASE_DAYS) {
        const out = days === 0 ? "Out today" : `Out in ${days} day${days === 1 ? "" : "s"}`;
        items.push({ ...base, key: `release-${c.id}`, group: "check", title: out, detail: "Plan housing, ID and a first week." });
      }
    }
    if (!c.phone) {
      items.push({ ...base, key: `phone-${c.id}`, group: "check", title: "No phone on file", detail: "Add a number so you can reach them." });
    }
  }

  return items;
}
