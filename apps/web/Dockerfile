FROM node:20-alpine AS base
WORKDIR /app

# --- Install dependencies ---
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
RUN npm ci

# --- Build ---
FROM deps AS build
COPY apps/web ./apps/web
RUN npm run build --workspace=apps/web

# --- Production ---
FROM nginx:alpine AS runner
RUN rm /etc/nginx/conf.d/default.conf
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
