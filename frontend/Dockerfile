# --- deps: install all dependencies (devDependencies are needed because
# `next build` runs ESLint and the TypeScript check) ---
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Prefer IPv4: on hosts without working IPv6, Node tries the registry's AAAA
# records first and `npm ci` dies with ETIMEDOUT.
RUN NODE_OPTIONS=--dns-result-order=ipv4first npm ci

# --- builder: produce the standalone Next.js server and the service worker ---
FROM node:20-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Set to "true" to skip generating the service worker (test deployments).
ARG DISABLE_PWA
ENV DISABLE_PWA=${DISABLE_PWA}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- runner: minimal production image ---
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs

# BACKEND_HOST / BACKEND_PORT / BACKEND_PROTOCOL / BACKEND_ENV are read at
# runtime by the /api/proxy route, so they are passed at `docker run` /
# compose time, not baked in here.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/manifest.json || exit 1

CMD ["node", "server.js"]
