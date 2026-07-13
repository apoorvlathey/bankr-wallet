/** Stable cross-dapp batch compatibility facade. */
export {
  handleAddCallsToCrossDappBatch,
  handleAddToCrossDappBatch,
} from "./crossDappBatch/intake";
export {
  handleRejectCrossDappBatch,
  handleRemoveFromCrossDappBatch,
  handleUpdateCallInCrossDappBatch,
} from "./crossDappBatch/staging";
export { handleConfirmCrossDappBatch } from "./crossDappBatch/confirmation";
