export type MascotStateName =
  | "idle"
  | "attentive"
  | "thinking"
  | "success"
  | "error"
  | "sleeping";

export type MascotMood =
  | "calm"
  | "curious"
  | "focused"
  | "happy"
  | "concerned"
  | "sleepy";

export type MascotAccessory = "lock" | "wallet" | "none";

export interface MascotState {
  name: MascotStateName;
  mood: MascotMood;
  action: "breathe" | "notice" | "ponder" | "cheer" | "recoil" | "sleep";
  intensity: number;
  gazeX: number;
  gazeY: number;
  accessory: MascotAccessory;
  reducedMotion: boolean;
}

export interface MascotPreset {
  label: string;
  description: string;
  state: Omit<MascotState, "reducedMotion">;
}
