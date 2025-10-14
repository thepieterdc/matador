import { Queue, Worker } from "bullmq";
import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379/0";
const connection = new Redis(REDIS_URL, {
  enableReadyCheck: false,
  maxRetriesPerRequest: null, // Required for BullMQ workers
});

const queue = new Queue("retry-test-queue", { connection });

async function simulateRetryJobs() {
  console.log("Creating jobs with retry scenarios...\n");

  // Clean up any existing jobs first
  await queue.drain();
  await queue.clean(0, 1000, "completed");
  await queue.clean(0, 1000, "failed");

  // Job types with different retry configurations
  const retryJobs = [
    {
      name: "flaky-api-call",
      data: {
        endpoint: "https://api.example.com/users",
        method: "GET",
        description: "Fails 2 times, succeeds on 3rd attempt",
      },
      opts: {
        attempts: 5,
        backoff: {
          type: "exponential" as const,
          delay: 2000, // 2 seconds base delay
        },
      },
      failUntilAttempt: 3,
    },
    {
      name: "database-query",
      data: {
        query: "SELECT * FROM users WHERE id = ?",
        params: [12345],
        description: "Fails on first attempt, succeeds on retry",
      },
      opts: {
        attempts: 3,
        backoff: {
          type: "fixed" as const,
          delay: 1000, // 1 second delay
        },
      },
      failUntilAttempt: 2,
    },
    {
      name: "file-processing",
      data: {
        filePath: "/data/large-file.csv",
        operation: "parse",
        description: "Always fails (exceeds max retries)",
      },
      opts: {
        attempts: 3,
        backoff: {
          type: "exponential" as const,
          delay: 1000,
        },
      },
      failUntilAttempt: 999, // Never succeeds
    },
    {
      name: "email-send",
      data: {
        to: "user@example.com",
        subject: "Important notification",
        description: "Succeeds immediately (no retries needed)",
      },
      opts: {
        attempts: 3,
        backoff: {
          type: "fixed" as const,
          delay: 5000,
        },
      },
      failUntilAttempt: 1, // Succeeds on first try
    },
    {
      name: "payment-processing",
      data: {
        amount: 99.99,
        currency: "USD",
        description: "Fails 4 times before succeeding",
      },
      opts: {
        attempts: 6,
        backoff: {
          type: "exponential" as const,
          delay: 3000,
        },
      },
      failUntilAttempt: 5,
    },
  ];

  // Add jobs to queue
  for (const jobConfig of retryJobs) {
    await queue.add(jobConfig.name, jobConfig.data, jobConfig.opts);
    console.log(`✓ Added job: ${jobConfig.name}`);
    console.log(`  Max attempts: ${jobConfig.opts.attempts}`);
    console.log(
      `  Backoff: ${jobConfig.opts.backoff.type} (${jobConfig.opts.backoff.delay}ms)`,
    );
    console.log(`  Description: ${jobConfig.data.description}\n`);
  }

  console.log(`\n✓ Added ${retryJobs.length} jobs with retry configurations`);

  // Start a worker to process these jobs
  console.log("\nStarting worker to process jobs...\n");

  const worker = new Worker(
    "retry-test-queue",
    async job => {
      const jobConfig = retryJobs.find(j => j.name === job.name);
      const shouldFail = jobConfig
        ? job.attemptsMade < jobConfig.failUntilAttempt
        : false;

      console.log(
        `[${new Date().toISOString()}] Processing: ${job.name} (attempt ${job.attemptsMade}/${job.opts.attempts})`,
      );

      if (shouldFail) {
        const errorMessages = [
          "Connection timeout",
          "Service unavailable",
          "Rate limit exceeded",
          "Network error",
          "Database connection lost",
        ];
        const randomError =
          errorMessages[Math.floor(Math.random() * errorMessages.length)];
        console.log(`  ✗ Failed: ${randomError}\n`);
        throw new Error(randomError);
      }

      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 500));

      console.log("  ✓ Succeeded!\n");
      return {
        status: "success",
        attempt: job.attemptsMade,
        completedAt: new Date().toISOString(),
      };
    },
    {
      connection: connection.duplicate(),
      concurrency: 1, // Process one at a time to see retries clearly
    },
  );

  worker.on("completed", job => {
    console.log(
      `✓ Job completed: ${job.name} (took ${job.attemptsMade} attempt(s))`,
    );
  });

  worker.on("failed", job => {
    if (job) {
      const isLastAttempt = job.attemptsMade >= (job.opts.attempts || 1);
      if (isLastAttempt) {
        console.log(
          `✗ Job permanently failed: ${job.name} after ${job.attemptsMade} attempts`,
        );
      } else {
        console.log(
          `⚠ Job will retry: ${job.name} (attempt ${job.attemptsMade}/${job.opts.attempts})`,
        );
      }
    }
  });

  worker.on("error", err => {
    console.error("Worker error:", err);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\n\nShutting down worker...");
    await worker.close();
    await queue.close();
    await connection.quit();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  console.log("Worker is running. Jobs will retry according to configuration.");
  console.log("Press Ctrl+C to stop.\n");
}

simulateRetryJobs().catch(console.error);
