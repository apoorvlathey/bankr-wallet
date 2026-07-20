import assert from "node:assert/strict";
import test from "node:test";

import {
  derivePrivacyPoolCommitment,
  derivePrivacyPoolDepositPrecommitment,
  derivePrivacyPoolDepositSecrets,
  derivePrivacyPoolMasterKeys,
  derivePrivacyPoolWithdrawalSecrets,
} from "../../src/chrome/privacy/protocol/primitives";
import { poseidon as lightweightPoseidon } from "../../src/chrome/privacy/protocol/poseidonLite";

const FIXTURE_PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

test("official SDK derivation stays pinned to fixed bigint vectors", () => {
  const keys = derivePrivacyPoolMasterKeys(FIXTURE_PHRASE);
  assert.deepEqual(keys, {
    masterNullifier:
      5166235667641908426209962078587403958102858901466456053922152107655534895382n,
    masterSecret:
      2859269148228400235778357386281504626275970321488783750166899577742903687816n,
  });

  const deposit = derivePrivacyPoolDepositSecrets(keys, 123456789n, 0n);
  assert.deepEqual(deposit, {
    nullifier:
      20573704366212056790172682692320528065752794205134204126603167936243938159752n,
    secret:
      14728449902889765225946437026999859463692601622640113590808942774753651588317n,
  });
  assert.equal(
    derivePrivacyPoolDepositPrecommitment(deposit),
    21381912566992095161997580774829960999416698525239585958091240626965757610693n,
  );
  assert.deepEqual(derivePrivacyPoolWithdrawalSecrets(keys, 987654321n, 0n), {
    nullifier:
      17644668494477975099222827915703073771179321781825591459548279385219247340375n,
    secret:
      13612141968339987633057407416046092301949614837118370404941936083951123246027n,
  });
  assert.deepEqual(
    derivePrivacyPoolCommitment(1000000000000000n, 123456789n, deposit),
    {
      hash:
        12197795667488446963057187991921914302222209568157167003939966463967005581628n,
      precommitment:
        21381912566992095161997580774829960999416698525239585958091240626965757610693n,
      nullifierHash:
        15076993876716635040449663486723746771232727760112461357249146900272894273242n,
    },
  );
});

test("primitive adapter rejects malformed phrases and unbounded inputs", () => {
  assert.throws(() => derivePrivacyPoolMasterKeys("not a recovery phrase"));
  const keys = derivePrivacyPoolMasterKeys(FIXTURE_PHRASE);
  assert.throws(() => derivePrivacyPoolDepositSecrets(keys, 0n, 0n));
  assert.throws(() => derivePrivacyPoolDepositSecrets(keys, 1n, -1n));
  assert.throws(() =>
    derivePrivacyPoolDepositSecrets(keys, 1n, 0x1_0000_0000n),
  );
  assert.throws(() =>
    derivePrivacyPoolCommitment(-1n, 1n, {
      nullifier: 1n,
      secret: 2n,
    }),
  );
  assert.throws(() =>
    derivePrivacyPoolDepositPrecommitment({ nullifier: 0n, secret: 1n }),
  );
});

test("the service-worker Poseidon adapter matches the official SDK widths", async () => {
  const sdkCrypto = await import(
    "../../node_modules/@0xbow/privacy-pools-core-sdk/src/crypto.js"
  );
  assert.equal(
    lightweightPoseidon([1n]),
    18586133768512220936620570745912940619677854269274689475585506675881198879027n,
  );
  assert.equal(
    lightweightPoseidon([1n, 2n]),
    7853200120776062878684798364095072458815029376092732009249414926327459813530n,
  );
  assert.equal(
    lightweightPoseidon([1n, 2n, 3n]),
    6542985608222806190361240322586112750744169038454362455181422643027100751666n,
  );
  assert.throws(() => lightweightPoseidon([]));
  assert.throws(() => lightweightPoseidon([1n, 2n, 3n, 4n]));

  const phrase = FIXTURE_PHRASE;
  const keys = sdkCrypto.generateMasterKeys(phrase);
  const deposit = sdkCrypto.generateDepositSecrets(keys, 123456789n, 0n);
  assert.equal(
    lightweightPoseidon([deposit.nullifier, deposit.secret]),
    sdkCrypto.hashPrecommitment(deposit.nullifier, deposit.secret),
  );
});
