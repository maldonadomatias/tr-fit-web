FROM node:26.13.0-slim@sha256:5adad64f9a1fca2d51972caa65983634c8a774eb300d72b20f7f2a0f60368072 AS build
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:26.13.0-slim@sha256:5adad64f9a1fca2d51972caa65983634c8a774eb300d72b20f7f2a0f60368072
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
RUN mkdir -p uploads && chown node:node uploads

USER node
EXPOSE 5001
# Pending migrations run on every boot, as the owner role from
# MIGRATION_DATABASE_URL. If one fails the API does not start.
CMD ["sh", "-c", "node dist/db/migrate.js && exec node dist/index.js"]
