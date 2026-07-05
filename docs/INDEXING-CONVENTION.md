# Sub-Layer Indexing Convention

## Rule

The project tracks major build stages of the Operational Canvas as numbered
layers (Layer 1 through Layer 8). Within a single layer, many smaller changes
occur over time. This convention gives each of those granular changes a
stable, referenceable sub-layer index.

- Whenever the user says the exact phrase **"New rule line"**, the current
  layer's sub-counter increments by one.
- The first use while on Layer 1 becomes `1.1`, the next `1.2`, then `1.3`,
  and so on, chronologically.
- When work moves to Layer 2, the sub-counter resets, and the first
  "New rule line" on Layer 2 becomes `2.1`, then `2.2`, etc.
- This pattern continues for every subsequent layer (`3.1, 3.2 ... 4.1,
  4.2 ...`, etc).
- Numbering is **not retroactive** - it begins fresh from the point this
  convention was introduced. Nothing built before this point is renumbered.

## Index

| Sub-Layer Index | Description |
|---|---|
