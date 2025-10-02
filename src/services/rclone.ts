import { type BackupJob, config } from "../config";
import { execSync } from "child_process";
import { parseAndNotify } from "./notifier";

const tenSeconds = 10000;
const tenMinutes = 10 * 60 * 1000;

export async function backupFileToSecondLocation(
  job: BackupJob,
  filePath: string,
) {
  console.log("Backing up rclone target:", job.target);
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();

  const secondLocation = config().second_location;
  const target = secondLocation.target;

  // create target directory
  const rcloneDir = `${y}/${job.name}`;
  const mkdirCmd = `rclone mkdir ${target}/${rcloneDir}`;

  // copy source file to target directory (keep source filename)
  const targetFilename = filePath.split("/").reverse()[0];
  const copyCmd = `rclone copy ${filePath} ${target}/${rcloneDir}/`;

  try {
    // check if there is postgres connection, report err if not
    execSync(mkdirCmd, {
      timeout: tenSeconds,
    });

    // call it. call it NOW!
    console.log("saving on second location:", copyCmd);
    execSync(copyCmd, {
      timeout: tenMinutes,
    });
  } catch (e: any) {
    // send error notification
    console.error(e);
    if (job.ntfy_topic) {
      await parseAndNotify(job, job.ntfy_topic, e);
    } else {
      console.warn(
        "Not sending notification due to missing option `ntfy_topic` in niko backup config",
      );
    }
  }
}
