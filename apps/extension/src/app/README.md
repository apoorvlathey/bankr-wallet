# Extension application composition

This folder contains renderer-wide composition models and runtime boundaries
used by `App.tsx`. Feature components may depend on these dependency-light
models, but they never import the `App.tsx` composition root itself.

- `requestModel.ts` owns the discriminated pending-request union and its stable
  combined ordering.
- `lazyScreens.ts` owns route-level lazy imports and idle chunk preloading.
- `hooks/useRuntimeMessaging.ts` owns service-worker wake/retry messaging and
  the reconnecting renderer keepalive port.
- `home/` and `screens/` contain small App-owned presentation adapters.

Future extractions should follow one effect domain at a time (bootstrap,
runtime messages, viewport, request routing) instead of moving all App state
into one oversized controller hook.
