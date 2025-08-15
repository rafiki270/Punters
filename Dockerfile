FROM node:20-alpine AS base
WORKDIR /app

# Install server deps
COPY package.json package-lock.json* tsconfig.json ./
RUN npm ci || npm install

# Build server
COPY src ./src
RUN npm run build:server

# Build web
COPY web/package.json web/package-lock.json* ./web/
RUN npm --prefix web ci || npm --prefix web install
COPY web ./web
RUN npm --prefix web run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base /app/dist ./dist
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/web/dist ./web/dist
COPY package.json ./package.json
EXPOSE 3000
CMD ["node", "dist/server.js"]
