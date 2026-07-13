/**
 * Stable account-storage facade.
 *
 * Storage schemas and public import paths remain unchanged while ownership is
 * split into repository, selection, Bankr, local, seed-account, and seed-group
 * modules that can be reviewed and tested independently.
 */

export {
  addressExists,
  findAccountByAddress,
  findNonImpersonatorAccountByAddress,
  getAccountById,
  getAccounts,
  getAccountsByType,
  getFirstAccount,
  normalizeEvmAccountAddress,
  reorderAccounts,
  updateAccountDisplayName,
} from "./accounts/repository";
export {
  clearAllTabAccounts,
  clearTabAccount,
  getActiveAccount,
  getActiveAccountId,
  getTabAccount,
  getTabAccounts,
  setActiveAccountId,
  setTabAccount,
} from "./accounts/selectionStorage";
export {
  addBankrAccount,
  addBankrAccountWithCredentialUpdate,
  updateBankrAccountAddress,
  updateBankrAccountAddressWithCredentialUpdate,
  validateBankrAccountAddressUpdate,
} from "./accounts/bankrStorage";
export {
  addImpersonatorAccount,
  addPrivateKeyAccount,
  clearAllAccounts,
  removeAccount,
} from "./accounts/localStorage";
export {
  addSeedPhraseAccount,
  convertToSeedPhraseAccount,
} from "./accounts/seedStorage";
export {
  addSeedGroup,
  getSeedGroups,
  removeSeedGroup,
  renameSeedGroup,
  updateSeedGroupCount,
} from "./accounts/seedGroupStorage";
