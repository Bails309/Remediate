# syntax=docker/dockerfile:1

FROM node:lts-slim AS deps
ARG APP_VERSION=unknown
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl
COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps

FROM node:lts-slim AS dev
ARG APP_VERSION=unknown
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl
COPY package.json package-lock.json ./
RUN npm install --include=dev --legacy-peer-deps
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
CMD ["sh", "-c", "npm run migrate && npm run dev"]

FROM node:lts-slim AS builder
ARG APP_VERSION=unknown
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
RUN npm run build

FROM node:lts-slim AS runner
ARG APP_VERSION=unknown
ENV APP_VERSION=${APP_VERSION}
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
RUN chmod +x /app/scripts/entrypoint.sh
EXPOSE 3000
CMD ["/bin/sh", "/app/scripts/entrypoint.sh"]
