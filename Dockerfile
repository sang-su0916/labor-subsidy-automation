FROM node:20-slim

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy all package files
COPY package*.json ./
COPY packages/backend/package*.json ./packages/backend/
COPY packages/shared/package*.json ./packages/shared/

# Install all dependencies (needed for workspace resolution)
RUN npm install --ignore-scripts

# Copy source code
COPY packages/backend ./packages/backend
COPY packages/shared ./packages/shared
COPY tsconfig.base.json ./

# Build backend only using direct tsc call
RUN cd packages/backend && npx tsc

# Expose port
EXPOSE 3010

# Set working directory for runtime
WORKDIR /app

# Start
CMD ["node", "packages/backend/dist/index.js"]
