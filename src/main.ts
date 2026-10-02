import { config, envConfig } from "./config";
import { deleteOldFiles } from "./services/deleter";
import { reportError } from "./services/errors";
import { sendRunSummary, type SummaryRow } from "./services/notifier";
import { backupPostgres } from "./services/postgres";
import { backupS3 } from "./services/s3";
import { getLastSuccessDate, isTimeForBackup } from "./services/state";
import type { JobResult } from "./types";

const dayMs = 24 * 60 * 60 * 1000;

function nextRunDate(lastRan: Date, intervalDays: number): Date {
  return new Date(lastRan.getTime() + intervalDays * dayMs);
}

async function run() {
  const cfg = config();
  envConfig(); // also validates
  const startedAt = new Date();
  const rows: SummaryRow[] = [];

  for (const backup of cfg.backups) {
    // isolate each job: one failing backup must not stop the other jobs
    try {
      const timeForBackup = await isTimeForBackup(cfg.state_file_path, backup);
      if (!timeForBackup) {
        console.log("its not yet time for", backup.name);
        const lastSuccess = await getLastSuccessDate(
          cfg.state_file_path,
          backup,
        );
        rows.push({
          name: backup.name,
          type: backup.type,
          status: "skipped",
          nextRun: lastSuccess
            ? nextRunDate(lastSuccess, backup.interval_days)
            : null,
        });
        continue;
      }

      let result: JobResult;
      if (backup.type === "postgres") {
        result = await backupPostgres(backup, cfg.state_file_path);
      } else if (backup.type === "s3") {
        result = await backupS3(backup, cfg.state_file_path);
      } else {
        throw new Error(
          `Backup with type '${backup.type}' was not recognized!`,
        );
      }

      rows.push({
        ...result,
        nextRun:
          result.status === "success"
            ? nextRunDate(new Date(), backup.interval_days)
            : null,
      });
    } catch (e) {
      // safety net: jobs normally catch, report and return results themselves
      process.exitCode = 1;
      await reportError(e, { job: backup.name, backup_type: backup.type });
      rows.push({
        name: backup.name,
        type: backup.type,
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
        nextRun: null,
      });
    }
  }

  try {
    await deleteOldFiles(cfg);
  } catch (e) {
    process.exitCode = 1;
    await reportError(e, { stage: "delete_old_files" });
  }

  // send a single summary notification for the whole run
  const finishedAt = new Date();
  if (cfg.ntfy_topic) {
    await sendRunSummary(cfg.ntfy_topic, { startedAt, finishedAt, rows });
  } else {
    console.warn("Not sending run summary: no 'ntfy_topic' defined in config");
  }
}

// catch config/validation errors (thrown before any job runs) so that they
// are reported to bugsink instead of ending as an unhandled rejection
run().catch((e) => {
  process.exitCode = 1;
  reportError(e, { stage: "startup" });
});
