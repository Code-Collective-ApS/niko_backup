import type { BackupJob } from "../config";
import { config } from "../config";
import { getFileNameFriendlyDate } from "../helpers";
import { sendSuccessNoti } from "./notifier";
import { reportError } from "./errors";
import { backupFileToSecondLocation } from "./rclone";
import { resetBackupTimer } from "./state";
import { execSync } from "child_process";
import * as fs from "node:fs";

const tenMinutes = 10 * 60 * 1000;

export async function backupPostgres(job: BackupJob, stateFilePath: string) {
  console.log("Backing up postgres:", job.target);

  if (job.encrypt && !job.encrypt_pass) {
    throw new Error(
      "No 'encrypt_pass' was defined in job with encryption flag",
    );
  }

  const outputDir = config().output_dir;
  const time = getFileNameFriendlyDate(new Date());
  const resultPath =
    `${outputDir}/${job.name}.${time}.gz` + (job.encrypt ? ".enc" : "");
  const psqlCheckCmd = `PGCONNECT_TIMEOUT=3 ${job.psql || "psql"} ${job.target} -c 'SELECT 1'`;
  const mkdirCmd = `mkdir -p ${outputDir}`;
  const pgDumpCmd = `${job.pg_dump || "pg_dump"} -x -O ${job.target}`;
  const dumpCmd = `set -o pipefail; ${pgDumpCmd} --no-reconnect | gzip > ${resultPath}`;
  // the encryption password is passed via environment variable so that it
  // does not show up in the process list
  const dumpEncryptCmd = `set -o pipefail; ${pgDumpCmd} | gzip | openssl enc -e -aes256 -pass env:NIKO_ENCRYPT_PASS -out ${resultPath}`;

  try {
    // check if there is postgres connection, report err if not
    execSync(psqlCheckCmd, {
      timeout: 2000,
    });

    // ensure dir exists
    execSync(mkdirCmd);

    // call it. call it NOW!
    // pipefail requires bash (dash does not support it)
    execSync(job.encrypt ? dumpEncryptCmd : dumpCmd, {
      timeout: tenMinutes,
      shell: "/bin/bash",
      env: { ...process.env, NIKO_ENCRYPT_PASS: job.encrypt_pass || "" },
    });

    // backup postgres to second location if enabled
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
  } catch (e: any) {
    // report the error via bugsink (which triggers ntfy on its end)
    process.exitCode = 1;
    await reportError(e, { job: job.name, backup_type: "postgres" });
  }
}
