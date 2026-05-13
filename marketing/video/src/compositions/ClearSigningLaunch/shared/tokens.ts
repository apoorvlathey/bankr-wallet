// Fresh palette — deliberately NOT the Bauhaus primaries.
// Bright paper background, electric-violet accent, single dark ink.

export const tokens = {
  // Backgrounds
  bgBright: "#F7F6F2", // warm off-white, paper-like
  bgDark: "#0A0A0F", // for the cold-open thumbnail frame
  bgPanel: "#FFFFFF", // raised cards over bgBright

  // Ink
  ink: "#15151E", // primary text on bright bg
  inkMuted: "#5A5A66", // secondary
  inkOnDark: "#F4F4F6", // primary text on dark bg

  // Accent
  accent: "#5B5BF2", // electric violet — single accent for highlights & CTAs
  accentSoft: "#E8E8FE",
  accentGlow: "rgba(91,91,242,0.35)",

  // Status (for before/after framing)
  danger: "#FF4D5E", // raw-hex red glow
  dangerSoft: "#FFE4E7",
  success: "#4ADE80", // clear-sign green glow
  successSoft: "#E0FBE9",

  // Shadows — soft & long, not hard offset blocks
  shadowSoft: "0 24px 60px rgba(20,20,40,0.08)",
  shadowMd: "0 12px 30px rgba(20,20,40,0.10)",
  shadowGlowDanger: "0 0 60px rgba(255,77,94,0.45)",
  shadowGlowSuccess: "0 0 60px rgba(74,222,128,0.45)",
};

// Centralized scene timing. Durations are sized to each scene's VO length
// (measured via ffprobe on public/vo/brian/sceneN.mp3) plus a tight tail
// pad (~10–15f) so cuts feel snappy. Update here and re-render —
// TOTAL_FRAMES drives the composition length in Root.tsx.
//
// Scene 0 has no VO (cold open). VO durations (s): 4.18, 3.44, 2.93, 7.06, 3.07, 4.37, 1.21.
// 30 fps. Total = 911 frames ≈ 30.37 s.
export const TIMING = {
  THUMBNAIL: { start: 0, duration: 45 }, // 0.00–1.50s   cold open, silent
  HOOK: { start: 45, duration: 136 }, // 1.50–6.03s   VO 4.18s, tail 0.35s
  STAKES: { start: 181, duration: 113 }, // 6.03–9.80s   VO 3.44s, tail 0.33s
  PIVOT: { start: 294, duration: 98 }, // 9.80–13.07s  VO 2.93s, tail 0.34s
  REVEAL: { start: 392, duration: 224 }, // 13.07–20.53s VO 7.06s — centerpiece, tail 0.40s
  STANDARD: { start: 616, duration: 102 }, // 20.53–23.93s VO 3.07s, tail 0.33s
  BRAND: { start: 718, duration: 131 }, // 23.93–28.30s VO 4.37s, tail 0.00s (cuts straight into CTA)
  CTA: { start: 849, duration: 52 }, // 28.30–30.03s VO 1.21s, URL hold 0.51s
};

export const TOTAL_FRAMES = 901;
