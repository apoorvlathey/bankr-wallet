# Seed Phrase Setup

- `../SeedPhraseSetup.tsx` owns generated/imported mnemonic state and background effects.
- `SetupFrame.tsx` owns the onboarding-versus-extension screen shell and sticky actions.

Mnemonic persistence remains delegated to the background. Presentation files do
not read storage or perform wallet operations.
