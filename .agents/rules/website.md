<!-- Load when: editing anything under docs/**, the marketing/docs site, GitHub Pages deploy, or updating marketing assets (promo video, social-share card) -->

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
  _includes/hero.html          Hero block + CTA + trust bar
  _includes/head_custom.html   Extra <head> tags
  _sass/color_schemes/cunyautologin.scss   Maps extension design tokens → theme vars
  _sass/custom/custom.scss     Landing-page components
  assets/img/icon.svg
  assets/img/og-card.{svg,png}  Social-share card: SVG source → PNG via `npm run og`
  assets/video/promo.mp4        Landing demo video (poster: promo-poster.jpg)
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

## Regenerating assets

**Social-share card** (`assets/img/og-card.png`) — edit the SVG source
(`assets/img/og-card.svg`), then:

```bash
npm run og   # headless Chromium → og-card.png (1200×630), Geist font baked in
```

Scrapers ignore an SVG `og:image`, so the served asset must be the PNG. It is
wired through `jekyll-seo-tag` via the `image:` key in `_config.yml` — no template
edits needed.

**Promo poster** (`assets/video/promo-poster.jpg`) — the frame shown before the
demo video loads, pulled straight from the clip. Re-extract whenever you replace
the video:

```bash
ffmpeg -y -ss 3 -i docs/assets/video/promo.mp4 -frames:v 1 \
  -vf scale=1440:-1 -q:v 3 docs/assets/video/promo-poster.jpg
```

## How Github pages was setup

1. **DNS** at the `alexmarty.dev` provider: a `CNAME` record `cunyautologin`
   → `alexmarty.github.io`. The apex `alexmarty.dev` is served by a separate repo
   and is unaffected — a project repo may claim a subdomain.
2. **Repo → Settings → Pages:** Source = **GitHub Actions**, Custom domain =
   `cunyautologin.alexmarty.dev`, and **Enforce HTTPS** is enabled. The committed `docs/CNAME` keeps the domain sticky across deploys.

## Hard rules — never violate

- **Page copy is sourced from `README.md`.** The privacy policy is maintained
  directly in `docs/privacy.md` (canonical) — there is no separate repo-root `PRIVACY.md`.
- **Styling mirrors the extension's design tokens** (`src/sidebar/sidebar.css`).
  Theme colors/fonts come through `_sass/color_schemes/cunyautologin.scss`; don't
  hardcode values that duplicate a token.
- **Do not edit `docs/CNAME`** unless intentionally changing the domain.
- Browser minimums and feature claims on the site must match `src/manifest.json`
  (Firefox **140+**, Chromium **141+**).

Contributor quick-start (local preview only) lives in `CONTRIBUTING.md` § "Working on the docs site"; this file is the full reference.
