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
# A wildcard bind disables the SDK's automatic Host-header check, so name the
# hosts explicitly instead. These cover a port published on the host's loopback
# and the HEALTHCHECK below, which requests Host: localhost:3000. Override this
# when publishing under a real hostname, and set HTTP_AUTH_TOKEN as well.
ENV HTTP_ALLOWED_HOSTS=localhost,127.0.0.1,[::1]
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=builder /app/dist ./dist
EXPOSE 3000
# Address 127.0.0.1 literally, not "localhost": in this image localhost resolves
# to ::1 first, the server binds 0.0.0.0 (IPv4 only), and the probe was getting
# ECONNREFUSED on every run, so the container always reported unhealthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1
USER node
ENTRYPOINT ["node", "dist/index.js"]
