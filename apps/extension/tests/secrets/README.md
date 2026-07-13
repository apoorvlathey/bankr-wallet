# Secret-release tests

These tests mirror `src/chrome/secrets/`. Architecture coverage freezes facade
identity and dependency direction; vault race tests exercise master/agent,
password, passkey, timeout, factor-removal, and password-rotation interleavings.
