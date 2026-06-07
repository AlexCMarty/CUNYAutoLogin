# Local preview tooling for the Jekyll site — no host Ruby install needed.
# Build: docker compose build   Run: docker compose up
FROM ruby:3.3-slim

# Native gem deps (just-the-docs/sass-embedded, jekyll dependencies).
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /site

# Install gems at image-build time so `up` is fast and reproducible.
# Only Gemfile is copied so changing site content doesn't bust this layer.
COPY Gemfile ./
RUN bundle install

EXPOSE 4000 35729

# Serve to all interfaces (so the host can reach it) with livereload.
# Destination is a container-only path to keep the mounted source clean.
CMD ["bundle", "exec", "jekyll", "serve", \
     "--host", "0.0.0.0", \
     "--livereload", \
     "--destination", "/tmp/_site"]
