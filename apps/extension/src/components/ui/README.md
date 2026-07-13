# Mobile application primitive audit map

This is the public, domain-free application layer described in
`_docs/STYLING.md`.

- Screen modules own header/body/sticky-action composition.
- List modules own shared list surfaces, rows, loading, and empty states.
- Picker and action-sheet modules own reusable overlay interaction grammar.
- Confirmation modules own generic outcome, delta, and disclosure layout.
- `index.ts` is the public export boundary.

These modules accept renderable content, labels, state, and callbacks. They do
not import wallet features or access Chrome, storage, signing, or network APIs.
