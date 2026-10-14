FROM node:24-alpine AS builder

WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate

# Copy workspace configs and package.jsons
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/cli/package.json apps/cli/
COPY apps/worker/package.json apps/worker/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/gitlab/package.json packages/gitlab/
COPY packages/jira/package.json packages/jira/
COPY packages/planner/package.json packages/planner/
COPY packages/shared/package.json packages/shared/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY . .

# Build all packages
RUN pnpm build

FROM node:24-alpine AS runner

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.25.0 --activate

COPY --from=builder /app /app

# Expose API port
EXPOSE 3000

CMD ["node", "apps/api/dist/index.js"]

