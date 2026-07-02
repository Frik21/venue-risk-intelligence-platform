# VenueGuard Product Authority

The Product Constitution (`docs/Product-Constitution.md`) is the highest authority.

Engineering must never override product decisions.

If implementation conflicts with the Constitution:

- STOP.
- Explain the conflict.
- Wait for approval.

Never silently redesign VenueGuard. Engineering serves the product. The Product Constitution always wins.

# Workflow

Before every implementation task in this repo:

1. Create a feature branch.
2. Implement the requested task.
3. Run build (`pnpm run build`).
4. Run Constitution Compliance Check against `docs/Product-Constitution.md`.
5. Commit.
6. Push.
7. Open a Pull Request.
8. Wait for merge approval.

Report on completion:
- Branch
- Commit
- Build status
- Files changed
- Constitution compliance
- Pull Request URL

# VenueGuard Merge Policy

Never merge directly into main unless explicitly instructed.

# VenueGuard Debug Layer Rule

For complex UI work, build the interface in numbered layers.

Each layer must have a visible numbered badge used ONLY for debugging.

Example:

1 = Base Map
2 = Operational Layers
3 = Operational Footprint
4 = Country Intelligence
5 = Breathing Markers
6 = Alerts
7 = Routes
8 = Intelligence Overlay
...

Rules:

- Every layer must be independently renderable.
- Every layer must be independently hideable.
- Build from the bottom up.
- Do not continue to the next layer until the current layer is visually approved.
- The numbered badges are DEBUG ONLY.
- The badges must be implemented so they can be turned on/off with a single debug flag or component.
- Removing the badges must NEVER remove or affect the actual UI layer.
- Once the screen is approved, remove the numbered badges before merging, while leaving the layer structure intact.

Purpose: the numbered layers exist only to help debug rendering order, z-index, and stacking. They are never part of the production VenueGuard interface.
