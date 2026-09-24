# syntax=docker/dockerfile:1
# PhoneMail web: build the SPA with Node, serve it with nginx (non-root).
# Build context is the repo root (npm workspaces).

FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
# Only the web and shared workspaces; --ignore-scripts skips the server's prisma postinstall.
RUN npm ci --workspace packages/shared --workspace apps/web --include-workspace-root --ignore-scripts
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w packages/shared && npm run build -w apps/web

FROM nginxinc/nginx-unprivileged:stable-alpine AS runtime
COPY apps/web/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY apps/web/nginx/snippets/ /etc/nginx/snippets/
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
