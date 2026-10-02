import { type BackupJob, config } from "../config";
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

export async function resetBackupTimer(
  job: BackupJob,
  stateFilePath: string,
) {
  const name = job.name;
  const now = new Date();

  await ensureStateFileExists(stateFilePath);
  await updateStateFile(stateFilePath, name, now);
}

async function ensureStateFileExists(stateFilePath: string) {
  if (!existsSync(stateFilePath)) {
    console.info('> creating new state file...')
    await createStateFile(stateFilePath);
  }
}

export async function isTimeForBackup(path: string, job: BackupJob): Promise<boolean> {
  if (job.force_run) return true;
  const now = new Date();
  await ensureStateFileExists(path);
  const fileContent = await readFile(path, 'utf8');
  const currentState = JSON.parse(fileContent);
  if (!Object.keys(currentState).includes(job.name)) {
    return true;
  } else {

    const lastBackup = new Date(currentState[job.name]);
    if (isNaN(lastBackup.getTime())) {
      throw new Error('Could not read date from state. State is corrupted.')
    }

    const targetDate = new Date(lastBackup.getTime());
    targetDate.setDate(lastBackup.getDate() + job.interval_days);
    const result = now.getTime() > targetDate.getTime();
    return result;
  }
}

/** When the job last ran successfully, or null if it never did. */
export async function getLastSuccessDate(path: string, job: BackupJob): Promise<Date | null> {
  await ensureStateFileExists(path);
  const fileContent = await readFile(path, 'utf8');
  const currentState = JSON.parse(fileContent);
  const value = currentState[job.name];
  if (!value) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new Error('Could not read date from state. State is corrupted.');
  }
  return date;
}

async function createStateFile(path: string) {
  await writeFile(path, '{}');
}

async function updateStateFile(path: string, name: string, date: Date) {
  // overwrite value for key with `name`. Set value to parsed date
  await ensureStateFileExists(path);
  const fileContent = await readFile(path, 'utf8');
  const currentState = JSON.parse(fileContent);
  currentState[name] = date.toISOString();
  await writeFile(path, JSON.stringify(currentState, null, 2));
}
