FROM node:22-slim AS development-dependencies-env

# Setup pnpm.
ENV CI=true
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

COPY . /app
WORKDIR /app
RUN pnpm install --frozen-lockfile

FROM node:22-slim AS production-dependencies-env

# Setup pnpm.
ENV CI=true
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

COPY ./package.json pnpm-lock.yaml /app/
WORKDIR /app
RUN pnpm install --frozen-lockfile --prod

FROM node:22-slim AS build-env

# Setup pnpm.
ENV CI=true
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

COPY . /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app
RUN pnpm fetch
RUN pnpm run build

FROM node:22-alpine

# Create a non-root user (Alpine uses addgroup and adduser)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY ./package.json pnpm-lock.yaml /app/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
WORKDIR /app
RUN chown -R appuser:appgroup /app
EXPOSE 5173
USER appuser
CMD ["pnpm", "run", "start"]