# syntax=docker/dockerfile:1.7

FROM node:22.23.1-alpine3.24 AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22.23.1-alpine3.24 AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=5173 \
    STATIC_DIR=/app/dist

WORKDIR /app
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server-dist ./server-dist

USER node
EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5173/api/health/live').then(r=>{if(!r.ok)throw Error(String(r.status))})"

CMD ["node", "server-dist/server/index.js", "--production"]
