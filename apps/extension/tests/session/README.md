# Session tests

This folder covers in-memory cache semantics, encrypted Never-session envelope
validation, restoration races, native-session cleanup, and Firefox fallback
behavior. Session tests intentionally exercise the stable `sessionCache.ts`
facade while architecture coverage verifies one-way dependencies underneath.
