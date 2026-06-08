FROM node:20-bookworm-slim

WORKDIR /app

# Install Playwright + Chromium system dependencies
COPY export-server.js package.json package-lock.json ./
RUN npm ci && npx playwright install --with-deps chromium

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "export-server.js"]
