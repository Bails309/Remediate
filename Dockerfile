

FROM node:lts-slim AS deps
ARG APP_VERSION=1.1.6
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

FROM node:lts-slim AS dev
ARG APP_VERSION=1.1.6
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl
COPY package.json package-lock.json* ./
RUN npm install --include=dev --legacy-peer-deps
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
CMD ["sh", "-c", "npm run migrate && npm run dev"]

FROM node:lts-slim AS builder
ARG APP_VERSION=1.1.6
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
RUN npm run build

FROM node:lts-slim AS base-runner
ARG APP_VERSION=1.1.6
ENV APP_VERSION=${APP_VERSION}
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/next-env.d.ts ./next-env.d.ts
RUN chmod +x /app/scripts/app-entrypoint.sh /app/scripts/worker-entrypoint.sh

# Target for Main Application
FROM base-runner AS app-runner
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
EXPOSE 3000
CMD ["/bin/sh", "/app/scripts/app-entrypoint.sh"]

# Target for Background Worker
FROM base-runner AS worker-runner
CMD ["/bin/sh", "/app/scripts/worker-entrypoint.sh"]
