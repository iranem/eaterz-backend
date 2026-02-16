# EATERZ Backend Dockerfile
# Multi-stage build for optimized production image

# Stage 1: Build dependencies
FROM node:18-alpine AS deps
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Stage 2: Production image
FROM node:18-alpine AS runner
WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 eaterz

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application code
COPY --chown=eaterz:nodejs . .

# Create necessary directories
RUN mkdir -p logs uploads/avatars uploads/plats uploads/litiges uploads/thumbnails
RUN chown -R eaterz:nodejs logs uploads

# Switch to non-root user
USER eaterz

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health || exit 1

# Start the application
CMD ["node", "server.js"]
