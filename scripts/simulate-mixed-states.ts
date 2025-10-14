import { Queue, Worker } from "bullmq";
import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379/0";
const connection = new Redis(REDIS_URL, {
  enableReadyCheck: false,
  maxRetriesPerRequest: null, // Required for BullMQ workers
});

const queue = new Queue("mixed-states-queue", { connection });

async function simulateMixedStates() {
  console.log("Creating jobs in various states...\n");

  // 1. Add delayed jobs (scheduled for future execution)
  console.log("1. Adding delayed jobs...");
  for (let i = 0; i < 10; i++) {
    await queue.add(
      "delayed-notification",
      {
        userId: 1000 + i,
        message: `Scheduled notification ${i}`,
      },
      {
        delay: (i + 1) * 60000, // Delay 1-10 minutes
      },
    );
  }
  console.log("   ✓ Added 10 delayed jobs (1-10 minutes delay)\n");

  // 2. Add jobs that will be in waiting state
  console.log("2. Adding waiting jobs...");
  for (let i = 0; i < 25; i++) {
    await queue.add("pending-task", {
      taskId: `task-${i}`,
      type: "processing",
      priority: Math.floor(Math.random() * 10),
    });
  }
  console.log("   ✓ Added 25 waiting jobs\n");

  // 3. Add and complete some jobs
  console.log("3. Adding and completing jobs...");
  const completedWorker = new Worker(
    "mixed-states-queue",
    async job => {
      if (job.name === "quick-task") {
        return { success: true, completedAt: new Date().toISOString() };
      }
      throw new Error("Job should not be processed");
    },
    { connection: connection.duplicate(), concurrency: 5 },
  );

  for (let i = 0; i < 15; i++) {
    await queue.add("quick-task", {
      taskId: `completed-${i}`,
      data: `Quick task ${i}`,
    });
  }

  // Wait for jobs to complete
  await new Promise(resolve => setTimeout(resolve, 2000));
  await completedWorker.close();
  console.log("   ✓ Added and completed 15 jobs\n");

  // 4. Add jobs that will fail
  console.log("4. Creating failed jobs...");
  const failWorker = new Worker(
    "mixed-states-queue",
    async job => {
      if (job.name === "failing-task") {
        throw new Error(`Simulated failure: ${job.data.reason}`);
      }
    },
    {
      connection: connection.duplicate(),
      concurrency: 3,
    },
  );

  const failReasons = [
    "Database connection timeout",
    "Invalid API key",
    "Rate limit exceeded",
    "Resource not found",
    "Permission denied",
    "Network error",
    "Invalid input data",
    "Service unavailable",
  ];

  for (let i = 0; i < failReasons.length; i++) {
    await queue.add(
      "failing-task",
      {
        taskId: `fail-${i}`,
        reason: failReasons[i],
      },
      {
        attempts: 1, // Fail immediately
      },
    );
  }

  // Wait for jobs to fail
  await new Promise(resolve => setTimeout(resolve, 2000));
  await failWorker.close();
  console.log(`   ✓ Created ${failReasons.length} failed jobs\n`);

  // 5. Add jobs with different priorities
  console.log("5. Adding prioritized jobs...");
  for (let i = 0; i < 10; i++) {
    await queue.add(
      "priority-task",
      {
        taskId: `priority-${i}`,
        importance: i,
      },
      {
        priority: i, // Lower number = higher priority
      },
    );
  }
  console.log("   ✓ Added 10 priority jobs\n");

  // Print final statistics
  const stats = {
    waiting: await queue.getWaitingCount(),
    active: await queue.getActiveCount(),
    completed: await queue.getCompletedCount(),
    failed: await queue.getFailedCount(),
    delayed: await queue.getDelayedCount(),
  };

  console.log("Final queue statistics:");
  console.log(`  Waiting: ${stats.waiting}`);
  console.log(`  Active: ${stats.active}`);
  console.log(`  Completed: ${stats.completed}`);
  console.log(`  Failed: ${stats.failed}`);
  console.log(`  Delayed: ${stats.delayed}`);

  await queue.close();
  await connection.quit();
}

simulateMixedStates().catch(console.error);
