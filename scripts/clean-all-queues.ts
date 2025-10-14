import Redis from "ioredis";
import { Queue } from "bullmq";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379/0";
const connection = new Redis(REDIS_URL, {
  enableReadyCheck: false,
  maxRetriesPerRequest: 3,
});

async function cleanAllQueues() {
  console.log("Finding all queues...\n");

  // Get all queue names
  const keys = await connection.keys("bull:*:meta");
  const queueNames = Array.from(
    new Set(
      keys.map(key => {
        const parts = key.split(":");
        return parts[1];
      }),
    ),
  );

  if (queueNames.length === 0) {
    console.log("No queues found.");
    await connection.quit();
    return;
  }

  console.log(`Found ${queueNames.length} queues:\n`);
  queueNames.forEach(name => console.log(`  - ${name}`));

  console.log("\nCleaning queues...\n");

  for (const queueName of queueNames) {
    const queue = new Queue(queueName, { connection: connection.duplicate() });

    try {
      // Get stats before cleaning
      const stats = {
        waiting: await queue.getWaitingCount(),
        active: await queue.getActiveCount(),
        completed: await queue.getCompletedCount(),
        failed: await queue.getFailedCount(),
        delayed: await queue.getDelayedCount(),
      };

      // Clean all job states
      await queue.drain(); // Remove all waiting jobs
      await queue.clean(0, 10000, "completed");
      await queue.clean(0, 10000, "failed");

      // Remove all repeatable jobs
      const repeatableJobs = await queue.getRepeatableJobs();
      for (const job of repeatableJobs) {
        await queue.removeRepeatableByKey(job.key);
      }

      console.log(`✓ Cleaned queue: ${queueName}`);
      console.log(`    Removed: ${stats.waiting} waiting, ${stats.active} active, ` +
        `${stats.completed} completed, ${stats.failed} failed, ${stats.delayed} delayed`);
      if (repeatableJobs.length > 0) {
        console.log(`    Removed ${repeatableJobs.length} repeatable jobs`);
      }
      console.log();

      await queue.close();
    } catch (error) {
      console.error(`✗ Error cleaning queue ${queueName}:`, error);
    }
  }

  console.log("✓ All queues cleaned!");
  await connection.quit();
}

cleanAllQueues().catch(console.error);
