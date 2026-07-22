import { poseidon1 } from "poseidon-lite/poseidon1";
import { poseidon2 } from "poseidon-lite/poseidon2";
import { poseidon3 } from "poseidon-lite/poseidon3";

/**
 * Drop-in hash surface for the three input widths used by the pinned SDK.
 * Loading only these widths avoids parsing every Poseidon parameter set when
 * the MV3 service worker starts.
 */
export function poseidon(inputs: bigint[]): bigint {
  switch (inputs.length) {
    case 1:
      return poseidon1(inputs);
    case 2:
      return poseidon2(inputs);
    case 3:
      return poseidon3(inputs);
    default:
      throw new Error("Unsupported Privacy Pools Poseidon input width");
  }
}
