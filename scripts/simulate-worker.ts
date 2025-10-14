import { Worker } from "bullmq";
import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379/0";
const queueName = process.argv[2] || "long-running-tasks";
const processingTime = parseInt(process.argv[3] || "10000", 10); // Default 10 seconds

const connection = new Redis(REDIS_URL, {
  enableReadyCheck: false,
  maxRetriesPerRequest: 3,
});

console.log(`Starting worker for queue: ${queueName}`);
console.log(`Processing time per job: ${processingTime}ms`);

const worker = new Worker(
  queueName,
  async job => {
    console.log(`\n[${new Date().toISOString()}] Processing job: ${job.name} (ID: ${job.id})`);
    console.log(`Data:`, JSON.stringify(job.data, null, 2));

    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      await new Promise(resolve => setTimeout(resolve, processingTime / steps));
      const progress = (i / steps) * 100;
      await job.updateProgress(progress);
      console.log(`  Progress: ${progress.toFixed(0)}%`);
    }

    console.log(`✓ Completed job: ${job.name}`);
    return {
      status: "success",
      processedAt: new Date().toISOString(),
      result: `Processed ${job.name} successfully`,
    };
  },
  {
    connection,
    concurrency: 2, // Process 2 jobs at a time
  },
);

worker.on("completed", job => {
  console.log(`✓ Job ${job.id} completed successfully`);
});

worker.on("failed", (job, err) => {
  console.error(`✗ Job ${job?.id} failed:`, err.message);
});

worker.on("error", err => {
  console.error("Worker error:", err);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("\nReceived SIGTERM, closing worker...");
  await worker.close();
  await connection.quit();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("\nReceived SIGINT, closing worker...");
  await worker.close();
  await connection.quit();
  process.exit(0);
});

console.log("\nWorker started. Press Ctrl+C to stop.\n");
