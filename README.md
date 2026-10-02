# Backup tool

Simple backup system that makes it easy to make cyclic backups from simple postgres and s3 endpoints.

Run the program every night and the backups will be made according to the `config.json` file.

### How to run

First, you build the node.js compatible file with:

```bash
yarn build
```

Now you can run the program using `node`:

```bash
node build/main.js
```

### Environment variables

Copy `.env.example` to `.env` and fill in the values (or set them in your systemd unit / cron):

- `NTFY_TOKEN` - token for the ntfy instance used for success notifications (required for notifications)
- `NTFY_BASE_URL` - base url of the ntfy instance, e.g. `https://ntfy.example.com`
- `SENTRY_DSN` - DSN of a Sentry-compatible server (e.g. [Bugsink](https://bugsink.com)). All backup errors are reported here, so a missing or malformed DSN means errors are only visible in the logs. Format: `https://<publicKey>@<host>/<projectId>`

### Requirements

- Node.js 18+ (uses `fetch`)
- `bash` at `/bin/bash` (the dump pipelines use `pipefail`, which `dash` does not support)
- PostgreSQL client tools (`pg_dump`, `psql`) - paths can be overridden per job in the config
- MinIO client (`mc`) for `s3` backups
- `rclone` for the second location backup
- `openssl` for encrypted backups

### Configuration

See `config.example.json` for a full example. Top-level options:

| Option            | Description                                                               |
| ----------------- | ------------------------------------------------------------------------- |
| `output_dir`      | Directory backup files are written to (also used for pruning old backups) |
| `state_file_path` | JSON file that tracks when each job last ran successfully                 |
| `ntfy_topic`     | Topic that receives the single per-run summary notification (optional)    |
| `second_location` | `rclone` remote target backups are additionally copied to                 |

Per-job options:

| Option                    | Description                                                                    |
| ------------------------- | ------------------------------------------------------------------------------ |
| `name`                    | Unique job name, used as prefix for the backup file names                      |
| `type`                    | `postgres` or `s3`                                                             |
| `target`                  | Postgres connection URI (`postgres://user:pass@host/db`) or MinIO alias/bucket |
| `interval_days`           | Days between runs of this job                                                  |
| `max_backups`             | Number of backup files to keep in `output_dir` (oldest are pruned)             |
| `encrypt`                 | Encrypt the backup with `openssl` (aes256)                                     |
| `encrypt_pass`            | Password used for encryption (required when `encrypt` is true)                 |
| `pg_dump` / `psql`        | Optional paths to the binaries (default: from `PATH`)                          |
| `disable_second_location` | Skip copying this backup to the second location (optional)                     |
| `s3_newer_than`           | Only mirror files newer than this, e.g. `168h` (required for `s3`)             |
| `s3_download_limit`       | Download limit passed to `mc mirror`, e.g. `500Mi` (required for `s3`)         |
| `force_run`               | Run the job regardless of interval (optional)                                  |

### Behavior notes

- A failed backup job is retried on the next run: the state file is only updated on success.
- If any job fails, the process exits with a non-zero exit code, so a systemd unit will show as failed.
- Errors are reported to the `SENTRY_DSN` endpoint. ntfy receives a single summary notification per run (a markdown table with each job's result, size, execution time and next run), sent to the top-level `ntfy_topic`. If every job was skipped, no notification is sent.

### Decrypt openssl password encryption:

s3 backups:

```bash
openssl enc -d -aes256 -pass pass:abc123 -in output/encrypted_backup.enc | tar xvf - --directory=output
```

postgres backups:

```bash
openssl enc -d -aes256 -pass pass:abc123 -in output/encrypted_backup.enc | gunzip > output/decrypted_backup
```

Unencrypted backups skip the openssl step:

s3 backups:

```bash
tar xvf output/backup.tar.gz --directory=output
```

postgres backups:

```bash
gunzip -c output/backup.gz > output/backup.sql
```
