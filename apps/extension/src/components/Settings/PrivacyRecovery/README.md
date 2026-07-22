# Shield recovery Settings audit map

- `PrivacyRecoverySettings.tsx` owns the trusted-UI message effects, transient
  secret state, timeout/clipboard lifecycle, and menu/backup/replace routing.
- `RecoveryMenu.tsx` presents the two Settings destinations without effects.
- `RecoveryBackupScreen.tsx` owns the backup form composition and optional
  current-balance warning context.
- `RecoveryPhrasePanel.tsx` keeps a revealed phrase concealed by default and
  owns only the visibility/copy presentation callbacks.
- `RecoveryReplacementConfirm.tsx` presents the two explicit destructive
  acknowledgements; the background independently enforces their request flags
  and an exact revision-bound backup marker.
- `RecoveryImportScreen.tsx` presents retained phrase/password inputs. It never
  mutates storage directly.
- `ShieldBalanceSummary.tsx` formats only aggregate public portfolio values.
- `types.ts` contains renderer-only response and navigation contracts.

All cryptographic validation, master-password proof, phrase replacement,
rebuildable database deletion, and rescan policy remain background-owned.
