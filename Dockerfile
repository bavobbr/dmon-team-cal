# syntax=docker/dockerfile:1

# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Placeholders at build time — actual secrets injected at runtime via Cloud Run
RUN API_USER=x API_PASSWORD=x SITE_USER=x SITE_PASSWORD=x npm run build

# ── Stage 2: production image ──────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./
RUN npm ci --omit=dev

# Cloud Run injects PORT; SvelteKit node adapter reads HOST + PORT
ENV HOST=0.0.0.0

EXPOSE 3000

CMD ["node", "build/index.js"]
