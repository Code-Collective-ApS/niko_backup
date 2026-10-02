import type { BackupJob, BackupConfig } from "../config";
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { extractDateFromFileName } from "../helpers";

export async function deleteOldFiles(config: BackupConfig) {
  const backupFiles = await fs.readdir(config.output_dir);

  for (const backup of config.backups) {
    const relatedBackupFiles = getRelatedBackupFiles(backup, backupFiles);
    if (relatedBackupFiles.length > backup.max_backups) {
      const backupsToDelete = relatedBackupFiles.slice(backup.max_backups);
      await deleteFiles(config.output_dir, backupsToDelete);
    }
  }
}

function getRelatedBackupFiles(backup: BackupJob, paths: string[]) {
  // only prune files this tool created (they must have a date in the name);
  // undated files never count towards max_backups and are never deleted
  const relatedBackupFiles = paths.filter(
    (p) =>
      p.startsWith(backup.name + ".") && extractDateFromFileName(p) !== null,
  );
  if (relatedBackupFiles.length === 0) {
    return [];
  } else {
    relatedBackupFiles.sort((a, b) => {
      const dateA = extractDateFromFileName(a)!;
      const dateB = extractDateFromFileName(b)!;
      return dateA.getTime() < dateB.getTime() ? 1 : -1;
    });

    return relatedBackupFiles;
  }
}

async function deleteFiles(dir: string, paths: string[]) {
  console.log('deleting files:', paths, 'dir:', dir);
  await Promise.all(paths.map(p => fs.unlink(path.join(dir, p))));
}
