# syntax=docker/dockerfile:1
# ---- Base image: pin Node 22 explicitly so Prisma 7 is happy ----
FROM node:22-slim AS base
WORKDIR /app
# Prisma needs OpenSSL at runtime
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# ---- Build stage: compile TypeScript and generate Prisma client ----
FROM base AS build
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# postinstall runs `prisma generate` — needs schema present (it is, above)
RUN npm ci
COPY . .
RUN npm run build

# ---- Production stage: lean runtime image ----
FROM base AS prod
ENV NODE_ENV=production
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# Install prod deps only (keeps `prisma` CLI because it's in dependencies, not devDependencies)
RUN npm ci --omit=dev
# Copy build artifacts from the build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/generated ./generated
EXPOSE 3000
# `npm run start` = `prisma migrate deploy && node dist/src/index.js`
CMD ["npm", "run", "start"]
