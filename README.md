# Havensum — local development package

Android-first React Native/Expo expense tracker for Hugo and Marina, with a responsive PC browser display. The project starts from the last verified published **Melo** implementation, with subsequent local test hardening documented below. **Havensum branding and the newly requested features are documented work to implement**, not completed functionality.

## License

Private and proprietary. All rights reserved to the project owner. See [LICENSE](LICENSE). Third-party dependencies retain their own licenses.

## Start here

1. Read **HANDOFF.md** and **docs/HAVENSUM_REQUIREMENTS.md**.
2. Open this folder in Codex. Paste **NEXT_AGENT_PROMPT.md** as the initial task.
3. Use **DECISIONS.md**, **docs/ARCHITECTURE.md**, **docs/CSV_SPEC.md** and **docs/IMPLEMENTATION_PLAN.md** for context.

## Run locally

Use **Node 24.18 or later** with npm for the development/test harness. This also satisfies React Native's recorded engine minimum of 20.19.4. Android execution needs a compatible Expo runtime or Android development environment.

```sh
npm ci
npm test
npm run dev
```

For browser regressions, install Chromium with `npx playwright install chromium`, then run `npm run test:all`. See [docs/TESTING.md](docs/TESTING.md) for the agreed boundaries, coverage gates and verification limits.

Use the address printed by Vite. Open `/phone.html` at that address to inspect 320/360/396/412 px phone layouts. Its `?demo=1` iframe resets synthetic example data on reload. The ordinary root persists browser data separately. Browser and Android storage do not automatically sync.

```sh
npm run build
npm run check:android
npm run android
```

`check:android` exports a Metro/Hermes JS bundle, **not an APK**. `android` starts Expo for Android and requires the appropriate runtime/device setup. EAS profiles are included, but require your build account, application-ID decision and signing setup. No APK, keystore or provider credentials are supplied.

## Make it your repository

Extract this ZIP and open the `havensum-local-repo` folder as the repository root. If committing from a terminal inside it:

```sh
git init
git add .
git commit -m "Import Havensum prototype and handoff"
```

No Git history, remote, hosted-project binding, node_modules, build outputs, bank statements, live ledger, secrets or user account credentials are included. Add your own remote when ready. Nothing in this package needs the old hosted site to run. The old source revision is recorded only as provenance in BUNDLE-MANIFEST.json.

## Data continuity

Source transfer does **not** copy the ledger in the hosted app's browser storage. Export a full JSON backup from the existing app separately before moving real data. The current transaction importer is not a complete JSON restore; a reviewed full-state restore flow is pending. Do not clear old browser/device data until a restored copy is verified.

## Current capabilities and gaps

The original 25 tests have been expanded with financial invariants, native adapter checks and browser flows. Local test hardening and the defects it exposed are documented in [docs/TESTING.md](docs/TESTING.md). The outlook remains **plan-derived**, not the proposed independent Expected savings algorithm. BUNDLE-MANIFEST.json records the original imported package's provenance; it is not a manifest of later local edits.

Generic CSV/XLSX import, XLSX export and JSON backup exist. Downloadable Havensum templates, CSV export, verified bank adapters, expected-payback tasks and the rebrand are pending. Drive sync, ETF prices, exact Cashew compatibility, automatic annual interview and physical Android certification are also unfinished.

Averages and forecasting limitations, current balance date behavior, ID/schema migration and multi-year plan archival are detailed in HANDOFF.md. Read docs/UX_UPDATE.md as a historical implementation record; the later requirements supersede its plan-derived prediction formula.
