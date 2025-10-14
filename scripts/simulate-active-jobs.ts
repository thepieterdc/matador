import { Queue, Worker } from "bullmq";
import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379/0";
const connection = new Redis(REDIS_URL, {
  enableReadyCheck: false,
  maxRetriesPerRequest: null, // Required for BullMQ workers
});

const queue = new Queue("active-jobs-queue", { connection });

async function simulateActiveJobs() {
  console.log("Starting simulation of active/running jobs...\n");

  // Create a worker that processes jobs slowly
  const worker = new Worker(
    "active-jobs-queue",
    async job => {
      console.log(`[Worker] Processing job: ${job.name} (ID: ${job.id})`);

      // Simulate long processing with progress updates
      const duration = job.data.duration || 60000; // Default 60 seconds
      const steps = 20;

      for (let i = 1; i <= steps; i++) {
        await new Promise(resolve => setTimeout(resolve, duration / steps));
        const progress = (i / steps) * 100;
        await job.updateProgress(progress);

        if (i % 4 === 0) {
          console.log(`  [${job.name}] Progress: ${progress.toFixed(0)}%`);
        }
      }

      return {
        status: "completed",
        processedAt: new Date().toISOString(),
      };
    },
    {
      connection: connection.duplicate(),
      concurrency: 10, // Process up to 10 jobs simultaneously
    },
  );

  worker.on("completed", job => {
    console.log(`✓ [Worker] Completed job: ${job.id}`);
  });

  worker.on("failed", (job, err) => {
    console.error(`✗ [Worker] Job ${job?.id} failed:`, err.message);
  });

  // Add jobs that will be processed slowly
  console.log("Adding jobs that will run for extended periods...\n");

  const jobTypes = [
    { name: "video-transcoding", duration: 180000 }, // 3 minutes
    { name: "image-processing", duration: 120000 }, // 2 minutes
    { name: "data-analysis", duration: 240000 }, // 4 minutes
    { name: "report-generation", duration: 150000 }, // 2.5 minutes
    { name: "file-conversion", duration: 100000 }, // 1.7 minutes
  ];

  // Add multiple jobs of each type
  for (let i = 0; i < 15; i++) {
    const jobType = jobTypes[i % jobTypes.length];
    await queue.add(jobType.name, {
      taskId: `active-${i}`,
      duration: jobType.duration,
      startedAt: new Date().toISOString(),
    });
    console.log(
      `✓ Added job: ${jobType.name} (${jobType.duration / 1000}s) - ID: active-${i}`,
    );
  }

  console.log("\n✓ Added 15 jobs that will be actively processing");
  console.log("  Worker concurrency: 10");
  console.log("  Jobs will complete over the next 2-4 minutes");

  const stats = {
    waiting: await queue.getWaitingCount(),
    active: await queue.getActiveCount(),
  };

  console.log("\nCurrent queue state:");
  console.log(`  Waiting: ${stats.waiting}`);
  console.log(`  Active: ${stats.active}`);

  console.log("\nWorker is running. Jobs will continue processing...");
  console.log("The worker will keep running. Press Ctrl+C to stop.\n");

  // Keep the process running
  process.on("SIGINT", async () => {
    console.log("\n\nShutting down worker...");
    await worker.close();
    await queue.close();
    await connection.quit();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("\n\nShutting down worker...");
    await worker.close();
    await queue.close();
    await connection.quit();
    process.exit(0);
  });
}

simulateActiveJobs().catch(console.error);
