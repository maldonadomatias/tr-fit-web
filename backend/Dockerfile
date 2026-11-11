FROM node:24.22.3-alpine@sha256:98e4e60b35fd50143e1838da2957488c25aa3a3efbd48bb679923f77d6d3d873 AS build
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24.22.3-alpine@sha256:98e4e60b35fd50143e1838da2957488c25aa3a3efbd48bb679923f77d6d3d873
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
