import { Queue } from "bullmq";
import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379/0";
const connection = new Redis(REDIS_URL, {
  enableReadyCheck: false,
  maxRetriesPerRequest: 3,
});

const queue = new Queue("high-volume-queue", { connection });

// Job templates to generate realistic data
const jobTemplates = [
  {
    name: "send-email",
    dataGenerator: (i: number) => ({
      to: `user${i}@example.com`,
      subject: `Notification ${i}`,
      template: "welcome-email",
      userId: 1000 + i,
    }),
  },
  {
    name: "process-order",
    dataGenerator: (i: number) => ({
      orderId: `ORD-${String(i).padStart(6, "0")}`,
      customerId: Math.floor(Math.random() * 1000),
      amount: Math.floor(Math.random() * 50000) / 100,
      items: Math.floor(Math.random() * 10) + 1,
    }),
  },
  {
    name: "generate-thumbnail",
    dataGenerator: (i: number) => ({
      imageId: `IMG-${i}`,
      url: `https://cdn.example.com/images/${i}.jpg`,
      sizes: ["small", "medium", "large"],
    }),
  },
  {
    name: "analyze-metrics",
    dataGenerator: (i: number) => ({
      metricId: `metric-${i}`,
      source: ["google-analytics", "mixpanel", "amplitude"][i % 3],
      dateRange: "last-24h",
    }),
  },
  {
    name: "update-search-index",
    dataGenerator: (i: number) => ({
      documentId: `doc-${i}`,
      type: ["product", "article", "user"][i % 3],
      action: "index",
    }),
  },
];

async function addManyJobs() {
  const count = parseInt(process.argv[2] || "500", 10);
  console.log(`Adding ${count} jobs to high-volume-queue...`);

  const jobs = [];
  for (let i = 0; i < count; i++) {
    const template = jobTemplates[i % jobTemplates.length];
    jobs.push({
      name: template.name,
      data: template.dataGenerator(i),
    });
  }

  // Add jobs in batches for better performance
  const batchSize = 100;
  for (let i = 0; i < jobs.length; i += batchSize) {
    const batch = jobs.slice(i, i + batchSize);
    await queue.addBulk(batch);
    console.log(`✓ Added jobs ${i + 1}-${Math.min(i + batchSize, jobs.length)}`);
  }

  const stats = {
    waiting: await queue.getWaitingCount(),
    active: await queue.getActiveCount(),
  };

  console.log(`\n✓ Successfully added ${count} jobs`);
  console.log(`  Waiting: ${stats.waiting}`);
  console.log(`  Active: ${stats.active}`);

  await queue.close();
  await connection.quit();
}

addManyJobs().catch(console.error);
