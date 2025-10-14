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
      return "bg-emerald-100 text-emerald-800";
    case "running":
      return "bg-green-100 text-green-800";
    case "waiting":
      return "bg-yellow-100 text-yellow-800";
    case "failed":
      return "bg-red-100 text-red-800";
    case "delayed":
      return "bg-purple-100 text-purple-800";
    default:
      return "bg-gray-100 text-gray-800";
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

    const nextExecution = Math.min(
      ...cronJobs
        .map(job => job.next)
        .filter((next): next is number => next != null),
    );

    if (!isFinite(nextExecution)) return;

    const timeUntilNext = nextExecution - Date.now();

    // Only set timeout if the job hasn't executed yet
    if (timeUntilNext <= 0) return;

    // Revalidate data when next job executes (add 2 seconds buffer)
    const timeout = setTimeout(() => {
      revalidator.revalidate();
    }, timeUntilNext + 2000);

    return () => clearTimeout(timeout);
  }, [cronJobs, revalidator]); // Only re-run when cronJobs change

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
    const aPriority = statusPriority[a.status as keyof typeof statusPriority] ?? 99;
    const bPriority = statusPriority[b.status as keyof typeof statusPriority] ?? 99;

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
          className="text-blue-600 hover:text-blue-800 mb-2 inline-flex items-center"
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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{queueName}</h1>
        <p className="text-gray-600">Manage jobs in this queue</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-center">
            <svg
              className="w-5 h-5 text-red-600 mr-2"
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
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      )}

      {stats && (
        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center gap-2 mb-2">
              <svg
                className="w-5 h-5 text-green-600"
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
              <div className="text-sm text-gray-600">Running</div>
            </div>
            <div className="text-2xl font-bold text-green-600">
              {stats.running}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center gap-2 mb-2">
              <svg
                className="w-5 h-5 text-yellow-600"
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
              <div className="text-sm text-gray-600">Waiting</div>
            </div>
            <div className="text-2xl font-bold text-yellow-600">
              {stats.waiting}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center gap-2 mb-2">
              <svg
                className="w-5 h-5 text-purple-600"
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
              <div className="text-sm text-gray-600">Delayed</div>
            </div>
            <div className="text-2xl font-bold text-purple-600">
              {stats.delayed}
            </div>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-md p-6">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Jobs</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label
                className="block text-xs font-medium text-gray-700 mb-1"
                htmlFor={"filterJobName"}
              >
                Filter by name
              </label>
              <div className="relative">
                <div
                  className="flex flex-wrap gap-2 w-full px-3 py-2 border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 bg-white min-h-[42px]"
                  onClick={() => setShowSuggestions(true)}
                >
                  {selectedJobNames.map(name => (
                    <span
                      key={name}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full"
                    >
                      {name}
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          removeJobName(name);
                        }}
                        className="inline-flex items-center justify-center w-4 h-4 rounded-full hover:bg-blue-200 focus:outline-none"
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
                    className="flex-1 min-w-[120px] outline-none text-sm border-none focus:ring-0 p-0"
                  />
                </div>
                {suggestions.length > 0 && showSuggestions && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {suggestions.map(name => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => addJobName(name)}
                        className="w-full px-4 py-2 text-sm text-left hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
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
                className="block text-xs font-medium text-gray-700 mb-1"
                htmlFor={"filterJobStatus"}
              >
                Filter by status
              </label>
              <select
                id={"filterJobStatus"}
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="w-full px-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-h-[42px]"
              >
                <option value="all">All statuses</option>
                <option value="waiting">Waiting</option>
                <option value="running">Running</option>
                <option value="delayed">Delayed</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors whitespace-nowrap min-h-[42px]"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {sortedJobs.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
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

              return (
                <div
                  key={job.id}
                  className={`border rounded-lg transition-all ${
                    isCronJob
                      ? "border-indigo-300 bg-indigo-50"
                      : isRunning
                        ? "border-green-300 bg-green-50 p-4"
                        : "border-gray-200 p-3"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs text-gray-600">
                          #{job.id}
                        </span>
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {job.name}
                        </span>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(job.status)}`}
                        >
                          {job.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-500">
                          {new Date(job.timestamp).toLocaleString()}
                        </span>
                        {job.attemptsMade > 0 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">
                            <svg
                              className="w-3 h-3 mr-1"
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
                            Retry {job.attemptsMade}
                          </span>
                        )}
                      </div>
                      {isRunning && (
                        <div className="mt-2">
                          {job.progress > 0 ? (
                            <>
                              <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                                <span>Progress</span>
                                <span>{job.progress}%</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-green-500 h-2 rounded-full transition-all"
                                  style={{ width: `${job.progress}%` }}
                                ></div>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                                <span>Processing</span>
                                <span className="text-green-600 font-medium">
                                  Running...
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                <div className="bg-green-500 h-2 rounded-full animate-pulse w-full opacity-50"></div>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 ml-2">
                      {!isRunning && !isCronJob && (
                        <button
                          onClick={() => toggleJobData(job.id)}
                          className="text-xs text-gray-600 hover:text-gray-900"
                        >
                          <svg
                            className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
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
                          <input type="hidden" name="action" value="retry" />
                          <input type="hidden" name="jobId" value={job.id} />
                          <button
                            type="submit"
                            className="text-xs text-blue-600 hover:text-blue-800"
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
                            <input type="hidden" name="action" value="remove" />
                            <input type="hidden" name="jobId" value={job.id} />
                            <button
                              type="submit"
                              className="text-xs text-red-600 hover:text-red-800"
                            >
                              {job.status === "running" ? "Cancel" : "Remove"}
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
                        <div className="bg-orange-50 border border-orange-200 rounded p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <svg
                              className="w-4 h-4 text-orange-600"
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
                            <div className="text-xs font-semibold text-orange-800">
                              Retry Information
                            </div>
                          </div>
                          <div className="text-xs text-orange-700 space-y-1">
                            <div>
                              Current attempt: <span className="font-semibold">{job.attemptsMade}</span>
                            </div>
                            {job.status === "failed" && (
                              <div className="text-red-700 font-medium mt-1">
                                Job has failed permanently
                              </div>
                            )}
                            {(job.status === "waiting" || job.status === "delayed") &&
                              job.attemptsMade > 0 && (
                                <div className="text-orange-800 font-medium mt-1">
                                  ⏳ Waiting to retry...
                                </div>
                              )}
                          </div>
                        </div>
                      )}

                      <div className="bg-gray-50 rounded p-3">
                        <div className="text-xs text-gray-600 mb-1">
                          Job Data:
                        </div>
                        <pre className="text-xs text-gray-800 font-mono overflow-x-auto">
                          {JSON.stringify(job.data, null, 2)}
                        </pre>
                      </div>
                      {job.failedReason && (
                        <div className="bg-red-50 border border-red-200 rounded p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <svg
                              className="w-4 h-4 text-red-600"
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
                            <div className="text-xs font-semibold text-red-600">
                              Error Details
                              {job.attemptsMade > 0 && job.status !== "failed" && (
                                <span className="ml-2 text-orange-600">
                                  (Attempt {job.attemptsMade})
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-sm text-red-800">
                            {job.failedReason}
                          </div>
                        </div>
                      )}
                      {job.stacktrace && job.stacktrace.length > 0 && (
                        <div className="bg-red-50 border border-red-200 rounded p-3">
                          <div className="text-xs text-red-600 mb-1">
                            Stack Trace:
                          </div>
                          <pre className="text-xs text-red-800 font-mono overflow-x-auto">
                            {job.stacktrace.join("\n")}
                          </pre>
                        </div>
                      )}
                      {job.returnvalue && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded p-3">
                          <div className="text-xs text-emerald-600 mb-1">
                            Return Value:
                          </div>
                          <pre className="text-xs text-emerald-800 font-mono overflow-x-auto">
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

        {/* Cron Jobs Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Cron Jobs
            </h2>
            {cronJobs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <svg
                  className="w-12 h-12 mx-auto mb-3 text-gray-400"
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
                <p className="text-sm">No cron jobs</p>
              </div>
            ) : (
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
                      className={`border rounded-lg p-3 transition-all ${
                        isRunningNow
                          ? "border-green-400 bg-green-50"
                          : "border-gray-200 hover:border-indigo-300"
                      }`}
                    >
                      <div className="mb-2">
                        <div className="flex items-center justify-between mb-1">
                          <div className="font-medium text-sm text-gray-900">
                            {cronJob.name}
                          </div>
                          {isRunningNow && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 animate-pulse">
                              <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5"></span>
                              Running
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-600 font-mono bg-gray-50 px-2 py-1 rounded mb-1">
                          {cronJob.pattern}
                        </div>
                        {timeRemaining !== null && (
                          <div
                            className={`text-xs font-semibold mb-1 ${
                              isRunningNow
                                ? "text-green-600"
                                : timeRemaining < 60000
                                  ? "text-orange-600"
                                  : "text-indigo-600"
                            }`}
                          >
                            {formatTimeRemaining(timeRemaining)}
                          </div>
                        )}
                        <div className="text-xs text-gray-500">
                          Next:{" "}
                          {cronJob.next
                            ? new Date(cronJob.next).toLocaleString()
                            : "N/A"}
                        </div>
                      </div>
                      <button
                        onClick={() => toggleCronJob(cronJob.key)}
                        className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 focus:outline-none"
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
                        <div className="mt-2 bg-gray-50 rounded p-2 border border-gray-200">
                          <pre className="text-xs text-gray-800 font-mono overflow-x-auto whitespace-pre-wrap break-words">
                            {JSON.stringify(cronJob.data, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
