/**
 * Public fixed circuit inputs from `packages/circuits/inputs/{commitment,
 * withdraw}/default.json` at protocol commit
 * 434fbb8dc6783b98e100630f3debad1920d385e8. These are self-test fixtures,
 * never wallet or user secrets.
 */

const ZERO_SIBLINGS = Object.freeze(Array.from({ length: 30 }, () => "0"));

export const COMMITMENT_SELF_TEST_INPUT = Object.freeze({
  value: "12",
  label:
    "115792089237316195423570985008687907853269984665640564039457584007913129639935",
  nullifier: "56",
  secret: "78",
});

/** Valid-field fixture used to bind every commitment proof public signal. */
export const COMMITMENT_BINDING_SELF_TEST_INPUT = Object.freeze({
  value: "12",
  label: "34",
  nullifier: "56",
  secret: "78",
});

export const WITHDRAWAL_SELF_TEST_INPUT = Object.freeze({
  withdrawnValue: "1000000000000000000",
  stateRoot:
    "11647068014638404411083963959916324311405860401109309104995569418439086324505",
  stateTreeDepth: "2",
  ASPRoot:
    "17509119559942543382744731935952318540675152427220720285867932301410542597330",
  ASPTreeDepth: "2",
  context: "7682233326816519",
  label: "2310129299332319",
  existingValue: "5000000000000000000",
  existingNullifier: "2827991637673173",
  existingSecret: "7338940278733227",
  newNullifier: "1800210687471587",
  newSecret: "6593588285288381",
  stateSiblings: Object.freeze([
    "6398878698952029",
    "13585012987205807684735841540436202984635744455909835202346884556845854938903",
    ...ZERO_SIBLINGS,
  ]),
  stateIndex: "3",
  ASPSiblings: Object.freeze([
    "3189334085279373",
    "1131383056830993841196498111009024161908281953428245130508088856824218714105",
    ...ZERO_SIBLINGS,
  ]),
  ASPIndex: "3",
});
