import { config, envConfig } from "./config";
import { deleteOldFiles } from "./services/deleter";
import { backupPostgres } from "./services/postgres";
import { backupS3 } from "./services/s3";
import { isTimeForBackup } from "./services/state";

async function run() {
  const cfg = config();
  const envCfg = envConfig(); // also validates
  const backups = cfg.backups;

  for (const backup of backups) {
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
      // TODO: report error
      console.error(
        `Backup with type '${backup.type}' was not recognized! Skipping backup job '${backup.name}'`,
      );
    }
  }

  await deleteOldFiles(cfg);
}

run();
