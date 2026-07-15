import assert from "node:assert/strict";
import test from "node:test";

import {
  decodePersonalMessage,
  formatSignatureData,
  getSignatureIntent,
  getSignerAddress,
  isClearSigningTypedData,
} from "../../src/components/SignatureConfirmation/signaturePresentation";

const signer = "0x1111111111111111111111111111111111111111";

test("personal messages decode only when their text is safe to display", () => {
  assert.deepEqual(decodePersonalMessage("Hello WalletChan"), {
    message: "Hello WalletChan",
    readable: true,
  });
  assert.deepEqual(decodePersonalMessage("0x48656c6c6f2057616c6c65744368616e"), {
    message: "Hello WalletChan",
    readable: true,
  });
  assert.equal(decodePersonalMessage("0xff").readable, false);
  assert.equal(decodePersonalMessage("hello\u0000wallet").readable, false);
  assert.equal(decodePersonalMessage("0x123").readable, false);
});

test("personal_sign preserves readable and exact raw projections", () => {
  const formatted = formatSignatureData("personal_sign", [
    "0x48656c6c6f",
    signer,
  ]);

  assert.equal(formatted.message, "Hello");
  assert.equal(formatted.messageReadable, true);
  assert.equal(formatted.rawPayload, "0x48656c6c6f");
  assert.match(formatted.rawData, /1111111111111111/u);
  assert.equal(getSignerAddress("personal_sign", ["0x00", signer]), signer);
});

test("eth_sign is always presented as unreadable raw data", () => {
  const hash = `0x${"12".repeat(32)}`;
  const formatted = formatSignatureData("eth_sign", [signer, hash]);
  const intent = getSignatureIntent({
    method: "eth_sign",
    originHostname: "example.test",
    isSiwe: false,
    isDelegation: false,
    messageReadable: formatted.messageReadable,
  });

  assert.equal(formatted.messageReadable, false);
  assert.equal(formatted.rawPayload, hash);
  assert.equal(intent.title, "Sign unreadable data");
});

test("typed data keeps structured fields separate from the raw payload", () => {
  const typedData = {
    domain: { name: "WalletChan Test", chainId: 8453 },
    primaryType: "Permit",
    types: {
      Permit: [
        { name: "owner", type: "address" },
        { name: "amount", type: "uint256" },
      ],
    },
    message: { owner: signer, amount: "100" },
  };
  const formatted = formatSignatureData("eth_signTypedData_v4", [
    signer,
    JSON.stringify(typedData),
  ]);
  const intent = getSignatureIntent({
    method: "eth_signTypedData_v4",
    originHostname: "example.test",
    typedData: formatted.typedData,
    isSiwe: false,
    isDelegation: false,
    messageReadable: formatted.messageReadable,
  });

  assert.deepEqual(formatted.typedData, typedData);
  assert.equal(formatted.messageReadable, true);
  assert.match(formatted.message, /"owner"/u);
  assert.match(formatted.rawPayload, /"primaryType": "Permit"/u);
  assert.equal(intent.title, "Authorize WalletChan Test");
  assert.equal(isClearSigningTypedData(typedData), true);
});

test("malformed typed data fails closed to raw request presentation", () => {
  const formatted = formatSignatureData("eth_signTypedData_v4", [
    signer,
    "{not-json",
  ]);

  assert.equal(formatted.typedData, undefined);
  assert.equal(formatted.messageReadable, false);
  assert.equal(isClearSigningTypedData({ primaryType: "Permit" }), false);
});
