import { type BackupJob, config } from "../config";
import { execSync } from "child_process";

const tenMinutes = 10 * 60 * 1000;

export async function backupFileToSecondLocation(
  job: BackupJob,
  filePath: string,
) {
  const now = new Date();
  const y = now.getFullYear();

  const secondLocation = config().second_location;
  const target = secondLocation.target;

  // rclone copy creates the target directory (and missing parents) on the
  // remote itself, so no mkdir is needed
  const rcloneDir = `${y}/${job.name}`;
  const copyCmd = `rclone copy ${filePath} ${target}/${rcloneDir}/`;

  try {
    // call it. call it NOW!
    console.log("saving on second location:", copyCmd);
    execSync(copyCmd, {
      timeout: tenMinutes,
    });
  } catch (e: any) {
    // log locally and rethrow so the job marks itself as failed and reports
    // the error once (avoid double-reporting to bugsink)
    console.error("Backup to second location failed:", e);
    throw e;
  }
}
