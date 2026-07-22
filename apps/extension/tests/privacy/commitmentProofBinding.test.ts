import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as snarkjs from "snarkjs";

import {
  derivePrivacyPoolCommitment,
} from "../../src/chrome/privacy/protocol/primitives";
import type { PrivacyGroth16Proof } from "../../src/chrome/privacy/prover/messages";
import { encodePrivacyRagequitCallData } from "../../src/chrome/privacy/ragequit/prepare";

const ARTIFACT_ROOT = new URL("../../public/privacy-pools/artifacts/", import.meta.url);
const INPUT = Object.freeze({
  value: "12",
  label: "34",
  nullifier: "56",
  secret: "78",
});

test("pinned commitment circuit binds the Ragequit signal order", async () => {
  const [wasm, zkey] = await Promise.all([
    readFile(new URL("commitment.wasm", ARTIFACT_ROOT)),
    readFile(new URL("commitment.zkey", ARTIFACT_ROOT)),
  ]);
  const result = await snarkjs.groth16.fullProve(
    INPUT,
    new Uint8Array(wasm),
    new Uint8Array(zkey),
    undefined,
    undefined,
    { singleThread: true },
  );
  const commitment = derivePrivacyPoolCommitment(12n, 34n, {
    nullifier: 56n,
    secret: 78n,
  });
  const expected = [
    commitment.hash.toString(),
    commitment.nullifierHash.toString(),
    INPUT.value,
    INPUT.label,
  ] as const;

  assert.notEqual(commitment.precommitment, commitment.nullifierHash);
  assert.deepEqual(result.publicSignals, expected);
  assert.doesNotThrow(() => encodePrivacyRagequitCallData({
    proof: result.proof as PrivacyGroth16Proof,
    publicSignals: result.publicSignals,
    expected,
  }));
});
