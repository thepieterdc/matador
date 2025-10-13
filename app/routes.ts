import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/queues.tsx"),
  route("health", "routes/health.tsx"),
  route("queues/:queueName", "routes/queue-detail.tsx"),
] satisfies RouteConfig;
