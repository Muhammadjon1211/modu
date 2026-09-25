# modu-nest — one image, two apps (api + batch); the compose file picks the entry point
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY modu-nest/package.json modu-nest/package-lock.json ./
RUN npm ci
COPY modu-nest/ ./
RUN npx nest build modu-api && npx nest build modu-batch

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY modu-nest/package.json modu-nest/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
CMD ["node", "dist/apps/modu-api/main"]
