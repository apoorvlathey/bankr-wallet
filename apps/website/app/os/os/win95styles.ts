/** Win95-inspired style constants — dark mode desktop with classic chrome */

// Desktop — rich gradient wallpaper with Bauhaus accent
export const DESKTOP_BG = "linear-gradient(135deg, #0a1628 0%, #0e2a4a 30%, #132e50 50%, #0b2240 70%, #091a30 100%)";
export const DESKTOP_PATTERN_COLOR = "rgba(16, 64, 192, 0.08)"; // subtle Bauhaus blue

// Window chrome (classic Win95 gray)
export const WINDOW_BG = "#C0C0C0";
export const BUTTON_FACE = "#C0C0C0";
export const BUTTON_HIGHLIGHT = "#FFFFFF";
export const BUTTON_SHADOW = "#808080";
export const BUTTON_DARK_SHADOW = "#000000";

// Title bar
export const ACTIVE_TITLE_BG = "linear-gradient(90deg, #000080, #1084d0)";
export const INACTIVE_TITLE_BG = "#808080";
export const TITLE_TEXT_COLOR = "#FFFFFF";

// Menu bar (top) — dark Bauhaus style
export const MENUBAR_BG = "rgba(10, 16, 30, 0.92)";
export const MENUBAR_HEIGHT = 28;

// Taskbar (bottom) — dark Bauhaus style
export const TASKBAR_BG = "rgba(10, 16, 30, 0.92)";
export const TASKBAR_HEIGHT = 40;

// Bauhaus accent colors (used sparingly)
export const ACCENT_RED = "#D02020";
export const ACCENT_BLUE = "#1040C0";
export const ACCENT_YELLOW = "#F0C020";

// Font
export const WIN95_FONT = `"MS Sans Serif", "Microsoft Sans Serif", Tahoma, Geneva, sans-serif`;
export const WIN95_FONT_SIZE = "11px";

/** Raised bevel border (default button / window frame) */
export const raisedBorder = {
  borderTop: `1px solid ${BUTTON_HIGHLIGHT}`,
  borderLeft: `1px solid ${BUTTON_HIGHLIGHT}`,
  borderBottom: `1px solid ${BUTTON_DARK_SHADOW}`,
  borderRight: `1px solid ${BUTTON_DARK_SHADOW}`,
  boxShadow: `inset 1px 1px 0 ${BUTTON_HIGHLIGHT}, inset -1px -1px 0 ${BUTTON_SHADOW}`,
};

/** Sunken bevel border (pressed button, input field, status bar) */
export const sunkenBorder = {
  borderTop: `1px solid ${BUTTON_DARK_SHADOW}`,
  borderLeft: `1px solid ${BUTTON_DARK_SHADOW}`,
  borderBottom: `1px solid ${BUTTON_HIGHLIGHT}`,
  borderRight: `1px solid ${BUTTON_HIGHLIGHT}`,
  boxShadow: `inset 1px 1px 0 ${BUTTON_SHADOW}, inset -1px -1px 0 ${BUTTON_HIGHLIGHT}`,
};

/** Win95-style button base (use with Chakra sx prop) */
export const win95Button = {
  bg: BUTTON_FACE,
  color: "#000000",
  fontFamily: WIN95_FONT,
  fontSize: WIN95_FONT_SIZE,
  fontWeight: "bold",
  borderRadius: "0",
  px: 2,
  py: 0.5,
  minW: "auto",
  h: "auto",
  ...raisedBorder,
  _hover: { bg: BUTTON_FACE },
  _active: {
    ...sunkenBorder,
    bg: BUTTON_FACE,
  },
};

/** Window frame outer border */
export const windowFrame = {
  bg: WINDOW_BG,
  border: `1px solid ${BUTTON_DARK_SHADOW}`,
  boxShadow: `
    inset 1px 1px 0 ${BUTTON_HIGHLIGHT},
    inset -1px -1px 0 ${BUTTON_SHADOW},
    1px 1px 0 ${BUTTON_DARK_SHADOW}
  `,
};
