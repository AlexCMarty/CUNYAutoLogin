<!-- Load when: editing anything under docs/**, the marketing/docs site, GitHub Pages deploy, or regenerating marketing screenshots -->

# CUNYAutoLogin — marketing/docs website (`docs/`)

The public site at **`cunyautologin.alexmarty.dev`** is a Jekyll
[just-the-docs](https://just-the-docs.github.io/just-the-docs/) site living in
`docs/` on `main`, so it travels with the code and can ship in the same PR. It is
built and deployed by `.github/workflows/pages.yml` (GitHub Actions) on any push
that touches `docs/**`. The committed `docs/CNAME` pins the custom domain.

## Layout

```
docs/
  _config.yml                  Jekyll + just-the-docs config
  index.md / install.md /      Site pages (Markdown front matter)
  faq.md / privacy.md
  CNAME                        cunyautologin.alexmarty.dev — keep as-is
  Dockerfile / docker-compose.yml   Pinned local-preview toolchain (no host Ruby)
  Gemfile                      Jekyll/just-the-docs gem pins
  _layouts/home-custom.html    Landing-page layout
  _includes/hero.html          Hero block + screenshot references
  _includes/head_custom.html   Extra <head> tags
  _sass/color_schemes/cunyautologin.scss   Maps extension design tokens → theme vars
  _sass/custom/custom.scss     Landing-page components
  assets/img/icon.svg
  assets/screenshots/          Marketing shots referenced by index.md / hero.html
```

## Local preview (Docker — no host Ruby needed)

```bash
cd docs
docker compose up          # first run builds the image, then serves http://localhost:4000
docker compose up --build  # rebuild only after editing docs/Gemfile
```

The bind mount live-reloads page/SCSS edits; build output stays in the container
(`/tmp/_site`) so it never litters the worktree. Native Ruby alternative:
`cd docs && bundle install && bundle exec jekyll serve` (http://127.0.0.1:4000).

## Hard rules — never violate

- **Page copy is sourced from `README.md` / `PRIVACY.md`.** Keep `docs/privacy.md`
  in sync with the repo-root `PRIVACY.md` — do not let them drift.
- **Styling mirrors the extension's design tokens** (`src/sidebar/sidebar.css`).
  Theme colors/fonts come through `_sass/color_schemes/cunyautologin.scss`; don't
  hardcode values that duplicate a token.
- **Do not edit `docs/CNAME`** unless intentionally changing the domain.
- Browser minimums and feature claims on the site must match `src/manifest.json`
  (Firefox **140+**, Chromium **141+**).

## Regenerating marketing screenshots

`docs/assets/screenshots/` holds the marketing shots.
`scripts/capture-sidebar.mjs` strips dev-only chrome (the `#qa=` jump banner and
the vault debug panel) before each capture, so a dev build yields
production-clean images. Onboarding states need a dev/e2e build (production
ignores `#qa=`); vault states inject storage directly and look identical from any
build.

```bash
npm run build:dev   # or build:e2e — production ignores #qa= hashes
npm run capture-sidebar -- '#qa=WELCOME'        # → guided-setup / welcome shots
npm run capture-sidebar -- --qa-vault-locked    # locked-vault.png
npm run capture-sidebar -- --qa-vault-unlocked  # 2fa-autofill.png
```

Output lands in `agent_screenshots/`; copy the chosen PNGs into
`docs/assets/screenshots/` with the names referenced by `index.md` / `hero.html`.

## One-time GitHub Pages setup (already done — reference only)

1. DNS at the `alexmarty.dev` provider: `CNAME` record `cunyautologin` →
   `alexmarty.github.io`.
2. Repo → Settings → Pages: **Source = GitHub Actions**, **Custom domain =
   `cunyautologin.alexmarty.dev`**, **Enforce HTTPS** on. `docs/CNAME` keeps the
   domain sticky across deploys.

Full human-facing version: `CONTRIBUTING.md` § "Website (`docs/`)".
