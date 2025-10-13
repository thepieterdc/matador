FROM node:22-alpine AS development-dependencies-env
COPY . /app
WORKDIR /app
RUN pnpm ci

FROM node:22-alpine AS production-dependencies-env
COPY ./package.json pnpm-lock.yaml /app/
WORKDIR /app
RUN pnpm ci --omit=dev

FROM node:22-alpine AS build-env
COPY . /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app
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