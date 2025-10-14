# Queue Simulation Scripts

This directory contains scripts to simulate various BullMQ queue scenarios for testing the Matador dashboard.

## Prerequisites

Make sure Redis is running:
```bash
redis-server
```

Or use Docker:
```bash
docker run -d -p 6379:6379 redis:alpine
```

## Available Scripts

### 1. Long Running Jobs

Adds jobs that take extended time to complete (10-60 minutes each).

```bash
pnpm tsx scripts/simulate-long-running-jobs.ts
```

Creates jobs like:
- Video processing (10 min)
- Report generation (15 min)
- Batch email sending (20 min)
- Data migration (30 min)
- ML model training (60 min)

### 2. Many Waiting Jobs

Adds a large number of jobs to a queue to simulate high-volume scenarios.

```bash
# Add 500 jobs (default)
pnpm tsx scripts/simulate-many-waiting-jobs.ts

# Add custom number of jobs
pnpm tsx scripts/simulate-many-waiting-jobs.ts 1000
```

Creates realistic jobs:
- Email sending
- Order processing
- Thumbnail generation
- Metrics analysis
- Search indexing

### 3. Cron/Repeatable Jobs

Creates scheduled jobs that run on a recurring basis.

```bash
pnpm tsx scripts/simulate-cron-jobs.ts
```

Creates jobs like:
- Daily backups (2 AM daily)
- Hourly analytics (every hour)
- Weekly reports (Monday 9 AM)
- Data cleanup (monthly)
- Health checks (every 5 minutes)
- Inventory sync (every 15 minutes)

### 4. Worker Process

Simulates a worker that processes jobs from a queue.

```bash
# Process jobs from specific queue
pnpm tsx scripts/simulate-worker.ts <queue-name> [processing-time-ms]

# Examples:
pnpm tsx scripts/simulate-worker.ts long-running-tasks 15000
pnpm tsx scripts/simulate-worker.ts high-volume-queue 2000
pnpm tsx scripts/simulate-worker.ts scheduled-jobs 5000
```

Features:
- Configurable processing time per job
- Progress updates (0-100%)
- Concurrent processing (2 jobs at a time)
- Graceful shutdown on Ctrl+C

### 5. Mixed States Queue

Creates jobs in various states (waiting, delayed, completed, failed).

```bash
pnpm tsx scripts/simulate-mixed-states.ts
```

Creates:
- 10 delayed jobs (scheduled 1-10 minutes ahead)
- 25 waiting jobs
- 15 completed jobs
- 8 failed jobs (with different error reasons)
- 10 prioritized jobs

### 6. Active/Running Jobs

Simulates jobs that are actively being processed.

```bash
pnpm tsx scripts/simulate-active-jobs.ts
```

Features:
- Creates 15 jobs with varying durations (2-4 minutes)
- Worker processes up to 10 jobs simultaneously
- Progress updates every 25%
- Jobs continue running until completion or Ctrl+C

### 7. Clean All Queues

Removes all jobs from all queues (useful for cleanup).

```bash
pnpm tsx scripts/clean-all-queues.ts
```

Removes:
- All waiting jobs
- All active jobs
- All completed jobs
- All failed jobs
- All delayed jobs
- All repeatable/cron jobs

## Common Workflows

### Test Dashboard with Realistic Data

```bash
# 1. Clean existing queues
pnpm tsx scripts/clean-all-queues.ts

# 2. Add various job types
pnpm tsx scripts/simulate-long-running-jobs.ts
pnpm tsx scripts/simulate-many-waiting-jobs.ts 200
pnpm tsx scripts/simulate-cron-jobs.ts
pnpm tsx scripts/simulate-mixed-states.ts

# 3. Start workers to process some jobs
pnpm tsx scripts/simulate-worker.ts long-running-tasks 10000
```

### Simulate High Load

```bash
# Add lots of jobs
pnpm tsx scripts/simulate-many-waiting-jobs.ts 5000

# Start multiple workers
pnpm tsx scripts/simulate-worker.ts high-volume-queue 1000 &
pnpm tsx scripts/simulate-worker.ts high-volume-queue 1000 &
```

### Test Job States

```bash
# Create jobs in all states
pnpm tsx scripts/simulate-mixed-states.ts

# Keep some jobs actively running
pnpm tsx scripts/simulate-active-jobs.ts
```

### Test Cron Job Display

```bash
# Add repeatable jobs
pnpm tsx scripts/simulate-cron-jobs.ts

# View in dashboard to see cron patterns and next execution times
```

## Environment Variables

All scripts use the `REDIS_URL` environment variable:

```bash
# Default
REDIS_URL=redis://localhost:6379/0

# Custom Redis
REDIS_URL=redis://username:password@host:6379/0
```

## Notes

- Scripts automatically close connections when complete
- Workers can be stopped with Ctrl+C (SIGINT/SIGTERM)
- All scripts log their actions for easy debugging
- Job data is realistic and representative of production scenarios
- Progress updates simulate real-world job processing
