import { config, envConfig } from "./config";
import { deleteOldFiles } from "./services/deleter";
import { reportError } from "./services/errors";
import { backupPostgres } from "./services/postgres";
import { backupS3 } from "./services/s3";
import { isTimeForBackup } from "./services/state";

async function run() {
  const cfg = config();
  const envCfg = envConfig(); // also validates
  const backups = cfg.backups;

  for (const backup of backups) {
    // isolate each job: one failing backup must not stop the other jobs
    try {
      const timeForBackup = await isTimeForBackup(cfg.state_file_path, backup);
      if (!timeForBackup) {
        console.log("its not yet time for", backup.name);
        continue;
      }

      if (backup.type === "postgres") {
        await backupPostgres(backup, cfg.state_file_path);
      } else if (backup.type === "s3") {
        await backupS3(backup, cfg.state_file_path);
      } else {
        throw new Error(
          `Backup with type '${backup.type}' was not recognized! Skipping backup job '${backup.name}'`,
        );
      }
    } catch (e) {
      process.exitCode = 1;
      await reportError(e, { job: backup.name, backup_type: backup.type });
    }
  }

  try {
    await deleteOldFiles(cfg);
  } catch (e) {
    process.exitCode = 1;
    await reportError(e, { stage: "delete_old_files" });
  }
}

// catch config/validation errors (thrown before any job runs) so that they
// are reported to bugsink instead of ending as an unhandled rejection
run().catch((e) => {
  process.exitCode = 1;
  reportError(e, { stage: "startup" });
});
