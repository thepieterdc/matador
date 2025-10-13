import Redis from "ioredis";

let redis: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379/0";
    redis = new Redis(redisUrl, {
      enableReadyCheck: false,
      maxRetriesPerRequest: 3,
    });
  }
  return redis;
}

export function closeRedisConnection(): void {
  if (redis) {
    redis.disconnect();
    redis = null;
  }
}
