import type { EventRead, ObligationType } from "../types";
import { formatClock } from "./format";

/** An event as the calendar shows it. Case workers also get the client's name. */
export type CalendarEvent = EventRead & { client_name?: string };

/** Plain-language names for the event types, in the order the filter shows them. */
export const TYPE_LABEL: Record<ObligationType, string> = {
  check_in: "Check-in",
  court_date: "Court date",
  fee: "Fee due",
  report: "Report",
  other: "Other",
};
export const TYPE_ORDER = Object.keys(TYPE_LABEL) as ObligationType[];

export const pad = (n: number) => String(n).padStart(2, "0");

/** A local Date as "YYYY-MM-DD". */
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "YYYY-MM-DD" as a local Date (noon, so daylight saving never shifts the day). */
export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

export interface MonthCell {
  iso: string;
  day: number;
  inMonth: boolean;
}

/** Whole weeks (Sunday first) covering the month of `cursor`. */
export function monthCells(cursor: Date): MonthCell[] {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const start = new Date(year, month, 1, 12);
  start.setDate(1 - start.getDay());
  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (i >= 35 && d.getMonth() !== month) break; // no empty last row
    cells.push({ iso: isoDate(d), day: d.getDate(), inMonth: d.getMonth() === month });
  }
  return cells;
}

export type DayPart = "Morning" | "Afternoon" | "Evening" | "Any time";
export const DAY_PARTS: DayPart[] = ["Morning", "Afternoon", "Evening", "Any time"];

export function dayPart(time: string | null): DayPart {
  if (!time) return "Any time";
  const hour = Number(time.slice(0, 2));
  return hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
}

/** Earliest first; events with no time come last in their day. */
export function byTime(a: CalendarEvent, b: CalendarEvent): number {
  return (a.due_time ?? "99").localeCompare(b.due_time ?? "99");
}

export const timeText = (e: CalendarEvent) => (e.due_time ? formatClock(e.due_time) : "Any time");
export const eventTitle = (e: CalendarEvent) => e.description || TYPE_LABEL[e.obligation_type];

/** Events grouped by their "YYYY-MM-DD" date. Events with no date are left out. */
export function groupByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    if (!e.due_date) continue;
    map.set(e.due_date, [...(map.get(e.due_date) ?? []), e]);
  }
  return map;
}
