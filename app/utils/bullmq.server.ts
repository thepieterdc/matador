import { Queue } from "bullmq";
import { getRedisConnection } from "./redis.server";

const queueCache = new Map<string, Queue>();

export function getQueue(queueName: string): Queue {
  if (!queueCache.has(queueName)) {
    const connection = getRedisConnection();
    const queue = new Queue(queueName, { connection });
    queueCache.set(queueName, queue);
  }
  return queueCache.get(queueName)!;
}

export async function getAllQueueNames(): Promise<string[]> {
  const connection = getRedisConnection();
  const keys = await connection.keys("bull:*:meta");
  const queueNames = keys.map(key => {
    const parts = key.split(":");
    return parts[1];
  });
  return Array.from(new Set(queueNames));
}

export interface QueueStats {
  name: string;
  waiting: number;
  running: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

export async function getQueueStats(queueName: string): Promise<QueueStats> {
  const queue = getQueue(queueName);
  const [waiting, running, completed, failed, delayed, paused] =
    await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
      queue.isPaused(),
    ]);

  return {
    name: queueName,
    waiting,
    running,
    completed,
    failed,
    delayed,
    paused,
  };
}

export interface JobInfo {
  id: string;
  name: string;
  data: unknown;
  progress: number;
  returnvalue: unknown;
  stacktrace: string[];
  timestamp: number;
  attemptsMade: number;
  failedReason: string;
  processedOn?: number;
  finishedOn?: number;
  repeatJobKey?: string;
  repeatPattern?: string;
  repeatNextTime?: number;
}

export async function getQueueJobs(
  queueName: string,
  status:
    | "waiting"
    | "running"
    | "completed"
    | "failed"
    | "delayed" = "waiting",
  start = 0,
  end = 99,
): Promise<JobInfo[]> {
  const queue = getQueue(queueName);

  let jobs;
  switch (status) {
    case "waiting":
      jobs = await queue.getWaiting(start, end);
      break;
    case "running":
      jobs = await queue.getActive(start, end);
      break;
    case "completed":
      jobs = await queue.getCompleted(start, end);
      break;
    case "failed":
      jobs = await queue.getFailed(start, end);
      break;
    case "delayed":
      jobs = await queue.getDelayed(start, end);
      break;
    default:
      jobs = await queue.getWaiting(start, end);
  }

  // Get repeatable jobs info for matching with cron patterns
  const repeatableJobs = await queue.getRepeatableJobs();
  const repeatableMap = new Map(repeatableJobs.map(r => [r.key, r]));

  return jobs.map(job => {
    const repeatKey = job.opts?.repeat?.key || job.repeatJobKey;
    const repeatableInfo = repeatKey ? repeatableMap.get(repeatKey) : null;

    return {
      id: job.id || "",
      name: job.name,
      data: job.data,
      progress: job.progress as number,
      returnvalue: job.returnvalue,
      stacktrace: job.stacktrace || [],
      timestamp: job.timestamp,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason || "",
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      repeatJobKey: repeatKey,
      repeatPattern: repeatableInfo?.pattern || undefined,
      repeatNextTime: repeatableInfo?.next,
    };
  });
}

export async function removeJob(
  queueName: string,
  jobId: string,
): Promise<void> {
  const queue = getQueue(queueName);

  // Check if this is a repeatable job (format: repeat:{key}:{timestamp})
  if (jobId.startsWith("repeat:")) {
    // Extract the repeat key from the job ID
    const parts = jobId.split(":");
    const repeatKey = parts[1];
    await queue.removeRepeatableByKey(repeatKey);
  } else {
    // Regular job removal
    const job = await queue.getJob(jobId);
    if (job) {
      // Check if the job is currently active/running
      const state = await job.getState();
      if (state === "active") {
        // For active jobs, move to failed state (cancellation)
        await job.moveToFailed(
          new Error("Job cancelled by user"),
          "0", // token (not used in this context)
          true, // fetchNext
        );
      } else {
        // For non-active jobs, regular removal works
        await job.remove();
      }
    }
  }
}

export async function retryJob(
  queueName: string,
  jobId: string,
): Promise<void> {
  const queue = getQueue(queueName);
  const job = await queue.getJob(jobId);
  if (job) {
    await job.retry();
  }
}

export async function cleanQueue(
  queueName: string,
  status: "completed" | "failed",
  grace = 0,
): Promise<string[]> {
  const queue = getQueue(queueName);
  return await queue.clean(grace, 1000, status);
}
