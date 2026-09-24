FROM node:24-bookworm-slim AS web
WORKDIR /build
COPY apps/web/package*.json ./
RUN npm ci
COPY apps/web/ ./
RUN npm run build
FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-tha tesseract-ocr-eng && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY apps/api/package*.json ./apps/api/
RUN cd apps/api && npm ci --omit=dev
COPY apps/api/src ./apps/api/src
COPY migrations ./migrations
COPY packages ./packages
COPY --from=web /build/dist ./apps/web/dist
USER node
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/src/server.js"]

