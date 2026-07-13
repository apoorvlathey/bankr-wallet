# ENS browsing tests

This directory audits the web-accessible ENS browsing subsystem:

- `senderAuthorization.test.ts` freezes the exact page, top-frame, and content
  script combinations allowed to call each ENS browsing message.
- `gatewayEgress.test.ts` freezes local Kubo host validation and redirect-free,
  credential-free probe requests.

The manifest exposure of the packaged ENS pages is covered in `../manifest/`.
