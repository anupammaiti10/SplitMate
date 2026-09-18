FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat tini
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY prisma ./prisma/
COPY prisma.config.ts ./
RUN npm ci && npm rebuild

ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN npx prisma generate

COPY apps/api ./apps/api
RUN npm run build --workspace=apps/api

COPY docker/api-entrypoint.sh ./api-entrypoint.sh
RUN chmod +x ./api-entrypoint.sh && chown -R nestjs:nodejs /app

USER nestjs

EXPOSE 3001

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["./api-entrypoint.sh"]
