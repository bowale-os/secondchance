// Colors from the chosen palette, with measured contrast (WCAG):
//   ink on cream 13.4:1 (AAA) · cream on moss 6.4:1 (AA) · olive on cream 5.2:1 (AA)
//   caramel on cream 4.2:1: borders, icons, and markers only, never small text.
// Warning text is ink on a light caramel tint (AAA), marked by a caramel border.

export const colors = {
  ink: '#251101',       // body text, headings
  olive: '#665731',     // secondary text
  cream: '#F3D9C4',     // page background
  moss: '#4B4E2F',      // primary buttons, selected tabs
  caramel: '#85602F',   // accents: urgent markers, borders, icons
  surface: '#FBF1E8',   // cards
  warnBg: '#F6E4CF',    // background of warnings
  line: '#C9A988',      // dividers and input borders (non-text, 3:1 not required)
  onMoss: '#F3D9C4',    // text on moss buttons
};

/** Minimum sizes from the plan: 18 px body text, 48 px touch targets. */
export const sizes = {
  body: 18,
  small: 16,
  label: 20,
  heading: 24,
  title: 30,
  touch: 48,
  bigButton: 72,
  gap: 16,
  radius: 14,
};

/** Large text mode multiplies every font size. */
export const LARGE_TEXT_SCALE = 1.3;
