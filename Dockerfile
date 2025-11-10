FROM node:20-alpine AS base

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
FROM base AS dependencies
RUN npm ci --only=production

# Build stage
FROM base AS build
RUN npm ci
COPY . .

# Build TypeScript
RUN npm run build || echo "No build script, using source files directly"

# Copy JavaScript source files that TypeScript doesn't compile
RUN mkdir -p dist/constants && cp -r constants/*.js dist/constants/ || true
RUN mkdir -p dist/routes && cp -r routes/*.js dist/routes/ || true
RUN mkdir -p dist/middleware && cp -r middleware/*.js dist/middleware/ || true
RUN mkdir -p dist/utils && cp -r utils/*.js dist/utils/ || true

# Production image
FROM node:20-alpine AS production

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache dumb-init curl

# Copy production node_modules
COPY --from=dependencies /app/node_modules ./node_modules

# Copy built backend or source files
COPY --from=build /app/dist ./dist/
COPY --from=build /app/*.js ./
COPY --from=build /app/config ./config/
COPY --from=build /app/constants ./constants/
COPY --from=build /app/database ./database/
COPY --from=build /app/middleware ./middleware/
COPY --from=build /app/providers ./providers/
COPY --from=build /app/routes ./routes/
COPY --from=build /app/services ./services/
COPY --from=build /app/types ./types/
COPY --from=build /app/utils ./utils/
COPY --from=build /app/package.json ./package.json

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Set environment
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Run as non-root user
USER node

# Start the backend server
CMD ["dumb-init", "node", "server.js"]
