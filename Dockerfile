FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine

RUN addgroup -g 1001 hub && adduser -u 1001 -G hub -s /bin/sh -D hub

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/static ./static
COPY --from=builder /app/config ./config
COPY --from=builder /app/package.json ./

RUN mkdir -p /home/hub/.claude-api-hub && chown -R hub:hub /home/hub /app

USER hub

ENV NODE_ENV=production
ENV API_HUB_HOST=0.0.0.0
ENV API_HUB_PORT=9800

EXPOSE 9800

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:9800/health',r=>{process.exit(r.statusCode===200?0:1)})"

CMD ["node", "dist/index.js"]
