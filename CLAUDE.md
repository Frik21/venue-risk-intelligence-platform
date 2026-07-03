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
- Codespace dev server restart command (see below)

## Codespace dev server restart command

Whenever work stops for review, include the exact commands to check out
the branch and restart the dev server in the Codespace, e.g.:

```bash
git fetch origin <branch-name>
git checkout <branch-name>
git pull
cd artifacts/risk-assessments
PORT=3000 BASE_PATH=/ pnpm run dev
```

A browser refresh alone is not enough - the dev server must be fully
stopped and restarted to pick up new commits.

# VenueGuard Merge Policy

Never merge directly into main unless explicitly instructed.
