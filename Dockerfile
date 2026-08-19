

FROM node:lts-slim AS deps
ARG APP_VERSION=1.8.1
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl
COPY package.json package-lock.json* ./
# `npm ci` (not `npm install`) so the image resolves exactly the tree that the
# dependency-audit gate approved; `npm install` is free to pick newer versions.
RUN npm ci --legacy-peer-deps

FROM node:lts-slim AS dev
ARG APP_VERSION=1.8.1
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl
COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
# Drop privileges for dev container as well — node:lts-slim ships a UID 1000 'node' user.
USER node
CMD ["sh", "-c", "npm run migrate && npm run dev"]

FROM node:lts-slim AS builder
ARG APP_VERSION=1.8.1
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
RUN npm run build

# Production-only dependency tree for the runtime image. Rebuilding
# node_modules with --omit=dev drops devDependencies (vite, vitest,
# @babel/core, playwright, jsdom, etc.) that were flagged by container
# scans but are not needed at runtime, which eliminates a large batch of
# CVEs from the app and worker images (e.g. CVE-2026-53571 / CVE-2026-53632
# in vite, plus various @babel and testing-library findings).
FROM node:lts-slim AS prod-deps
ARG APP_VERSION=1.8.1
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci --omit=dev --legacy-peer-deps \
  && npx prisma generate \
  && npm cache clean --force

FROM node:lts-slim AS base-runner
ARG APP_VERSION=1.8.1
ENV APP_VERSION=${APP_VERSION}
WORKDIR /app
# Apply the latest Debian security patches (openssl, libc6, zlib, glibc, etc.)
# on top of the base image, then delete the globally-installed npm CLI.
#
# npm is not needed at runtime: both entrypoints invoke node and the
# node_modules/.bin binaries directly, and dependencies are installed in the
# separate prod-deps stage. Its bundled dependencies (tar, brace-expansion,
# ip-address, undici, sigstore, minimatch, ...) were previously the largest
# source of CVEs reported against these images, and were being chased by
# pinning NPM_VERSION to whichever release happened to have patched them.
# That was a treadmill: new advisories land against npm's vendored tree
# regardless of this application's own dependencies, and the fix depended on
# npm shipping a release. Removing the CLI eliminates the class outright.
#
# If a future change genuinely needs npm at runtime, restore it here rather
# than reintroducing `npm`/`npx` into an entrypoint.
RUN apt-get update -y \
  && apt-get upgrade -y \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && rm -rf /usr/local/lib/node_modules/npm \
       /usr/local/bin/npm \
       /usr/local/bin/npx \
       /root/.npm
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Prefer the production-only tree from prod-deps over the full (dev-included)
# tree from builder so devDependencies do not ship in the runtime image.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/next-env.d.ts ./next-env.d.ts
# `next.config.ts` MUST be present at runtime even though `next build` already
# read it. `next start` re-loads it on boot to apply runtime-only flags such
# as `poweredByHeader: false`, `serverExternalPackages`, custom `headers()`,
# etc. Omitting this file silently restores Next.js defaults — most visibly
# the `X-Powered-By: Next.js` response header.
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/auth.ts /app/auth.config.ts /app/proxy.ts /app/middleware.ts* ./
RUN chmod +x /app/scripts/app-entrypoint.sh /app/scripts/worker-entrypoint.sh
# Run as the non-root 'node' user (UID 1000) baked into the official Node image.
# Done in base-runner so both app-runner and worker-runner inherit it.
RUN chown -R node:node /app
USER node

# Target for Main Application
FROM base-runner AS app-runner
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
EXPOSE 3000
CMD ["/bin/sh", "/app/scripts/app-entrypoint.sh"]

# Target for Background Worker
FROM base-runner AS worker-runner
CMD ["/bin/sh", "/app/scripts/worker-entrypoint.sh"]
