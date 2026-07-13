# Background composition tests

These static contracts freeze the final MV3 entrypoint architecture:

- `background.ts` imports and invokes only the focused bootstrap;
- bootstrap performs only route, pipeline, and lifecycle composition;
- each coherent route-family composition stays independently audit-sized;
- the pipeline keeps the released gate and route order;
- every root router is explicitly reviewed and its dispatch literals exactly
  match its exported message manifest;
- composition imports remain acyclic, while routers, domains, and lifecycle
  modules cannot import upward into composition, bootstrap, or the pipeline.

Router behavior remains covered by sibling `tests/background/*Router.test.ts`
files. Lifecycle callback behavior remains under `tests/background/lifecycle/`.
