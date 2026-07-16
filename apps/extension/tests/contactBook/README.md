# Address Contact Book tests

1. `repository.test.ts` freezes address and label validation, alphabetical
   insertion, stable manual ordering, duplicate rejection, deletion, and stale
   reorder rejection.
2. `labelSuppression.test.ts` proves a local contact wins before the public
   label cache and prevents the network label endpoint from being called.
3. `background/contactBookRouter.test.ts` covers the trusted wallet-UI message
   boundary and mutation broadcasts from the background test domain.
