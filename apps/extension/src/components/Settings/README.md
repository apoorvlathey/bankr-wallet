# Settings UI audit map

- `index.tsx` is the Settings screen router/composition root.
- `settingsRegistry.tsx` declares settings destinations and metadata.
- Chain screens own user-facing network configuration forms.
- Authentication screens own password, biometric, agent-factor, auto-lock, and
  sound preference flows.

Settings components call trusted renderer message routes but do not reproduce
background authorization, storage, RPC, or cryptographic policy. New settings
subfeatures should use a focused component or hook instead of growing the root
router.
