// Minimal Sentry-compatible error reporting (e.g. Bugsink) without an SDK
// dependency. Posts events to the /api/<project_id>/store/ ingestion endpoint.
import { randomUUID } from "node:crypto";

const tenSeconds = 10000;

type Dsn = { url: string; publicKey: string };

function parseDsn(raw: string): Dsn | null {
  // Sentry DSN format: https://<publicKey>@<host>/<projectId>
  const match = raw.match(/^https?:\/\/([^@/]+)@([^/]+)\/([^/]+)\/?$/);
  if (!match) return null;
  const [, publicKey, host, projectId] = match;
  const scheme = raw.startsWith("http://") ? "http" : "https";
  return {
    url: `${scheme}://${host}/api/${projectId}/store/`,
    publicKey,
  };
}

let cachedRaw: string | undefined;
let cachedDsn: Dsn | null | undefined;

function dsn(): Dsn | null {
  const raw = process.env.SENTRY_DSN;
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedDsn = raw ? parseDsn(raw) : null;
  }
  return cachedDsn ?? null;
}

function scrubSecrets(text: string): string {
  // postgres connection URIs contain passwords: keep them out of error reports
  return text.replace(/(postgres(?:ql)?:\/\/)[^\s@/]+@/g, "$1***@");
}

export async function reportError(
  err: unknown,
  context: Record<string, unknown> = {},
): Promise<void> {
  const error = err instanceof Error ? err : new Error(String(err));
  console.error(error);

  const target = dsn();
  if (!target) {
    console.warn(
      "Not reporting error to bugsink: no valid SENTRY_DSN set in environment",
    );
    return;
  }

  const event = {
    event_id: randomUUID().replace(/-/g, ""),
    timestamp: new Date().toISOString(),
    platform: "node",
    level: "error",
    logger: "niko_backup",
    exception: {
      values: [
        {
          type: error.name,
          value: scrubSecrets(error.message),
          stacktrace: error.stack ? { raw: scrubSecrets(error.stack) } : undefined,
        },
      ],
    },
    extra: context,
  };

  try {
    const res = await fetch(target.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${target.publicKey}, sentry_client=niko_backup/0.1`,
      },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(tenSeconds),
    });
    if (!res.ok) {
      console.error("bugsink returned non-ok status:", res.status);
    }
  } catch (e) {
    console.error("Unable to report error to bugsink:", e);
  }
}
