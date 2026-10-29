# pi-host runtime image — the documented BUILD path for a self-contained copy of
# the daemon.
#
# This file is NOT how the interim deployment runs. The agent's docker socket
# grants images:pull and containers:*, but BUILD=403 is permanent, so nothing
# here can be built from inside the sandbox and no deployment may depend on a
# build that cannot run. deploy/docker-compose.yml therefore uses `image:
# node:26-slim` plus a bind mount of the repo tree. This Dockerfile exists so the
# container can later be built by a host session that does hold BUILD, and so the
# runtime contract (workdir, deps, user, entrypoint) is written down once.
FROM node:26-slim

# git: the subagent system's worktrees are created by the daemon calling git
# from inside the container; the slim image ships none. ca-certificates: node
# fetches (matrix + ollama) over HTTPS through the TLS stack, which loads the
# system trust store.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends git ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /opt/pi-host

# vendor/ must come in BEFORE the install: every @earendil-works dependency is a
# local tarball (`file:vendor/*.tgz`), so package.json alone cannot be resolved.
COPY package.json package-lock.json ./
COPY vendor ./vendor

# Assumes registry access at build time for tsx/typescript/vitest (npm ci is the
# install-equivalent of `npm install` here, reproducible from the committed
# lock); the earendil packages resolve from vendor/, not the registry.
# Dev dependencies are kept so `npm run typecheck && npm test` also work inside
# the image, which is what the gates need.
RUN npm ci --no-audit --no-fund

COPY . .

# uid/gid 1000 is both the host user's and this image's `node` user. Matching
# them keeps everything the daemon writes under /opt/pi-host/storage and
# /opt/pi-host/workspace host-owned — a root-run container leaves root-owned
# SQLite files that the host session can no longer administer.
USER 1000:1000

# The Matrix homeserver is reachable by its network alias inside
# home_server_home_server-network, so the daemon's own http://conduit:6167
# default is correct here and no Cloudflare hop is involved at all.
ENV MATRIX_HOMESERVER=http://conduit:6167 \
	PI_HOST_DB=/opt/pi-host/storage/session.sqlite \
	PI_HOST_SANDBOX=/opt/pi-host/workspace \
	NODE_OPTIONS=--dns-result-order=ipv4first

# Secrets are mounted, never baked: the host tmpfs /dev/shm/pi-host is bind-held
# read-only at /run/secrets and the entrypoint reads the two files from there.
# Nothing secret is ever an ARG, ENV or `-e` value (that leaks through
# `docker inspect`).
VOLUME ["/run/secrets"]

ENTRYPOINT ["/opt/pi-host/scripts/run-container-daemon.sh"]
