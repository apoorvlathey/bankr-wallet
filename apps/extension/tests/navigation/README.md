# External navigation tests

`externalNavigation.test.ts` freezes the public-HTTPS policy used before opening
remote sites and explorers, including the narrow loopback exception for local
custom explorers and normalization of legacy unsafe values.

This domain is separate from fetch/RPC egress: a URL that is safe for explicit
user navigation is not automatically an allowed background fetch target.
