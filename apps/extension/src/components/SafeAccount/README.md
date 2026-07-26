# Safe account UI audit map

- `SafeEntryScreen.tsx`: starts progressive owner discovery as soon as an owner is selected, appends four-chain batches, shows verified network logos/tooltips, and submits background-issued verification receipt IDs so Add Safe performs no duplicate network probe.
- `SafeOwnerAccountPicker.tsx`: home-selector-style Safe-owner account selection
  on a dedicated picker screen. Eligibility comes from the shared background
  `safe/accountTypePolicy.ts`; only the selected account ID reaches the
  background lookup.
- `useSafeOwnerDiscovery.ts`: cancellable renderer state machine for bounded progressive owner-discovery pages and cross-chain result merging.
- `DiscoveredSafeRow.tsx`: selectable discovered Safe identity with independent
  copy, first-verified-chain explorer, verified-network mark utilities, and an
  inline Already added status that does not block opening the review.
- `SafeCapabilityBadge.tsx`: non-authoritative capability labels.
- `SafeVerificationCard.tsx`: compact per-network threshold, balance, version,
  owner-account, capability, and explorer summary used during import review.
  Owners use the shared labeled-address pill for wallet/contact names, avatars,
  copy, explorer, and contact editing. Previously imported Safes replace the
  capability badge with an Already added status.
- `SafeHomeAlert.tsx`: actionable home rail for proposals that need attention.
  Mounting the active Safe rail immediately starts a targeted request refresh,
  so popup/sidepanel open and account switching do not wait for the alarm. Its
  subtitle uses the shared unresolved-request count, including blocked items.
- `usePendingSafeProposalCount.ts`: shared local-inbox subscription for the
  active Safe home rail and the locked-wallet request notice. The locked view
  counts every unresolved Safe proposal without starting a remote sync or
  exposing proposal details before authentication.
- `SafeQuickActions.tsx`: reuses the canonical Send / Swap / Shield / More home
  controls. Send and Swap remain enterable; their own network selectors disable
  undeployed Safe chains and rank verified deployments first. Shield remains
  unavailable. The proposal banner is the only
  homepage approvals entry point; account settings owns security.
- `SafeSecurityScreen.tsx`: Warm Midnight account-settings composition,
  display-name editing, state loading, refresh, and removal orchestration.
- `SafeChainSettingsSection.tsx`: presentational per-chain authority ledger with
  owners rendered through the shared labeled-address pill, verified metadata,
  security extensions, and explorer/Safe links. A single deployment keeps the
  full ledger visible; multiple deployments use a one-at-a-time compact
  accordion and reveal the same details only for the selected network.
- `SafeRemoveDialog.tsx`: focused destructive confirmation that keeps published
  proposals and onchain data consequences explicit.

These components consume secret-free background responses. Signing and
authority decisions remain in `chrome/safe/`.
