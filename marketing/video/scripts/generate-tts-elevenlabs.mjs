#!/usr/bin/env node
// Regenerate per-scene narration AND word-level captions for the
// ClearSigningLaunch composition. Uses ElevenLabs' /with-timestamps
// endpoint to get character alignment, then aggregates into words.
//
// Outputs:
//   public/vo/<voice>/sceneN.mp3
//   src/compositions/ClearSigningLaunch/captions.generated.ts
//
// Usage:
//   pnpm tts
//   pnpm tts:adam     # alternate voice
//   ELEVENLABS_VOICE=rachel pnpm tts
//
// Both shorthands resolve to:
//   node --env-file=.env scripts/generate-tts-elevenlabs.mjs

import fs from "node:fs/promises";
import path from "node:path";

const VOICES = {
  adam: "pNInz6obpgDQGcFmaJgB",
  brian: "nPczCjzI2devNBz1zQrb",
  rachel: "21m00Tcm4TlvDq8ikWAM",
};
const VOICE_NAME = process.env.ELEVENLABS_VOICE || "brian";
const VOICE_ID = VOICES[VOICE_NAME];
if (!VOICE_ID) {
  console.error(
    `Unknown voice "${VOICE_NAME}". Options: ${Object.keys(VOICES).join(", ")}`
  );
  process.exit(1);
}

const MODEL = "eleven_multilingual_v2";
const OUTPUT_FORMAT = "mp3_44100_128";
const VOICE_SETTINGS = {
  stability: 0.55,
  similarity_boost: 0.75,
  style: 0.25,
  use_speaker_boost: true,
};

const SCENES = [
  {
    id: 1,
    text: "Every day, millions of people sign transactions they can't actually read.",
  },
  {
    id: 2,
    text: "Bybit. Radiant. Billions, lost to blind signing.",
  },
  {
    id: 3,
    text: "What if your wallet just told you what you're about to do?",
  },
  {
    id: 4,
    text: "That's clear signing. An open Ethereum standard, E R C seventy seven thirty, turning hex into plain English.",
  },
  {
    id: 5,
    text: "Backed by the Ethereum Foundation and the wider ecosystem.",
  },
  {
    id: 6,
    text: "Clear signing is live in WalletChan. Every dapp. Every transaction.",
  },
  {
    id: 7,
    text: "Finally readable.",
  },
];

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  console.error("ELEVENLABS_API_KEY missing. Add it to .env, then run:");
  console.error("  pnpm tts");
  process.exit(1);
}

const here = path.resolve(new URL(".", import.meta.url).pathname);
const audioDir = path.resolve(here, `../public/vo/${VOICE_NAME}`);
const captionsFile = path.resolve(
  here,
  "../src/compositions/ClearSigningLaunch/captions.generated.ts"
);
await fs.mkdir(audioDir, { recursive: true });
console.log(`Voice: ${VOICE_NAME} (${VOICE_ID})  Model: ${MODEL}\n`);

// Aggregate per-character alignment into per-word alignment.
// Words are split on whitespace; punctuation stays attached.
//
// We also expand TTS-disambiguated tokens back to their display form.
// e.g. "E R C seventy seven thirty" → "ERC-7730" in the caption,
// timed across the start of "E" through the end of "thirty".
const DISPLAY_REPLACEMENTS = [
  { source: "E R C seventy seven thirty", display: "ERC-7730" },
];

function alignmentToWords(alignment) {
  const chars = alignment.characters;
  const starts = alignment.character_start_times_seconds;
  const ends = alignment.character_end_times_seconds;

  const words = [];
  let cur = null;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c === " " || c === "\n" || c === "\t") {
      if (cur) {
        words.push(cur);
        cur = null;
      }
      continue;
    }
    if (!cur) cur = { word: "", start: starts[i], end: ends[i] };
    cur.word += c;
    cur.end = ends[i];
  }
  if (cur) words.push(cur);
  return words;
}

function applyDisplayReplacements(words, sceneText) {
  // For each replacement whose source appears in this scene's text,
  // collapse the matching word run into a single display-form word.
  let out = words.slice();
  for (const { source, display } of DISPLAY_REPLACEMENTS) {
    if (!sceneText.includes(source)) continue;
    const tokens = source.split(/\s+/);
    for (let i = 0; i <= out.length - tokens.length; i++) {
      const slice = out.slice(i, i + tokens.length);
      // Strip trailing punctuation when matching tokens.
      const sliceWords = slice.map((w) => w.word.replace(/[.,!?;:]+$/, ""));
      if (sliceWords.join(" ") === tokens.join(" ")) {
        const merged = {
          word: display + (slice[slice.length - 1].word.match(/[.,!?;:]+$/)?.[0] ?? ""),
          start: slice[0].start,
          end: slice[slice.length - 1].end,
        };
        out = [...out.slice(0, i), merged, ...out.slice(i + tokens.length)];
        break;
      }
    }
  }
  return out;
}

const captionsBySceneId = {};

for (const scene of SCENES) {
  const outPath = path.join(audioDir, `scene${scene.id}.mp3`);
  process.stdout.write(
    `scene${scene.id} (${scene.text.length} chars) … `
  );

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps?output_format=${OUTPUT_FORMAT}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      text: scene.text,
      model_id: MODEL,
      voice_settings: VOICE_SETTINGS,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`\nFAILED (${res.status}): ${body}`);
    process.exit(1);
  }

  const json = await res.json();
  const audioBuf = Buffer.from(json.audio_base64, "base64");
  await fs.writeFile(outPath, audioBuf);

  const rawWords = alignmentToWords(json.alignment);
  const words = applyDisplayReplacements(rawWords, scene.text);
  captionsBySceneId[scene.id] = words;

  console.log(
    `${(audioBuf.length / 1024).toFixed(0)} KB, ${words.length} words`
  );
}

// Emit the generated TS file consumed by shared/Captions.tsx.
const header =
  "// DO NOT EDIT — generated by scripts/generate-tts-elevenlabs.mjs.\n" +
  "// Each scene's word-level alignment from the ElevenLabs VO.\n";
const tsBody =
  "export interface CaptionWord {\n" +
  "  word: string;\n" +
  "  /** seconds from VO start */\n" +
  "  start: number;\n" +
  "  /** seconds from VO start */\n" +
  "  end: number;\n" +
  "}\n\n" +
  "export const captionsBySceneId: Record<number, CaptionWord[]> = " +
  JSON.stringify(captionsBySceneId, null, 2) +
  ";\n";

await fs.writeFile(captionsFile, header + "\n" + tsBody);

console.log(
  `\nAll ${SCENES.length} mp3 files written to public/vo/${VOICE_NAME}/.`
);
console.log(
  `Captions written to src/compositions/ClearSigningLaunch/captions.generated.ts.`
);
