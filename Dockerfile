FROM node:20-bookworm-slim AS base
WORKDIR /app

# Install server deps
COPY package.json package-lock.json* tsconfig.json tsconfig.build.json ./
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && npm ci || npm install

# Copy Prisma schema before generating client
COPY prisma ./prisma

# Build server
COPY src ./src
RUN npm run prisma:generate && npm run build:server

# Build web
COPY web/package.json web/package-lock.json* ./web/
RUN npm --prefix web ci || npm --prefix web install
COPY web ./web
RUN npm --prefix web run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*
COPY --from=base /app/dist ./dist
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/web/dist ./web/dist
COPY prisma ./prisma
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
COPY package.json ./package.json
# Default to port 80 in container; can override via PORT env
ENV PORT=80
EXPOSE 80
CMD ["./docker-entrypoint.sh"]
