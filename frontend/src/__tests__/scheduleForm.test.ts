import { describe, expect, it } from "vitest";
import { guessAmount, guessType } from "../components/reader/ScheduleForm";
import type { ActionItem } from "../types/reader";

const action = (a: Partial<ActionItem>): ActionItem => ({
  id: "1", order: 1, title: "Step", details: "", due: { type: "none" }, priority: "normal",
  sourceQuote: "q", sourcePage: 1, confidence: 0.9, completed: false, checkedByCaseWorker: false, ...a,
});

describe("Add to schedule form guesses", () => {
  it("guesses the type from the to-do's words", () => {
    expect(guessType(action({ title: "Go to your court hearing" }))).toBe("court_date");
    expect(guessType(action({ title: "Pay your first supervision fee", details: "Pay $30.00." }))).toBe("fee");
    expect(guessType(action({ title: "Meet your parole officer" }))).toBe("check_in");
    expect(guessType(action({ title: "Send the monthly report" }))).toBe("report");
    expect(guessType(action({ title: "Stay in Georgia" }))).toBe("other");
  });

  it("pulls the dollar amount for fees", () => {
    expect(guessAmount(action({ details: "Pay $1,250.00 by Friday." }))).toBe("1250.00");
    expect(guessAmount(action({ title: "Pay $30" }))).toBe("30.00");
    expect(guessAmount(action({ title: "Meet your officer" }))).toBe("");
  });
});
