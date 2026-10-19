import type { BackupJob } from "../config";
import { config } from "../config";
import { getFileNameFriendlyDate } from "../helpers";
import type { JobResult } from "../types";
import { execSync, spawnSync } from "child_process";
import { reportError } from "./errors";
import { resetBackupTimer } from "./state";
import { backupFileToSecondLocation } from "./rclone";
import * as fs from "node:fs";

// commands run with arg arrays (no shell) so that paths, hosts and the
// pre-command cannot break shell quoting
export async function backupDirectory(
  job: BackupJob,
  stateFilePath: string,
): Promise<JobResult> {
  const startedAt = Date.now();

  if (!job.paths || job.paths.length === 0) {
    throw new Error("'paths' was not defined in config");
  }

  if (job.encrypt && !job.encrypt_pass) {
    throw new Error(
      "No 'encrypt_pass' was defined in job with encryption flag",
    );
  }

  console.log("Backing up directory:", job.target, { paths: job.paths });

  try {
    const outputDir = config().output_dir;
    const time = getFileNameFriendlyDate(new Date());
    const dirName = `${job.name}.${time}`;
    const tmpDir = `tmp/${dirName}`;
    const resultPath =
      `${outputDir}/${dirName}.tar.gz` + (job.encrypt ? ".enc" : "");

    const sshArgs = [
      "-o",
      "BatchMode=yes",
      // first connection to a new VM is accepted; a changed fingerprint on a
      // known host still fails, so silent man-in-the-middle is not possible
      "-o",
      "StrictHostKeyChecking=accept-new",
      ...(job.ssh_key ? ["-i", job.ssh_key] : []),
    ];

    // optional remote pre-command: e.g. an sqlite online-backup so the
    // database file is not captured mid-write
    // (sqlite3 <db> ".backup <db>.bak")
    if (job.pre_command) {
      const pre = spawnSync("ssh", [...sshArgs, job.target, job.pre_command], {
        encoding: "utf8",
      });
      if (pre.error) {
        throw pre.error;
      }
      if (pre.status !== 0) {
        throw new Error(
          `remote pre_command failed with exit code ${pre.status}: ${pre.stderr?.trim() || "no stderr"}`,
        );
      }
    }

    const mkdirOutputCmd = `mkdir -p ${outputDir}`;
    const mkdirTmpCmd = `mkdir -p ${tmpDir}`;
    const tarCmd = `tar -cvzf ${resultPath} ${tmpDir}`;
    // the encryption password is passed via environment variable so that it
    // does not show up in the process list
    const tarCmdEncrypt = `set -o pipefail; tar -cvzf - ${tmpDir} | openssl enc -e -aes256 -pass env:NIKO_ENCRYPT_PASS -out ${resultPath}`;
    const cleanupCmd = "rm -rf tmp";

    try {
      execSync(mkdirTmpCmd, { stdio: "ignore" });
      execSync(mkdirOutputCmd, { stdio: "ignore" });

      for (const remotePath of job.paths) {
        const rsync = spawnSync(
          "rsync",
          [
            "-a",
            "-e",
            `ssh ${sshArgs.join(" ")}`,
            `${job.target}:${remotePath}`,
            `${tmpDir}/`,
          ],
          { encoding: "utf8" },
        );
        if (rsync.error) {
          throw rsync.error;
        }
        if (rsync.status !== 0) {
          throw new Error(
            `rsync of '${remotePath}' failed with exit code ${rsync.status}: ${rsync.stderr?.trim() || "no stderr"}`,
          );
        }
      }

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

    // only reset the backup timer on success, so that a failed backup is
    // retried on the next run
    await resetBackupTimer(job, stateFilePath);

    return {
      name: job.name,
      type: "directory",
      status: "success",
      sizeBytes: stats.size,
      durationMs: Date.now() - startedAt,
    };
  } catch (e: any) {
    // report the error via bugsink (which triggers ntfy on its end)
    process.exitCode = 1;
    await reportError(e, { job: job.name, backup_type: "directory" });
    return {
      name: job.name,
      type: "directory",
      status: "failed",
      durationMs: Date.now() - startedAt,
      error: e?.message,
    };
  }
}
