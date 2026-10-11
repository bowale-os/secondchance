/** The four top-level tabs shared by case workers and clients. */
export type Section = "home" | "resources" | "calendar" | "learn";

/** Top-level navigation, passed down from App to every staff screen. */
export interface AppNav {
  section: Section;
  go: (section: Section) => void;
  /** How many to-do items are waiting on Home. Shown as a badge on the Home tab. */
  homeCount: number;
  setHomeCount: (count: number) => void;
  /** Opens the create-a-client flow. Shown as a button in the rail on every screen. */
  onNewClient: () => void;
}

/** Tab names are the same for everyone. Every one is shown with its label, never as an icon alone. */
export const SECTIONS: { section: Section; label: string }[] = [
  { section: "home", label: "Home" },
  { section: "resources", label: "Resources" },
  { section: "calendar", label: "Calendar" },
  { section: "learn", label: "Learn" },
];
