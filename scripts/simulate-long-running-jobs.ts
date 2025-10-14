import { Queue } from "bullmq";
import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379/0";
const connection = new Redis(REDIS_URL, {
  enableReadyCheck: false,
  maxRetriesPerRequest: 3,
});

const queue = new Queue("long-running-tasks", { connection });

async function addLongRunningJobs() {
  console.log("Adding long-running jobs to queue...");

  const jobs = [
    {
      name: "process-video",
      data: {
        videoId: "video-001",
        resolution: "4K",
        duration: 3600,
        processingType: "encoding",
      },
      duration: 600000, // 10 minutes
    },
    {
      name: "generate-report",
      data: {
        reportId: "report-2024-Q4",
        type: "annual-financial",
        pages: 250,
      },
      duration: 900000, // 15 minutes
    },
    {
      name: "batch-email-send",
      data: {
        campaignId: "campaign-123",
        recipients: 50000,
        template: "newsletter-october",
      },
      duration: 1200000, // 20 minutes
    },
    {
      name: "data-migration",
      data: {
        source: "mysql-prod",
        destination: "postgresql-prod",
        tables: ["users", "orders", "products"],
        records: 5000000,
      },
      duration: 1800000, // 30 minutes
    },
    {
      name: "machine-learning-training",
      data: {
        modelId: "ml-model-v2",
        dataset: "customer-behavior-2024",
        epochs: 100,
        samples: 1000000,
      },
      duration: 3600000, // 60 minutes
    },
  ];

  for (const job of jobs) {
    await queue.add(job.name, {
      ...job.data,
      estimatedDuration: job.duration,
      startedAt: new Date().toISOString(),
    });
    console.log(`✓ Added job: ${job.name} (estimated ${job.duration / 1000}s)`);
  }

  console.log(`\nAdded ${jobs.length} long-running jobs to queue`);
  console.log(
    "Run 'pnpm tsx scripts/simulate-worker.ts long-running-tasks' to process these jobs",
  );

  await queue.close();
  await connection.quit();
}

addLongRunningJobs().catch(console.error);
