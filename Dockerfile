# Use the official Bun runtime as base image
FROM oven/bun:1.2.0-alpine AS base

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile --production

# Copy source code
COPY src/ ./src/
COPY tsconfig.json ./

# Build the application
RUN bun run build

# Production stage
FROM oven/bun:1.2.0-alpine AS production

WORKDIR /app

# Copy package files and install production dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Copy built application
COPY --from=base /app/dist ./dist

# Create directory for SQLite database and set permissions
RUN mkdir -p /app/data && chown -R bun:bun /app/data

# Expose port
EXPOSE 3000

# Set environment for production
ENV NODE_ENV=production
ENV DB_PATH=/app/data/chat_history.sqlite

# Start the application
CMD ["bun", "run", "start"]