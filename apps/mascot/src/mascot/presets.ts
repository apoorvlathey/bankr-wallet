import type { MascotPreset, MascotStateName } from "./types";

export const mascotPresets: Record<MascotStateName, MascotPreset> = {
  idle: {
    label: "Idle",
    description: "Warm, low-energy presence while the wallet waits for credentials.",
    state: {
      name: "idle",
      mood: "calm",
      action: "breathe",
      intensity: 0.25,
      gazeX: 0,
      gazeY: 0,
      accessory: "lock",
    },
  },
  attentive: {
    label: "Attentive",
    description: "Looks toward the next useful control without pressuring the user.",
    state: {
      name: "attentive",
      mood: "focused",
      action: "notice",
      intensity: 0.4,
      gazeX: 0.45,
      gazeY: 0.2,
      accessory: "lock",
    },
  },
  thinking: {
    label: "Thinking",
    description: "A quiet processing state for chat, balances, or route discovery.",
    state: {
      name: "thinking",
      mood: "curious",
      action: "ponder",
      intensity: 0.32,
      gazeX: -0.35,
      gazeY: -0.45,
      accessory: "wallet",
    },
  },
  success: {
    label: "Success",
    description: "A brief celebratory beat reserved for resolved outcomes.",
    state: {
      name: "success",
      mood: "happy",
      action: "cheer",
      intensity: 0.72,
      gazeX: 0,
      gazeY: 0,
      accessory: "wallet",
    },
  },
  error: {
    label: "Invalid password",
    description: "A brief annoyed reaction that acknowledges the miss without blaming the user.",
    state: {
      name: "error",
      mood: "concerned",
      action: "recoil",
      intensity: 0.5,
      gazeX: 0,
      gazeY: 0.28,
      accessory: "lock",
    },
  },
  sleeping: {
    label: "Sleeping",
    description: "A gentle auto-lock state that settles instead of looping loudly.",
    state: {
      name: "sleeping",
      mood: "sleepy",
      action: "sleep",
      intensity: 0.2,
      gazeX: 0,
      gazeY: 0,
      accessory: "lock",
    },
  },
};

export const mascotStateOrder = Object.keys(mascotPresets) as MascotStateName[];
