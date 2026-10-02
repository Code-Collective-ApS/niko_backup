export type JobStatus = "success" | "failed" | "skipped";

export interface JobResult {
  name: string;
  type: string;
  status: JobStatus;
  /** size of the produced backup file in bytes (if one was produced) */
  sizeBytes?: number;
  /** wall-clock execution time of the job */
  durationMs?: number;
  /** error message for failed jobs */
  error?: string;
}
