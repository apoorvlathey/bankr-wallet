# Passkey tests

This folder covers record validation, frozen V1/V2 compatibility, facade
identity, WebAuthn ceremony behavior, wallet-type integration, and UI prompt
single-flight behavior. Native Never-session integration and adversarial
storage coverage live in `tests/session/passkeyNeverSession.test.ts`. Static
released records remain in `../fixtures/` so
current writer code cannot regenerate the compatibility baseline.
