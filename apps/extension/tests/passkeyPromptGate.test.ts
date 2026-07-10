import assert from "node:assert/strict";
import test from "node:test";
import {
  beginPasskeyPrompt,
  canAutoPromptPasskey,
  createPasskeyPromptGate,
  finishPasskeyPrompt,
} from "../src/components/passkeyPromptGate";

test("manual passkey unlock consumes the trailing automatic prompt", () => {
  const gate = createPasskeyPromptGate();

  assert.equal(canAutoPromptPasskey(gate), true);
  assert.equal(beginPasskeyPrompt(gate), true);
  assert.equal(canAutoPromptPasskey(gate), false);

  finishPasskeyPrompt(gate);

  // The unlock screen can remain mounted during the fade to Home, but clearing
  // auto-prompt suppression must not start a second WebAuthn ceremony.
  assert.equal(canAutoPromptPasskey(gate), false);
});

test("the prompt gate is single-flight while allowing an explicit retry", () => {
  const gate = createPasskeyPromptGate();

  assert.equal(beginPasskeyPrompt(gate), true);
  assert.equal(beginPasskeyPrompt(gate), false);

  finishPasskeyPrompt(gate);

  assert.equal(beginPasskeyPrompt(gate), true);
});

test("a successful unlock cannot auto-prompt from the fading unlock screen", () => {
  const gate = createPasskeyPromptGate();

  // Password unlock can succeed while its automatic passkey prompt was
  // suppressed and therefore never consumed. Success must still close the
  // auto-prompt window before App clears suppression for the next session.
  assert.equal(canAutoPromptPasskey(gate), true);
  assert.equal(canAutoPromptPasskey(gate, true), false);
});
