# Mobile application primitive audit map

This is the public, domain-free application layer described in
`_docs/STYLING.md`.

- Screen modules own header/body/sticky-action composition.
- List modules own shared list surfaces, rows, loading, and empty states.
- Picker and action-sheet modules own reusable overlay interaction grammar.
  Full-screen picker content remains full-height but centers within the wallet's
  480px content measure when an extension tab provides more horizontal space.
  Search controls may render compact contextual content beside their visible
  label without placing it inside the query field.
- Confirmation modules own generic outcome, delta, and disclosure layout.
- `index.ts` is the public export boundary.

These modules accept renderable content, labels, state, and callbacks. They do
not import wallet features or access Chrome, storage, signing, or network APIs.
