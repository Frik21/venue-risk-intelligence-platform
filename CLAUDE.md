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

# Session Continuity

If this session is starting fresh - no memory of prior conversation in this repo (e.g. a brand new session, or context that was compacted/summarized) - say so explicitly to the user before doing anything else. Don't silently improvise commands or workflows from guesswork.

The command to visually check the site (build + serve, single command, run by the user in their own terminal after a `git pull` of the working branch). `serve` is a root workspace script - it only exists at the repo root, not inside `artifacts/api-server` or `artifacts/risk-assessments`, so the `cd` to repo root is not optional:

```
cd /workspaces/venue-risk-intelligence-platform
git pull origin <branch>
pnpm run serve
```

Always give this exact command, with the repo-root `cd` included every time regardless of what directory the user's prompt shows them in - for visual verification. Don't substitute `pnpm run dev`, `pnpm run dev:all`, or a manually-assembled scratch-DB/Playwright setup unless the user explicitly asks for something different.

# Notes & Follow-ups

- **City/town database ceiling**: the search bar's city data (`city-registry.ts`) comes from Natural Earth's populated-places dataset, capped at 7,342 places worldwide - real cities and towns, but not exhaustive (e.g. Stellenbosch isn't in it). Come back to this later if we want a genuinely bigger database - likely means switching to a much larger source (e.g. GeoNames) and probably a real search backend instead of a static file shipped to the browser, since that kind of dataset is much bigger than what fits in a static array.
- **"Task Pending Quotation"**: on the Quotations page (`costs.tsx`), between the Quotes ledger and the Quotation Workspace - lists tasks with no formal Quote linked yet (`quotes.taskId` is null for that task). Its "Create Quote" button opens the Create Quote dialog pre-filled from the task (client/venue/requirements/dates/resources/manager), and the task drops off this list once that quote is saved.
- **"Vendors" placeholder**: new sidebar item (`/admin/vendors`, above Task Archived) per direct product direction - left empty for now, scope not yet defined. No schema/backend yet either.
- **"Communications" placeholder**: new sidebar item (`/admin/communications`, above Clients) per direct product direction - left empty for now, scope not yet defined. No schema/backend yet either.
- **"Invoices" placeholder**: new sidebar item (`/admin/invoices`, above Operator Deployment) per direct product direction - left empty for now, scope not yet defined. No schema/backend yet either.
- **"Payroll" placeholder**: new sidebar item (`/admin/payroll`, above OSINT) per direct product direction - left empty for now, scope not yet defined. No schema/backend yet either.
