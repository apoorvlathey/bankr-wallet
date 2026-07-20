# Settings UI audit map

- `index.tsx` is the Settings screen router/composition root.
- `settingsRegistry.tsx` declares settings destinations and metadata.
- `EditChain.tsx` composes the edit form and save/validation flow.
- `NetworkIdentityFields.tsx` renders the editable/read-only network name and
  chain-ID controls.
- `useEditChainRpcEndpoints.ts` composes endpoint history and built-in RPC
  persistence into the select/add/edit/remove actions consumed by Edit Chain.
- `RpcEndpointManager.tsx` composes the named saved-RPC dropdown, selected status,
  per-row edit actions, confirmed removal, and add/edit transition; it has no
  storage or network effects.
- `RpcEndpointEditor.tsx` and `RpcEndpointFavicon.tsx` own the full-width editor
  with a single-line URL field, label-row copy action, and sanitized
  provider-favicon presentation respectively.
- `RpcEndpointRemoveDialog.tsx` owns the destructive endpoint-removal prompt.
- `rpcEndpointModel.ts` owns pure URL/domain presentation helpers.
- `useNetworkRpcEndpoints.ts` loads the selected chain's local endpoint history
  and falls back to the active RPC while legacy wallets have no history record.
- `useBuiltInRpcPersistence.ts` probes active-endpoint changes and immediately
  persists built-in-chain endpoint selection/history through `updateNetwork`;
  inactive endpoint metadata edits retain the current runtime endpoint.
- `CustomNetworkDetails.tsx` presents custom-chain explorer and native-currency
  fields behind the advanced disclosure.
- The remaining chain screens own network list and add-chain flows.
- Authentication screens own password, biometric, agent-factor, auto-lock, and
  sound preference flows. Agent-factor creation explicitly collects the
  current master password even during a passwordless passkey master session;
  the background remains responsible for validating that recovery proof.

Settings components call trusted renderer message routes but do not reproduce
background authorization, storage, RPC, or cryptographic policy. New settings
subfeatures should use a focused component or hook instead of growing the root
router.

`PrivacyRecoverySettings.tsx` is the dedicated secret-bearing Shield phrase
backup/restore surface. It owns only temporary form/display state and clipboard
effects; the background owns password proof, vault mutation, and Sepolia
rescan policy. `PrivacyRecoverySettingsRow.tsx` keeps its agent-disabled
navigation presentation out of the Settings registry composition file.
