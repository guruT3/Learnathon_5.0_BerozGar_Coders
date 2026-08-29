# Multi-stage production Dockerfile for HostelGrievance Portal
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production runtime stage
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV REQUIRE_HTTPS=true
ENV TRUST_PROXY=true
ENV HOSTEL_API_PORT=3001
ENV HOSTEL_DB_PATH=/app/data/hostel.db
ENV HOSTEL_UPLOADS_DIR=/app/uploads

# Create non-root system user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/build ./build
COPY --from=builder /app/src/server ./src/server
COPY --from=builder /app/tsconfig.server.json ./

# Ensure data and upload directories exist with secure permissions
RUN mkdir -p /app/data /app/uploads && \
    chown -R appuser:appgroup /app/data /app/uploads

USER appuser

EXPOSE 3001 5173

CMD ["node", "--import", "tsx", "src/server/index.ts"]
