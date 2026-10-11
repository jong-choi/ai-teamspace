FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install --global npm@11.19.0
COPY package.json package-lock.json ./
COPY demo/package.json ./demo/package.json
COPY server/package.json ./server/package.json
COPY packages/agent-runtime/package.json ./packages/agent-runtime/package.json
COPY packages/knowledge-graph/package.json ./packages/knowledge-graph/package.json
COPY client/packages/api-client/package.json ./client/packages/api-client/package.json
COPY client/packages/rnr/package.json ./client/packages/rnr/package.json
COPY client/packages/expensify-common/package.json ./client/packages/expensify-common/package.json
COPY client/packages/isomorphic-webcrypto/package.json ./client/packages/isomorphic-webcrypto/package.json
COPY client/projects/dashboard/apps/expo/package.json ./client/projects/dashboard/apps/expo/package.json
RUN npm ci --no-audit --no-fund

FROM dependencies AS server-build
COPY . .
RUN npm run build --workspace @repo/agent-runtime && npm run build --workspace @repo/knowledge-graph && npm run build --workspace @repo/server

FROM server-build AS server
USER node
WORKDIR /app/server
CMD ["node", "dist/main.js"]

FROM server-build AS web-build
ARG EXPO_PUBLIC_API_URL
ARG EXPO_PUBLIC_DEMO_EMAIL
ARG EXPO_PUBLIC_DEMO_PASSWORD
ARG EXPO_PUBLIC_DEMO_ORGANIZATION_SLUG
ENV EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL \
    EXPO_PUBLIC_DEMO_MODE=true \
    EXPO_PUBLIC_DEMO_EMAIL=$EXPO_PUBLIC_DEMO_EMAIL \
    EXPO_PUBLIC_DEMO_PASSWORD=$EXPO_PUBLIC_DEMO_PASSWORD \
    EXPO_PUBLIC_DEMO_ORGANIZATION_SLUG=$EXPO_PUBLIC_DEMO_ORGANIZATION_SLUG
RUN npm run build --workspace @repo/dashboard

FROM nginx:1.28-alpine AS gateway
COPY infra/demo/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/client/projects/dashboard/apps/expo/dist /usr/share/nginx/html
EXPOSE 80
