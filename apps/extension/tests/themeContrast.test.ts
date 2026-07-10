import assert from "node:assert/strict";
import test from "node:test";
import { midnightTokens } from "../src/theme/themes/midnight";

type Rgb = [number, number, number];

function hexToRgb(value: string): Rgb {
  assert.match(value, /^#[0-9a-f]{6}$/i);
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

function composite(value: string, background: string): Rgb {
  if (value.startsWith("#")) return hexToRgb(value);
  const match = value.match(
    /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/,
  );
  assert.ok(match, `Unsupported color format: ${value}`);
  const foreground: Rgb = [Number(match[1]), Number(match[2]), Number(match[3])];
  const alpha = Number(match[4]);
  const base = hexToRgb(background);
  return foreground.map((channel, index) =>
    Math.round(channel * alpha + base[index] * (1 - alpha)),
  ) as Rgb;
}

function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const foregroundLuminance = luminance(composite(foreground, background));
  const backgroundLuminance = luminance(hexToRgb(background));
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

test("Midnight text hierarchy meets WCAG AA on core surfaces", () => {
  const { colors } = midnightTokens;
  for (const surface of [colors.surface.base, colors.surface.raised]) {
    assert.ok(contrast(colors.fg.primary, surface) >= 4.5);
    assert.ok(contrast(colors.fg.secondary, surface) >= 4.5);
    assert.ok(contrast(colors.fg.muted, surface) >= 4.5);
  }
});

test("Midnight action foreground pairs meet WCAG AA", () => {
  const { colors } = midnightTokens;
  assert.ok(contrast(colors.accentFg.primary, colors.accent.primary) >= 4.5);
  assert.ok(contrast(colors.accentFg.secondary, colors.accent.secondary) >= 4.5);
  assert.ok(contrast(colors.accentFg.highlight, colors.accent.highlight) >= 4.5);
});

test("Midnight status foregrounds meet WCAG AA on composited washes", () => {
  const { colors } = midnightTokens;
  for (const status of Object.values(colors.status)) {
    const wash = composite(status.bg, colors.surface.raised);
    const washHex = `#${wash.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
    assert.ok(
      contrast(status.fg, washHex) >= 4.5,
      `${status.fg} does not pass on ${status.bg}`,
    );
  }
});
