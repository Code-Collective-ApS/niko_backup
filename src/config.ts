import * as yup from "yup";
import * as rawConfig from "../config.json";
import "dotenv/config";

const backupSchema = yup.object({
  name: yup.string().required().default("Unknown"),
  force_run: yup.boolean().optional(),
  encrypt: yup.boolean().required().default(false),
  interval_days: yup
    .number()
    .required()
    .min(1, "'interval_days' needs to be at least 1 day"),
  max_backups: yup
    .number()
    .required()
    .min(0, "'max_backups' cannot be negative"),
  type: yup
    .string()
    .oneOf(["postgres", "s3"] as const)
    .required(),
  pg_dump: yup.string().optional(),
  psql: yup.string().optional(),
  target: yup
    .string()
    .required()
    .test("len", "'target' cannot be empty", (val) => !!val),
  encrypt_pass: yup.string().optional(),
  disable_second_location: yup.boolean().optional(),
  s3_newer_than: yup.string().optional(),
  s3_download_limit: yup.string().optional(),
  ntfy_topic: yup.string().optional(),
});

const envConfigSchema = yup.object({
  ntfy_token: yup.string().optional(),
  ntfy_base_url: yup.string().optional(),
});

const configSchema = yup
  .object({
    output_dir: yup.string().required(),
    state_file_path: yup.string().required(),
    second_location: yup
      .object({
        type: yup
          .string()
          .oneOf(["rclone"] as const)
          .required(),
        target: yup
          .string()
          .required()
          .test("len", "second_location.target cannot be empty", (v) => !!v),
      })
      .required(),
    backups: yup
      .array(backupSchema)
      .min(1, "You need at least one backup in your config")
      .required(),
  })
  .strict();

export type BackupJob = yup.InferType<typeof backupSchema>;
export type BackupConfig = yup.InferType<typeof configSchema>;
export type EnvConfig = yup.InferType<typeof envConfigSchema>;

export function validateBackupConfig(parsed: BackupJob): void {
  if (parsed.type === "postgres") {
    if (!parsed.target.startsWith("postgres://")) {
      throw new Error("Postgres URI did not start with 'postgres://'");
    }
  } else if (parsed.type === "s3") {
    // TODO: validate minio string
    if (!parsed.s3_newer_than || !parsed.s3_download_limit) {
      throw new Error(
        "'s3_newer_than' or 's3_limit_download' was not defined in config",
      );
    }
  }

  if (parsed.encrypt && !parsed.encrypt_pass) {
    throw new Error(
      "Backup config is missing \`encrypt_pass' or 'encrypted' needs to be false",
    );
  }
}

export function config(): BackupConfig {
  const parsedConfig = configSchema.validateSync(rawConfig);
  parsedConfig.backups.forEach((b) => validateBackupConfig(b));
  return parsedConfig;
}

export function envConfig(): EnvConfig {
  const parsedEnvConfig = envConfigSchema.validateSync({
    ntfy_token: process.env.NTFY_TOKEN,
    ntfy_base_url: process.env.NTFY_BASE_URL,
  });
  // never log the tokens themselves
  console.log("environment config:", {
    ntfy_base_url: parsedEnvConfig.ntfy_base_url || "(unset)",
    has_ntfy_token: !!parsedEnvConfig.ntfy_token,
  });
  return parsedEnvConfig;
}
