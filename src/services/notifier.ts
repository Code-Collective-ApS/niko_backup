import { envConfig } from "../config";
import { formatDateTime, formatDuration, prettyByteSize } from "../helpers";
import { reportError, scrubSecrets } from "./errors";
import type { JobResult } from "../types";

const tenSeconds = 10000;

export type SummaryRow = JobResult & {
  /** when the job will run again; null means it retries on the next run */
  nextRun?: Date | null;
};

export interface RunSummary {
  startedAt: Date;
  finishedAt: Date;
  rows: SummaryRow[];
}

async function _sendNotification(
  topic: string,
  token: string | undefined,
  title: string,
  body: string,
  priority: number,
  baseUrl: string | undefined,
  markdown = false,
  clickUrl?: string | undefined,
  emailReceiver?: string | undefined,
) {
  if (!token || !baseUrl) {
    console.warn(
      "Not sending notification due to missing environment variables:",
      {
        token: !!token,
        baseUrl,
        title,
        body,
        priority,
        topic,
      },
    );
    return;
  }

  // build basic configuration for the ntfy request
  const icon = "https://codecollective.dk/logo/square_light_128.png";
  const endpoint = baseUrl + "/" + topic;
  const headers: RequestInit["headers"] = {
    Authorization: `Bearer ${token}`,
    "X-Title": title,
    "X-Priority": priority + "",
    "X-Icon": icon,
  };

  // render the body as markdown (e.g. for the mattermost bridge)
  if (markdown) {
    headers["Markdown"] = "yes";
  }

  // add optional headers
  if (clickUrl) {
    headers["X-Click"] = clickUrl;
  }
  if (emailReceiver) {
    headers["X-Email"] = emailReceiver;
  }

  // send request
  try {
    console.info(
      "sending notification:",
      {
        topic,
        title,
        baseUrl,
      },
      "..",
    );
    const res = await fetch(endpoint, {
      method: "POST", // PUT works too
      body: body,
      headers: headers,
      signal: AbortSignal.timeout(tenSeconds),
    });

    // retreive json
    const json: any = await res.json().catch(() => ({}));

    if (res.status !== 200) {
      const error = json?.error || "Unknown error";
      console.error("Received non-ok response from ntfy service", {
        error,
        json,
        status: res.status,
      });
      throw new Error(error);
    }
    console.info("notification sent successfully");

    return json;
  } catch (e) {
    console.error("Error: Unable to send notification!");
    await reportError(e, { stage: "notification", topic });
  }
}

export function buildRunSummaryTitle(summary: RunSummary): string {
  const ok = summary.rows.filter((r) => r.status === "success").length;
  const failed = summary.rows.filter((r) => r.status === "failed").length;
  const skipped = summary.rows.filter((r) => r.status === "skipped").length;
  const verdict = failed > 0 ? "FAILED" : "OK";
  const counts = [
    ok > 0 && `${ok} ok`,
    failed > 0 && `${failed} failed`,
    skipped > 0 && `${skipped} skipped`,
  ]
    .filter(Boolean)
    .join(", ");
  const duration = formatDuration(
    summary.finishedAt.getTime() - summary.startedAt.getTime(),
  );
  return `Backup ${verdict} - ${counts} (${duration})`;
}

function tableCell(text: string): string {
  // pipes and newlines would break the markdown table
  return text.replace(/\|/g, "/").replace(/\n+/g, " ");
}

function firstLine(text: string | undefined): string {
  const line = (text ?? "Unknown error").split("\n")[0].trim();
  return line.length > 100 ? line.slice(0, 97) + "..." : line;
}

export function buildRunSummaryBody(summary: RunSummary): string {
  const lines = [
    `Started: ${formatDateTime(summary.startedAt)}`,
    `Finished: ${formatDateTime(summary.finishedAt)}`,
    "",
    "| Job | Type | Size | Time (s) | Next run |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const row of summary.rows) {
    const type =
      row.status === "success"
        ? tableCell(row.type)
        : row.status === "skipped"
          ? "skipped"
          : `FAILED - ${tableCell(scrubSecrets(firstLine(row.error)))}`;
    const size = row.sizeBytes !== undefined ? prettyByteSize(row.sizeBytes) : "-";
    const time =
      row.durationMs !== undefined ? (row.durationMs / 1000).toFixed(2) : "-";
    const nextRun =
      row.status === "failed"
        ? "retry next run"
        : row.nextRun
          ? formatDateTime(row.nextRun).slice(0, 16)
          : "-";
    lines.push(
      `| ${tableCell(row.name)} | ${type} | ${size} | ${time} | ${nextRun} |`,
    );
  }

  return lines.join("\n");
}

export async function sendRunSummary(topic: string, summary: RunSummary) {
  const { ntfy_base_url, ntfy_token } = envConfig();
  const priority = summary.rows.some((r) => r.status === "failed") ? 4 : 3;
  return _sendNotification(
    topic,
    ntfy_token,
    buildRunSummaryTitle(summary),
    buildRunSummaryBody(summary),
    priority,
    ntfy_base_url,
    true, // markdown
  );
}
