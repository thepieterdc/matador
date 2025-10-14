import { Queue } from "bullmq";
import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379/0";
const connection = new Redis(REDIS_URL, {
  enableReadyCheck: false,
  maxRetriesPerRequest: 3,
});

const queue = new Queue("scheduled-jobs", { connection });

async function addCronJobs() {
  console.log("Adding cron/repeatable jobs to queue...");

  const cronJobs = [
    {
      name: "daily-backup",
      data: {
        type: "database-backup",
        destination: "s3://backups/daily",
      },
      repeat: {
        pattern: "0 2 * * *", // Every day at 2 AM
      },
    },
    {
      name: "hourly-analytics",
      data: {
        type: "analytics-aggregation",
        metrics: ["pageviews", "conversions", "revenue"],
      },
      repeat: {
        pattern: "0 * * * *", // Every hour
      },
    },
    {
      name: "weekly-report",
      data: {
        type: "weekly-summary",
        recipients: ["admin@example.com"],
      },
      repeat: {
        pattern: "0 9 * * 1", // Every Monday at 9 AM
      },
    },
    {
      name: "cleanup-old-data",
      data: {
        type: "data-retention",
        tables: ["logs", "temp_files", "cache"],
        olderThan: "30 days",
      },
      repeat: {
        pattern: "0 3 1 * *", // First day of month at 3 AM
      },
    },
    {
      name: "send-reminders",
      data: {
        type: "email-reminders",
        template: "upcoming-events",
      },
      repeat: {
        pattern: "0 10,14,18 * * *", // 10 AM, 2 PM, 6 PM daily
      },
    },
    {
      name: "health-check",
      data: {
        type: "system-health",
        services: ["api", "database", "cache", "storage"],
      },
      repeat: {
        pattern: "*/5 * * * *", // Every 5 minutes
      },
    },
    {
      name: "generate-invoices",
      data: {
        type: "billing",
        invoiceType: "monthly",
      },
      repeat: {
        pattern: "0 0 1 * *", // First day of month at midnight
      },
    },
    {
      name: "sync-inventory",
      data: {
        type: "inventory-sync",
        source: "warehouse-system",
      },
      repeat: {
        pattern: "*/15 * * * *", // Every 15 minutes
      },
    },
  ];

  for (const job of cronJobs) {
    await queue.add(job.name, job.data, {
      repeat: job.repeat,
    });
    console.log(`✓ Added repeatable job: ${job.name} (${job.repeat.pattern})`);
  }

  // Get repeatable jobs info
  const repeatableJobs = await queue.getRepeatableJobs();

  console.log(`\n✓ Successfully added ${cronJobs.length} repeatable jobs`);
  console.log(`  Total repeatable jobs in queue: ${repeatableJobs.length}`);
  console.log("\nScheduled jobs:");
  repeatableJobs.forEach(job => {
    const nextRun = new Date(job.next);
    console.log(`  - ${job.name}: ${job.pattern} (next: ${nextRun.toLocaleString()})`);
  });

  await queue.close();
  await connection.quit();
}

addCronJobs().catch(console.error);
