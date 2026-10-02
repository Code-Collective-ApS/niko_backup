import { envConfig } from "../config";
import { prettyByteSize } from "../helpers";
import { reportError } from "./errors";

const tenSeconds = 10000;

async function _sendNotification(
  topic: string,
  token: string | undefined,
  title: string,
  body: string,
  priority: number,
  baseUrl: string | undefined,
  clickUrl?: string | undefined,
  emailReceiver?: string | undefined,
) {
  if (!token || !baseUrl) {
    console.warn(
      "Not sending notification due to missing environment variables:",
      {
        token,
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

// TODO: add backup stats to notification
export async function sendSuccessNoti(
  channel: string,
  jobName: string,
  size: number,
) {
  const { ntfy_base_url, ntfy_token } = envConfig();
  return _sendNotification(
    channel,
    ntfy_token,
    `'${jobName}' ok: ${prettyByteSize(size)}`,
    "",
    3,
    ntfy_base_url,
  );
}
