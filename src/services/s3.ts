import type { BackupJob } from "../config";
import { config } from "../config";
import { getFileNameFriendlyDate } from "../helpers";
import { execSync, spawnSync } from "child_process";
import { resetBackupTimer } from "./state";
import { sendSuccessNoti } from "./notifier";
import { backupFileToSecondLocation } from "./rclone";
import * as fs from "node:fs";

export async function backupS3(job: BackupJob, stateFilePath: string) {
  const newerThan = job.s3_newer_than;
  const limitDownload = job.s3_download_limit;

  if (!newerThan || !limitDownload) {
    throw new Error(
      "'s3_newer_than' or 's3_limit_download' was not defined in config",
    );
  }

  console.log("Backing up minio:", job.target, { newerThan, limitDownload });

  if (job.encrypt && !job.encrypt_pass) {
    throw new Error(
      "No 'encrypt_pass' was defined in job with encryption flag",
    );
  }

  // read if any files are present
  const checkCmd = `mc find ${job.target} --newer-than ${job.s3_newer_than}`;
  const anyFiles = spawnSync(checkCmd, { shell: true, encoding: "utf8" });
  if (anyFiles.error) {
    throw anyFiles.error;
  } else {
    const filesToDownload = anyFiles.stdout.trim();
    const filesCount = filesToDownload.split("\n").length;
    if (filesCount === 0) {
      console.warn("There are no files to download");
      await resetBackupTimer(job, stateFilePath);
      return;
    }
    console.log(`Downloading ${filesCount} files from s3..`);
  }

  const outputDir = config().output_dir;
  const time = getFileNameFriendlyDate(new Date());
  const dirName = `${job.name}.${time}`;
  const tmpDir = `tmp/${dirName}`;
  const resultPath =
    `${outputDir}/${dirName}.tar.gz` + (job.encrypt ? ".enc" : "");

  const mkdirOutputCmd = `mkdir -p ${outputDir}`;
  const mkdirTmpCmd = `mkdir -p ${tmpDir}`;
  const mirrorCmd = `mc mirror --limit-download ${limitDownload} --newer-than ${newerThan} ${job.target} ${tmpDir}`;
  const tarCmd = `tar -cvf ${resultPath} ${tmpDir}`;
  // the encryption password is passed via environment variable so that it
  // does not show up in the process list
  const tarCmdEncrypt = `set -o pipefail; tar -cvf - ${tmpDir} | openssl enc -e -aes256 -pass env:NIKO_ENCRYPT_PASS -out ${resultPath}`;
  const cleanupCmd = "rm -r tmp";

  try {
    execSync(mkdirTmpCmd, { stdio: "ignore" });
    execSync(mkdirOutputCmd, { stdio: "ignore" });
    execSync(mirrorCmd, { stdio: "ignore" });
    // pipefail requires bash (dash does not support it)
    execSync(job.encrypt ? tarCmdEncrypt : tarCmd, {
      stdio: "ignore",
      shell: "/bin/bash",
      env: { ...process.env, NIKO_ENCRYPT_PASS: job.encrypt_pass || "" },
    });
  } finally {
    // clean up the temp dir no matter if the backup went well or not
    execSync(cleanupCmd, { stdio: "ignore" });
  }

  // backup to second location if enabled
  if (!job.disable_second_location) {
    await backupFileToSecondLocation(job, resultPath);
  }

  // fetch meta file to recieve size
  const stats = await fs.promises.stat(resultPath);

  // send success notification
  if (job.ntfy_topic) {
    await sendSuccessNoti(job.ntfy_topic, job.name, stats.size);
  } else {
    console.warn(
      "Not sending notification due to missing option `ntfy_topic` in niko backup config",
    );
  }

  // only reset the backup timer on success, so that a failed backup is
  // retried on the next run
  await resetBackupTimer(job, stateFilePath);
}
