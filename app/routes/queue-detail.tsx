import { useState, useEffect } from "react";
import { Form, Link, redirect, useRevalidator } from "react-router";
import {
  getQueueStats,
  getQueueJobs,
  getRepeatableJobs,
  removeJob,
  retryJob,
} from "../utils/bullmq.server";
import type { Route } from "./+types/queue-detail";

export function meta({ params }: Route.MetaArgs) {
  return [{ title: `${params.queueName} - Matador` }];
}

export async function loader({ params }: Route.LoaderArgs) {
  const queueName = params.queueName!;

  try {
    const [stats, waitingJobs, runningJobs, delayedJobs, cronJobs] =
      await Promise.all([
        getQueueStats(queueName),
        getQueueJobs(queueName, "waiting", 0, 49),
        getQueueJobs(queueName, "running", 0, 49),
        getQueueJobs(queueName, "delayed", 0, 49),
        getRepeatableJobs(queueName),
      ]);

    // Combine all jobs with their status (excluding cron jobs)
    const jobs = [
      ...waitingJobs.map(j => ({ ...j, status: "waiting" })),
      ...runningJobs.map(j => ({ ...j, status: "running" })),
      ...delayedJobs.map(j => ({ ...j, status: "delayed" })),
    ].sort((a, b) => b.timestamp - a.timestamp);

    return { stats, jobs, cronJobs, error: null };
  } catch {
    return {
      stats: null,
      jobs: [],
      cronJobs: [],
      error:
        "Failed to load queue details. Please check your Redis connection.",
    };
  }
}

export async function action({ params, request }: Route.ActionArgs) {
  const queueName = params.queueName!;
  const formData = await request.formData();
  const actionType = formData.get("action");
  const jobId = formData.get("jobId") as string;
  const isCronJob = formData.get("isCronJob") === "true";

  try {
    if (actionType === "remove") {
      // Prevent removal of cron jobs
      if (isCronJob) {
        return {
          error: "Cannot remove cron jobs. They are automatically scheduled.",
        };
      }
      await removeJob(queueName, jobId);
    } else if (actionType === "retry") {
      await retryJob(queueName, jobId);
    }
    return redirect(`/queues/${queueName}`);
  } catch {
    return { error: `Failed to ${actionType} job` };
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case "completed":
      return "bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200";
    case "running":
      return "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200";
    case "waiting":
      return "bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200";
    case "failed":
      return "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200";
    case "delayed":
      return "bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200";
    default:
      return "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200";
  }
}

