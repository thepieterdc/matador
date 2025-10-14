# Matador

A modern BullMQ dashboard for monitoring and managing job queues. Built with React Router 7, TypeScript, and Tailwind CSS.

## Features

- 📊 Real-time queue monitoring
- 🔍 Detailed job inspection with data, errors, and stack traces
- 📈 Job statistics (waiting, active, completed, failed, delayed)
- � Health check endpoint for monitoring
- �🎯 Built with React Router 7 (framework mode with SSR)
- ⚡ Fast and responsive UI with Tailwind CSS

## Prerequisites

- Node.js 18+ or compatible runtime
- pnpm 10.18.2+
- Redis server (for BullMQ queues)

## Quick Start

1. **Install dependencies:**

   ```bash
   pnpm install
   ```

2. **Configure Redis connection:**

   ```bash
   cp .env.example .env
   # Edit .env and set your REDIS_URL (default: redis://localhost:6379/0)
   ```

3. **Start development server:**

   ```bash
   pnpm dev
   ```

4. **Open your browser:**
   Navigate to `http://localhost:5173`

## Development

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm typecheck` - Run TypeScript type checking

## Project Structure

```
app/
├── routes/              # Route components
│   ├── home.tsx        # Homepage
│   ├── queues.tsx      # Queues list
│   └── queue-detail.tsx # Queue detail view
├── utils/              # Server-side utilities
│   ├── redis.server.ts # Redis connection
│   └── bullmq.server.ts # BullMQ operations
└── routes.ts           # Route configuration
```

## Environment Variables

- `REDIS_URL` - Redis connection URL (default: `redis://localhost:6379/0`)

## Screenshots

### Queue overview
![queue-overview.png](assets/queue-overview.png)

### Queue details
![queue-detail-1.png](assets/queue-detail-1.png)

![queue-detail-2.png](assets/queue-detail-2.png)

## License

MIT
