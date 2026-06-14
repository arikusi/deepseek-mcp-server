FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV TRANSPORT=http
ENV HTTP_PORT=3000
# A container must bind all interfaces for a published port to reach it.
# Control exposure at the publish layer (docker-compose binds 127.0.0.1) and
# set HTTP_AUTH_TOKEN when the port is reachable beyond the host's loopback.
ENV HTTP_HOST=0.0.0.0
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=builder /app/dist ./dist
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1
USER node
ENTRYPOINT ["node", "dist/index.js"]