export default function QueueDetail({
  loaderData,
  params,
}: Route.ComponentProps) {
  const { stats, jobs, cronJobs, error } = loaderData;
  const queueName = params.queueName || "";
  const revalidator = useRevalidator();
  const [selectedJobNames, setSelectedJobNames] = useState<string[]>([]);
  const [jobNameInput, setJobNameInput] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [expandedCronJobs, setExpandedCronJobs] = useState<Set<string>>(
    new Set(),
  );
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  const toggleJobData = (jobId: string) => {
    setExpandedJobs(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  };

  // Update current time every second for countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-refresh jobs data every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      revalidator.revalidate();
    }, 5000);
    return () => clearInterval(interval);
  }, [revalidator]);

  // Revalidate data when any cron job's next execution passes
  useEffect(() => {
    if (cronJobs.length === 0) return;

    const now = Date.now();
    const upcomingExecutions = cronJobs
      .map(job => job.next)
      .filter((next): next is number => next != null && next > now);

    if (upcomingExecutions.length === 0) return;

    const nextExecution = Math.min(...upcomingExecutions);
    const timeUntilNext = nextExecution - now;

    // Refresh immediately when job executes
    const immediateTimeout = setTimeout(() => {
      revalidator.revalidate();
    }, timeUntilNext + 100); // 100ms after scheduled time

    // Follow-up refresh to catch the running job
    const followUpTimeout = setTimeout(() => {
      revalidator.revalidate();
    }, timeUntilNext + 1500); // 1.5s after to catch it in running state

    return () => {
      clearTimeout(immediateTimeout);
      clearTimeout(followUpTimeout);
    };
  }, [cronJobs, revalidator]);

  const toggleCronJob = (key: string) => {
    setExpandedCronJobs(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const formatTimeRemaining = (milliseconds: number): string => {
    if (milliseconds <= 0) return "Running...";

    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      const remainingHours = hours % 24;
      return `${days}d ${remainingHours}h`;
    } else if (hours > 0) {
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes}m`;
    } else if (minutes > 0) {
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  // Sort cron jobs by next execution time (nearest first)
  const sortedCronJobs = [...cronJobs].sort((a, b) => {
    const aNext = a.next ?? Infinity;
    const bNext = b.next ?? Infinity;
    return aNext - bNext;
  });

  // Get unique job names for autocomplete
  const uniqueJobNames = Array.from(new Set(jobs.map(job => job.name))).sort();

  // Filter suggestions based on input or show all if focused
  const suggestions = uniqueJobNames.filter(
    name =>
      !selectedJobNames.includes(name) &&
      (jobNameInput === "" ||
        name.toLowerCase().includes(jobNameInput.toLowerCase())),
  );

  const filteredJobs = jobs.filter(job => {
    const nameMatch =
      selectedJobNames.length === 0 || selectedJobNames.includes(job.name);
    const statusMatch = statusFilter === "all" || job.status === statusFilter;
    return nameMatch && statusMatch;
  });

  // Sort jobs: running first, then waiting, then delayed
  const sortedJobs = [...filteredJobs].sort((a, b) => {
    const statusPriority = {
      running: 0,
      waiting: 1,
      delayed: 2,
      failed: 3,
      completed: 4,
    };
    const aPriority =
      statusPriority[a.status as keyof typeof statusPriority] ?? 99;
    const bPriority =
      statusPriority[b.status as keyof typeof statusPriority] ?? 99;

    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    return b.timestamp - a.timestamp;
  });

  const addJobName = (name: string) => {
    if (name && !selectedJobNames.includes(name)) {
      setSelectedJobNames([...selectedJobNames, name]);
      setJobNameInput("");
    }
  };

  const removeJobName = (name: string) => {
    setSelectedJobNames(selectedJobNames.filter(n => n !== name));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && jobNameInput) {
      e.preventDefault();
      if (suggestions.length > 0) {
        addJobName(suggestions[0]);
      } else if (uniqueJobNames.includes(jobNameInput)) {
        addJobName(jobNameInput);
      }
    } else if (
      e.key === "Backspace" &&
      !jobNameInput &&
      selectedJobNames.length > 0
    ) {
      removeJobName(selectedJobNames[selectedJobNames.length - 1]);
    }
  };

  return (
    <main className="container mx-auto px-6 py-8">
      <div className="mb-6">
        <Link
          to="/"
          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 mb-2 inline-flex items-center"
        >
          <svg
            className="w-4 h-4 mr-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to Queues
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{queueName}</h1>
        <p className="text-gray-600 dark:text-gray-400">Manage jobs in this queue</p>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
          <div className="flex items-center">
            <svg
              className="w-5 h-5 text-red-600 dark:text-red-400 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-red-700 dark:text-red-400">{error}</p>
          </div>
        </div>
      )}

      {stats && (
        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <div className="flex items-center gap-2 mb-2">
              <svg
                className="w-5 h-5 text-green-600 dark:text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="text-sm text-gray-600 dark:text-gray-400">Running</div>
            </div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {stats.running}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <div className="flex items-center gap-2 mb-2">
              <svg
                className="w-5 h-5 text-yellow-600 dark:text-yellow-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="text-sm text-gray-600 dark:text-gray-400">Waiting</div>
            </div>
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
              {stats.waiting}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <div className="flex items-center gap-2 mb-2">
              <svg
                className="w-5 h-5 text-purple-600 dark:text-purple-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="text-sm text-gray-600 dark:text-gray-400">Delayed</div>
            </div>
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {stats.delayed}
            </div>
          </div>
        </div>
      )}

      <div
        className={`grid gap-6 ${cronJobs.length > 0 ? "lg:grid-cols-3" : ""}`}
      >
        <div className={cronJobs.length > 0 ? "lg:col-span-2" : ""}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Jobs</h2>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <label
                    className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
                    htmlFor={"filterJobName"}
                  >
                    Filter by name
                  </label>
                  <div className="relative">
                    <div
                      className="flex flex-wrap gap-2 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 dark:focus-within:ring-blue-400 focus-within:border-blue-500 dark:focus-within:border-blue-400 bg-white dark:bg-gray-700 min-h-[42px]"
                      onClick={() => setShowSuggestions(true)}
                    >
                      {selectedJobNames.map(name => (
                        <span
                          key={name}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs font-medium rounded-full"
                        >
                          {name}
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              removeJobName(name);
                            }}
                            className="inline-flex items-center justify-center w-4 h-4 rounded-full hover:bg-blue-200 dark:hover:bg-blue-800 focus:outline-none"
                          >
                            <svg
                              className="w-3 h-3"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        </span>
                      ))}
                      <input
                        id={"filterJobName"}
                        type="text"
                        placeholder={
                          selectedJobNames.length === 0
                            ? "Type to search job names..."
                            : ""
                        }
                        value={jobNameInput}
                        onChange={e => setJobNameInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onFocus={() => setShowSuggestions(true)}
                        onBlur={() =>
                          setTimeout(() => setShowSuggestions(false), 200)
                        }
                        className="flex-1 min-w-[120px] outline-none text-sm border-none focus:ring-0 p-0 bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                      />
                    </div>
                    {suggestions.length > 0 && showSuggestions && (
                      <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {suggestions.map(name => (
                          <button
                            key={name}
                            type="button"
                            onClick={() => addJobName(name)}
                            className="w-full px-4 py-2 text-sm text-left text-gray-900 dark:text-gray-100 hover:bg-blue-50 dark:hover:bg-blue-900/50 focus:bg-blue-50 dark:focus:bg-blue-900/50 focus:outline-none"
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="sm:w-48">
                  <label
                    className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
                    htmlFor={"filterJobStatus"}
                  >
                    Filter by status
                  </label>
                  <select
                    id={"filterJobStatus"}
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className="w-full px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 min-h-[42px]"
                  >
                    <option value="all">All statuses</option>
                    <option value="waiting">Waiting</option>
                    <option value="running">Running</option>
                    <option value="delayed">Delayed</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {sortedJobs.length === 0 ? (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <p>
                    {jobs.length === 0
                      ? "No jobs found in this queue"
                      : "No jobs match the filter"}
                  </p>
                </div>
              ) : (
                sortedJobs.map(job => {
                  const isCronJob = !!job.repeatJobKey;
                  const isExpanded = expandedJobs.has(job.id);
                  const isRunning = job.status === "running";
                  const isWaitingOrDelayed =
                    job.status === "waiting" || job.status === "delayed";

                  return (
                    <div
                      key={job.id}
                      className={`border rounded transition-all ${
                        isRunning
                          ? "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 p-4 rounded-lg"
                          : isWaitingOrDelayed
                            ? "border-gray-200 dark:border-gray-700 p-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                            : "border-gray-200 dark:border-gray-700 p-3"
                      }`}
                    >
                      <div
                        className={`flex items-center justify-between ${isWaitingOrDelayed ? "gap-1.5" : "gap-3"}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div
                            className={`flex items-center ${isWaitingOrDelayed ? "gap-1.5" : "gap-2"} flex-wrap`}
                          >
                            <span
                              className={`font-mono ${isWaitingOrDelayed ? "text-[10px]" : "text-xs"} ${isWaitingOrDelayed ? "text-gray-400 dark:text-gray-500" : "text-gray-600 dark:text-gray-400"}`}
                            >
                              #{job.id}
                            </span>
                            <span
                              className={`${isWaitingOrDelayed ? "text-xs" : "text-sm"} font-medium text-gray-900 dark:text-gray-100 truncate`}
                            >
                              {job.name}
                            </span>
                            <span
                              className={`inline-flex items-center ${isWaitingOrDelayed ? "px-1.5 py-0" : "px-2.5 py-0.5"} rounded-full text-[10px] font-medium ${getStatusColor(job.status)}`}
                            >
                              {job.status}
                            </span>
                            {job.attemptsMade > 0 && (
                              <span
                                className={`inline-flex items-center ${isWaitingOrDelayed ? "px-1.5 py-0" : "px-2 py-0.5"} rounded text-[10px] font-medium bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200`}
                              >
                                <svg
                                  className={`${isWaitingOrDelayed ? "w-2 h-2" : "w-3 h-3"} ${isWaitingOrDelayed ? "" : "mr-1"}`}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                  />
                                </svg>
                                {isWaitingOrDelayed
                                  ? ""
                                  : ` ${job.attemptsMade}`}
                              </span>
                            )}
                            <span
                              className={`${isWaitingOrDelayed ? "text-[10px]" : "text-xs"} text-gray-400 dark:text-gray-500`}
                            >
                              enqueued at{" "}
                              {isWaitingOrDelayed
                                ? new Date(job.timestamp).toLocaleTimeString()
                                : new Date(job.timestamp).toLocaleString()}
                            </span>
                          </div>
                          {isRunning && (
                            <div className="mt-2">
                              {job.progress > 0 ? (
                                <>
                                  <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                                    <span>Progress</span>
                                    <span>{job.progress}%</span>
                                  </div>
                                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                                    <div
                                      className="bg-green-500 dark:bg-green-400 h-2 rounded-full transition-all duration-300 ease-out"
                                      style={{ width: `${job.progress}%` }}
                                    ></div>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                                    <span>Processing</span>
                                    <span className="text-green-600 dark:text-green-400 font-medium">
                                      Running...
                                    </span>
                                  </div>
                                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden relative">
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-green-500 dark:via-green-400 to-transparent opacity-60 animate-[shimmer_2s_infinite]"></div>
                                    <style>{`
                                  @keyframes shimmer {
                                    0% { transform: translateX(-100%); }
                                    100% { transform: translateX(100%); }
                                  }
                                `}</style>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                        <div
                          className={`flex items-center ${isWaitingOrDelayed ? "gap-0.5" : "gap-2"}`}
                        >
                          {!isRunning && !isCronJob && (
                            <button
                              onClick={() => toggleJobData(job.id)}
                              className={`${isWaitingOrDelayed ? "text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 p-0.5" : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"} transition-colors`}
                              title={
                                isExpanded ? "Hide details" : "Show details"
                              }
                            >
                              <svg
                                className={`${isWaitingOrDelayed ? "w-3 h-3" : "w-4 h-4"} transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 9l-7 7-7-7"
                                />
                              </svg>
                            </button>
                          )}
                          {job.status === "failed" && (
                            <Form method="post">
                              <input
                                type="hidden"
                                name="action"
                                value="retry"
                              />
                              <input
                                type="hidden"
                                name="jobId"
                                value={job.id}
                              />
                              <button
                                type="submit"
                                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 px-1"
                              >
                                Retry
                              </button>
                            </Form>
                          )}
                          {(job.status === "waiting" ||
                            job.status === "running" ||
                            job.status === "delayed") &&
                            !isCronJob && (
                              <Form method="post">
                                <input
                                  type="hidden"
                                  name="action"
                                  value="remove"
                                />
                                <input
                                  type="hidden"
                                  name="jobId"
                                  value={job.id}
                                />
                                <button
                                  type="submit"
                                  className={`${isWaitingOrDelayed ? "text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 px-1 py-0.5" : "text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 px-1"} transition-colors`}
                                  title={
                                    job.status === "running"
                                      ? "Cancel job"
                                      : "Remove job"
                                  }
                                >
                                  {job.status === "running"
                                    ? "Cancel"
                                    : "Remove"}
                                </button>
                              </Form>
                            )}
                        </div>
                      </div>

                      {/* Always show data for running jobs, collapsed for others */}
                      {(isRunning || isExpanded) && (
                        <div className="mt-3 space-y-2">
                          {/* Show retry information if job has been retried */}
                          {job.attemptsMade > 0 && (
                            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <svg
                                  className="w-4 h-4 text-orange-600 dark:text-orange-400"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                  />
                                </svg>
                                <div className="text-xs font-semibold text-orange-800 dark:text-orange-300">
                                  Retry Information
                                </div>
                              </div>
                              <div className="text-xs text-orange-700 dark:text-orange-300 space-y-1">
                                <div>
                                  Current attempt:{" "}
                                  <span className="font-semibold">
                                    {job.attemptsMade}
                                  </span>
                                </div>
                                {job.status === "failed" && (
                                  <div className="text-red-700 dark:text-red-400 font-medium mt-1">
                                    Job has failed permanently
                                  </div>
                                )}
                                {(job.status === "waiting" ||
                                  job.status === "delayed") &&
                                  job.attemptsMade > 0 && (
                                    <div className="text-orange-800 dark:text-orange-300 font-medium mt-1">
                                      ⏳ Waiting to retry...
                                    </div>
                                  )}
                              </div>
                            </div>
                          )}

                          <div className="bg-gray-50 dark:bg-gray-700 rounded p-3">
                            <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                              Job Data:
                            </div>
                            <pre className="text-xs text-gray-800 dark:text-gray-200 font-mono overflow-x-auto">
                              {JSON.stringify(job.data, null, 2)}
                            </pre>
                          </div>
                          {job.failedReason && (
                            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <svg
                                  className="w-4 h-4 text-red-600 dark:text-red-400"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                  />
                                </svg>
                                <div className="text-xs font-semibold text-red-600 dark:text-red-400">
                                  Error Details
                                  {job.attemptsMade > 0 &&
                                    job.status !== "failed" && (
                                      <span className="ml-2 text-orange-600 dark:text-orange-400">
                                        (Attempt {job.attemptsMade})
                                      </span>
                                    )}
                                </div>
                              </div>
                              <div className="text-sm text-red-800 dark:text-red-300">
                                {job.failedReason}
                              </div>
                            </div>
                          )}
                          {job.stacktrace && job.stacktrace.length > 0 && (
                            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3">
                              <div className="text-xs text-red-600 dark:text-red-400 mb-1">
                                Stack Trace:
                              </div>
                              <pre className="text-xs text-red-800 dark:text-red-300 font-mono overflow-x-auto">
                                {job.stacktrace.join("\n")}
                              </pre>
                            </div>
                          )}
                          {job.returnvalue && (
                            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded p-3">
                              <div className="text-xs text-emerald-600 dark:text-emerald-400 mb-1">
                                Return Value:
                              </div>
                              <pre className="text-xs text-emerald-800 dark:text-emerald-300 font-mono overflow-x-auto">
                                {JSON.stringify(job.returnvalue, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Cron Jobs Sidebar - Only show if there are cron jobs */}
        {cronJobs.length > 0 && (
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Cron Jobs
              </h2>
              <div className="space-y-3">
                {sortedCronJobs.map(cronJob => {
                  const isExpanded = expandedCronJobs.has(cronJob.key);
                  const timeRemaining = cronJob.next
                    ? cronJob.next - currentTime
                    : null;
                  const isRunningNow =
                    timeRemaining !== null && timeRemaining <= 1000;

                  return (
                    <div
                      key={cronJob.key}
                      className={`border rounded-lg transition-all ${
                        isRunningNow
                          ? "border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-900/20 p-3"
                          : "border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600 p-3"
                      }`}
                    >
                      <div className="mb-2">
                        <div className="flex items-center justify-between mb-1">
                          <div className="font-medium text-sm text-gray-900 dark:text-gray-100">
                            {cronJob.name}
                          </div>
                          {isRunningNow && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 animate-pulse">
                              <span className="w-1.5 h-1.5 bg-green-500 dark:bg-green-400 rounded-full mr-1.5"></span>
                              Running
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400 font-mono bg-gray-50 dark:bg-gray-700 px-2 py-1 rounded mb-1">
                          {cronJob.pattern}
                        </div>
                        {timeRemaining !== null && (
                          <div
                            className={`text-xs font-semibold mb-1 ${
                              isRunningNow
                                ? "text-green-600 dark:text-green-400"
                                : timeRemaining < 60000
                                  ? "text-orange-600 dark:text-orange-400"
                                  : "text-indigo-600 dark:text-indigo-400"
                            }`}
                          >
                            {formatTimeRemaining(timeRemaining)}
                          </div>
                        )}
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Next:{" "}
                          {cronJob.next
                            ? new Date(cronJob.next).toLocaleString()
                            : "N/A"}
                        </div>
                      </div>
                      <button
                        onClick={() => toggleCronJob(cronJob.key)}
                        className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 focus:outline-none"
                      >
                        <svg
                          className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                        {isExpanded ? "Hide" : "Show"} job data
                      </button>
                      {isExpanded && (
                        <div className="mt-2 bg-gray-50 dark:bg-gray-700 rounded p-2 border border-gray-200 dark:border-gray-600">
                          <pre className="text-xs text-gray-800 dark:text-gray-200 font-mono overflow-x-auto whitespace-pre-wrap break-words">
                            {JSON.stringify(cronJob.data, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
