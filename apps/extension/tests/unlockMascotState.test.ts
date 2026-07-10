import assert from "node:assert/strict";
import test from "node:test";
import { getUnlockMascotState } from "../src/components/unlockMascotState";

const baseInput = {
  password: "",
  error: "",
  isUnlocking: false,
  isPasskeyUnlocking: false,
  showSuccess: false,
};

test("empty password stays sleeping while typing becomes attentive", () => {
  assert.equal(getUnlockMascotState(baseInput), "sleeping");
  assert.equal(
    getUnlockMascotState({ ...baseInput, password: "a" }),
    "attentive",
  );
  assert.equal(
    getUnlockMascotState({ ...baseInput, password: "a", isUnlocking: true }),
    "attentive",
  );
});

test("an active automatic or manual biometric prompt is attentive", () => {
  assert.equal(
    getUnlockMascotState({ ...baseInput, isPasskeyUnlocking: true }),
    "attentive",
  );
});

test("biometric cancellation falls back to password-mode presentation", () => {
  assert.equal(
    getUnlockMascotState({
      ...baseInput,
      error: "Biometric prompt cancelled",
    }),
    "sleeping",
  );
  assert.equal(
    getUnlockMascotState({
      ...baseInput,
      password: "still-here",
      error: "Biometric prompt canceled",
    }),
    "attentive",
  );
});

test("incorrect credentials use invalid while required stays sleeping", () => {
  assert.equal(
    getUnlockMascotState({ ...baseInput, error: "Incorrect password" }),
    "invalid",
  );
  assert.equal(
    getUnlockMascotState({ ...baseInput, error: "Password is required" }),
    "sleeping",
  );
});

test("success takes precedence during the unlock fade", () => {
  assert.equal(
    getUnlockMascotState({
      ...baseInput,
      error: "Incorrect password",
      showSuccess: true,
    }),
    "success",
  );
});
