FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
RUN npm rebuild sharp

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV GALLERY_ROOT=/tmp
RUN npm run build

FROM base AS runner
RUN apk add --no-cache vips
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Pre-create the default cache mount point with the runtime user's ownership
# so a fresh named volume mounted at /cache inherits it (Docker seeds the
# volume from the image on first use). Without this the process (running
# as nextjs / uid 1001) can't mkdir under a root-owned volume.
RUN mkdir -p /cache && chown -R nextjs:nodejs /cache

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
