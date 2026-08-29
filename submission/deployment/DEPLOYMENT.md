# Deployment Guide

This guide explains how to deploy the hardened **HostelGrievance** portal in staging or production.

---

## 1. Prerequisites
* Node.js v20+ LTS and npm v10+
* Docker & Docker Compose (for containerized deployments)
* SSL/TLS certificate (e.g. Let's Encrypt / Certbot)

---

## 2. Option A: Containerized Deployment (Recommended)

1. Clone or extract the submission package:
   ```sh
   cd submission
   ```
2. Copy the environment configuration:
   ```sh
   cp deployment/.env.production.example deployment/.env
   ```
3. Place TLS certificates in `deployment/certs/`:
   * `deployment/certs/fullchain.pem`
   * `deployment/certs/privkey.pem`
4. Build and start the containers:
   ```sh
   docker-compose -f deployment/docker-compose.yml up -d --build
   ```
5. Verify container health:
   ```sh
   docker ps
   curl -k https://localhost/api/health
   ```

---

## 3. Option B: Bare-Metal / Virtual Machine Deployment

1. Navigate to source directory:
   ```sh
   cd submission/source
   ```
2. Install dependencies with lockfile:
   ```sh
   npm ci
   ```
3. Initialize / seed the database:
   ```sh
   npm run db:reset
   ```
4. Build frontend production assets:
   ```sh
   npm run build
   ```
5. Start the backend API service:
   ```sh
   NODE_ENV=production REQUIRE_HTTPS=true npm run dev:api
   ```
6. Set up reverse proxy (Nginx / Cloudflare) directing `/api` to `127.0.0.1:3001` with TLS termination.
