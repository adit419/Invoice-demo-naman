FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --frozen-lockfile

COPY . ./
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_BE_BASE_URL=http://localhost:8099
ENV NEXT_PUBLIC_BE_BASE_URL=${NEXT_PUBLIC_BE_BASE_URL}

# Build the Next.js app (standalone output)
RUN npm run build

# ── Production image ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Standalone output already bundles the minimal node_modules it needs
COPY --from=builder /app/.next/standalone/ ./
COPY --from=builder /app/.next/static/ ./.next/static/
COPY --from=builder /app/public ./public/

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3001

CMD ["/app/docker-entrypoint.sh"]
