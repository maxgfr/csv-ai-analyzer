# ---- Base ----
FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.24.0 --activate
WORKDIR /app

# ---- Dependencies ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/csv-charts-ai/package.json ./packages/csv-charts-ai/
RUN pnpm install --frozen-lockfile

# ---- Builder ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/csv-charts-ai/node_modules ./packages/csv-charts-ai/node_modules
COPY . .

# Docker COPY follows symlinks, breaking pnpm workspace link.
# Restore it so Node.js resolves csv-charts-ai to the real package source.
RUN rm -rf node_modules/csv-charts-ai && \
  ln -s ../packages/csv-charts-ai node_modules/csv-charts-ai

# Build workspace package first, then the app
ENV SKIP_ENV_VALIDATION=1
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_OUTPUT_MODE=standalone

# "prebuild" builds the csv-charts-ai package first
RUN pnpm build

# ---- Runner ----
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
  adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set correct permissions for prerender cache
RUN mkdir .next && chown nextjs:nodejs .next

# Copy standalone build
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
