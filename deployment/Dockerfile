# Build stage
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files first (better caching)
COPY admin/package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy application source
COPY admin/ ./
COPY shared/ ../shared/

# Build the application (client + server)
RUN npm run build

# Debug: Show what was built
RUN echo "=== Build output ===" && ls -la dist/ && echo "=== Client ===" && ls -la dist/client/

# Production stage
FROM node:20-alpine

# Install runtime dependencies only
RUN apk add --no-cache sqlite curl

WORKDIR /app

# Copy package files
COPY admin/package*.json ./

# Install ONLY production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Debug: Verify files are in place
RUN echo "=== Production dist ===" && ls -la dist/ && echo "=== Server ===" && ls -la dist/server/

# Create data directory for SQLite
RUN mkdir -p /data && chmod 777 /data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL=sqlite:/data/archtrack.db

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "dist/server/index.js"]
