# Signature tests

These tests cover signature confirmation/release policy and the bounded EIP-712
schema, sanitization, delegation, and prototype-safety boundaries. The EIP-712
implementation mirrors `chrome/signatures/eip712/`; architecture coverage
freezes ownership/export identity while policy coverage freezes raw-delegation
and method-routing behavior.
