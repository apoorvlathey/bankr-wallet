# Ledger tests

These tests cover the hardware-wallet boundary without requiring a physical
device: derivation-path validation, trusted background routing, Chrome-only
offscreen exposure, exact service-worker authorization, public-only storage,
signing-policy wiring, commit-safe account selection, and deferred
pending-request terminalization across both transaction and message signing.
The no-device transaction lifecycle also freezes exact reviewed-nonce use,
including the nonce reservation boundary used by pending replacements.

Maintainer-confirmed real-device QA was completed on 2026-07-23 for WebHID
discovery, Ethereum-app prompts, address scans, transaction signatures,
personal signatures, and EIP-712 signatures. Repeat this matrix when Ledger
transport/signing policy or supported device/app behavior changes.
