# Cencori Compute — base agent runtime image (v0).
#
# One prebaked image for all agents. It is self-building: at boot the container
# clones the agent's repo at the pinned commit, runs `arcie build`, and serves
# the Runtime Contract (GET /_health, POST /invoke, …) on $PORT. This keeps the
# deploy API free of Docker builds — the machine does the work.
#
# Build & push (one-time, see COMPUTE_RUNTIME_SETUP.md):
#   fly auth docker
#   docker build -t registry.fly.io/cencori-arcie-runtime:latest compute/runtime
#   docker push registry.fly.io/cencori-arcie-runtime:latest
#
# Node >= 23.6 is required: Arcie imports agent tool `.ts` files at runtime via
# native type-stripping.
FROM node:23-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends git curl ca-certificates tar \
 && rm -rf /var/lib/apt/lists/*

# Bake the Arcie CLI in so `arcie build` doesn't reinstall on every cold start.
RUN npm install -g arcie

# The generic Node shim (wraps a plain agent module in the Runtime Contract).
COPY cencori-shim.mjs /opt/cencori/cencori-shim.mjs

WORKDIR /app
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
