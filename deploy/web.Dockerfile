# modu-next — the public API origin is baked in at build time (next.config.js `env`)
FROM node:24-bookworm-slim AS build
WORKDIR /app
ARG PUBLIC_ORIGIN
ENV REACT_APP_API_URL=${PUBLIC_ORIGIN} \
    REACT_APP_API_GRAPHQL_URL=${PUBLIC_ORIGIN}/graphql \
    NEXT_TELEMETRY_DISABLED=1
RUN command -v yarn || npm i -g yarn@1
COPY modu-next/package.json modu-next/yarn.lock ./
RUN yarn install --frozen-lockfile --network-timeout 600000
COPY modu-next/ ./
# the websocket origin is the page origin with ws:// in front, proxied by nginx at /ws
RUN REACT_APP_API_WS="$(echo "$PUBLIC_ORIGIN" | sed 's#^http#ws#')/ws" yarn build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN command -v yarn || npm i -g yarn@1
COPY --from=build /app ./
CMD ["yarn", "start", "-p", "3000"]
