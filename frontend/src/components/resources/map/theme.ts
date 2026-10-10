import type { ResourceCategory } from "../../../types";

/**
 * Pin colors. Each passes 4.5:1 against the white letter on it. Color is never the only
 * signal: every pin carries its category letter and an accessible name, and the legend names each.
 */
export const CATEGORY_COLORS: Record<ResourceCategory, string> = {
  shelter: "#B45309",
  food: "#BE185D",
  addiction: "#047857",
  classes: "#6D28D9",
  events: "#A2080C",
};

export const CATEGORY_LETTERS: Record<ResourceCategory, string> = {
  shelter: "S",
  food: "F",
  addiction: "R",
  classes: "C",
  events: "E",
};

/** Same land/outside/line colors as the second-chance-reader map, with this app's brand teal. */
export const MAP_COLORS = {
  land: "#FBF1E8", // inside the five counties
  outside: "#D9CFC4", // grayed-out area beyond them
  countyLine: "#0b5f58",
  transit: "#0b5f58",
};
