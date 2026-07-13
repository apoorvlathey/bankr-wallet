/** Stable compatibility facade for local signing operations. */

export type {
  BeforeLocalTransactionBroadcast,
  CustomChainMeta,
  SignedTransaction,
  TransactionRequest,
} from "./localSigning/types";
export {
  broadcastSerializedTransaction,
  isBroadcastOutcomeUncertain,
  prepareSignAndBroadcastTransaction,
} from "./localSigning/transactionBroadcast";
export {
  signAndBroadcastTransaction,
  signEip7702Authorization,
} from "./localSigning/transactionSigner";
export {
  handleSignatureRequest,
  signMessage,
  signTypedData,
} from "./localSigning/messageSigner";
export { deriveAddress, isValidPrivateKey } from "./localSigning/privateKey";
