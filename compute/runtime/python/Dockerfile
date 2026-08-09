# Cencori Compute — Python agent runtime base image (v0).
#
# Self-building (like the Node base): at boot it clones the repo@commit, runs the
# detected install/build commands, then serves. For a *generic* Python agent it
# serves via the baked-in Cencori shim (cencori_shim.py), which wraps the user's
# AGENT_ENTRYPOINT ("module:attr") in the Runtime Contract. Native Python
# frameworks (LangGraph, CrewAI) supply their own START_COMMAND / shim.
#
# Build & push (one-time — COMPUTE_RUNTIME_SETUP.md):
#   fly auth docker
#   docker build -t registry.fly.io/cencori-python-runtime:latest compute/runtime/python
#   docker push  registry.fly.io/cencori-python-runtime:latest
FROM python:3.12-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends git curl ca-certificates tar \
 && rm -rf /var/lib/apt/lists/*

# uv for fast installs; fastapi + uvicorn power the generic shim.
RUN pip install --no-cache-dir uv fastapi uvicorn

COPY cencori_shim.py /opt/cencori/cencori_shim.py

WORKDIR /app
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENV PORT=8080 PYTHONUNBUFFERED=1
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
