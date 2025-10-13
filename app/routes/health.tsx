import { getRedisConnection } from "~/utils/redis.server";

export async function loader() {
  const startTime = Date.now();

  try {
    const redis = getRedisConnection();

    // Test Redis connection with a ping
    const pingResult = await redis.ping();
    if (pingResult !== "PONG") {
      throw new Error("Redis ping failed");
    }

    return new Response(
      JSON.stringify({
        status: "OK",
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      },
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    return new Response(
      JSON.stringify({
        error: errorMessage,
        status: "ERR",
        timestamp: new Date().toISOString(),
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      },
    );
  }
}
