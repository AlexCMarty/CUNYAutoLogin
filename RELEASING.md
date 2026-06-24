# Releasing CUNYAutoLogin

Releases are **automated**: pushing a `vX.Y.Z` tag runs the whole pipeline in [release.yml](.github/workflows/release.yml) — tests, build, GitHub Release, and (after a one-click approval) submission to both stores. This doc is for **maintainers**; it assumes repo write access, store credentials wired up as GitHub secrets, and access to the protected `production` environment.

For day-to-day build and test, see **[CONTRIBUTING.md](CONTRIBUTING.md)**.

---

## Cut a release

```bash
npm run test                       # unit + e2e — green before you tag
npm run bump -- <patch|minor|major|x.y.z>   # bumps package.json, src/manifest.json, src/manifest.e2e.json, lockfile
git commit -am "chore(release): vX.Y.Z"     # commit the version bump
git tag vX.Y.Z                     # tag must match the bumped version
git push && git push --tags        # the tag push triggers the workflow
```

Tags containing `beta` or `rc` are published as **prereleases**.

> **Version fields and the tag must agree.** A guard fails the run if the tag's numeric core ≠ the `version` in `package.json`, `src/manifest.json`, or `src/manifest.e2e.json`, or if a stable tag isn't strictly greater than the previous stable release (prereleases are exempt from the monotonic check). `npm run bump` keeps all three version fields in sync — always bump through it rather than editing them by hand.

---

## What the workflow does

**Job 1 — `build-and-release`** (runs on every `v*` tag):

1. **Guards** — refuses to proceed if a workflow would build E2E artifacts in a store release, or if the production `manifest.json` contains the Playwright fixture host; then the version / monotonicity guard above.
2. **Test** — `npm run test:unit`, then `npm run test:e2e` (the Playwright report is uploaded as an artifact on failure).
3. **Build + zip** — `npm run build`, then zips `dist/` → `CUNYAutoLogin-<tag>.zip`.
4. **Source archive** — `git archive` → `source.zip` (AMO requires reviewable source for bundled add-ons).
5. **GitHub Release** — created with the zip attached and auto-generated notes; marked `prerelease` for `beta` / `rc` tags.

**Job 2 — `publish`** (gated): blocks on the **`production`** environment, which has a **required reviewer** — the run pauses for a one-click **Approve** in the Actions UI before anything reaches a store. On approval it submits the built zip to:

- **Chrome Web Store** via `wdzeng/chrome-extension` — uploads the zip and **submits it for review** (auto-publishes on approval).
- **Mozilla AMO** via `wdzeng/firefox-addon` — submits for review with `source.zip` attached (GUID `cunyautologin@alexmarty.dev`).

---

## One-time / first-rollout wiring

- **Chrome auto-publishes.** `release.yml` submits the zip to CWS for review (no `upload-only`), so an approved tag goes live without a manual dashboard step.
- **Required secrets** — Chrome: `CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN`. AMO: `AMO_JWT_ISSUER`, `AMO_JWT_SECRET`. The `publish` job also needs the `production` environment to exist with a required reviewer.

---

## "Is my change live?"

Store review takes roughly a day per store. **Only the last tag that has cleared CWS review is what users are running** — a merged `main` commit, or a freshly cut tag still in review, is not yet shipping. Once CWS publishes, Chrome / Edge auto-update propagates within a few hours; treat an approved release as effectively unrecallable, because auto-update is fast and unconditional.

GitHub-only installers can download the release zip and load it unpacked / as a temporary add-on — that path is documented in [README.md](README.md) for anyone who wants a build before the stores approve it.
