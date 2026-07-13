# Bankr boundary tests

These tests cover bounded Bankr responses, credential-to-request binding,
submission races, and chat egress. They exercise the
remote signer boundary without mixing it into local-key tests.

Local swap account/effect ordering lives in `../transactions/`.

`architecture.test.ts` freezes the transport/response/effect dependency
direction, domain aggregate identities, and empty Bankr/chat root namespace.
