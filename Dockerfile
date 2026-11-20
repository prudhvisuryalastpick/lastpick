# syntax=docker/dockerfile:1.7
# One image for all three LastPick containers. ECS runs it three times as separate services;
# SERVICE (customer | partner | admin) and WEB_DIR pick the routes and the web app each one serves.
# Built for ARM (Graviton) Fargate: docker buildx build --platform linux/arm64 .

# ---- web apps (built once on the build machine's own CPU, no emulation needed)
FROM --platform=$BUILDPLATFORM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY web/ ./
ARG VITE_CUSTOMER_URL VITE_PARTNER_URL VITE_LEGAL_NAME VITE_LEGAL_ADDRESS VITE_GRIEVANCE_OFFICER VITE_GRIEVANCE_EMAIL VITE_GRIEVANCE_PHONE
RUN npm run build:all && mv dist-partner dist-owner

# ---- server dependencies (pure JavaScript, so they can be installed on the build machine too)
FROM --platform=$BUILDPLATFORM node:22-alpine AS deps
WORKDIR /server
COPY server/package.json server/package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

# ---- runtime
FROM node:22-alpine
# latest Alpine security fixes on every build (the weekly rebuild picks them up even without code changes)
RUN apk upgrade --no-cache
ENV NODE_ENV=production PORT=8080 DB_SSL=verify DB_CA_FILE=/app/rds-ca.pem
# certificate bundle used to verify the database's TLS certificate
# create the folders first: ADD --chmod would otherwise create /app with mode 644 (not enterable by the node user)
RUN mkdir -p /app/server && chmod 755 /app /app/server
ADD --chmod=644 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /app/rds-ca.pem
WORKDIR /app/server
COPY --from=deps /server/node_modules ./node_modules
COPY server/package.json ./
COPY server/src ./src
COPY server/migrations ./migrations
COPY server/scripts ./scripts
COPY --from=web /web/dist-customer /app/web/dist-customer
COPY --from=web /web/dist-owner /app/web/dist-owner
COPY --from=web /web/dist-admin /app/web/dist-admin
# never run as root inside the container
USER node
EXPOSE 8080
CMD ["node", "src/index.js"]
