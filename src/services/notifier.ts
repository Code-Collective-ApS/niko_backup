import { envConfig, type BackupJob } from "../config";

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
    });

    // retreive json
    const json: any = await res.json();

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

    // TODO: validate response and returned typed object
    return json;
  } catch (e) {
    console.error("Error: Unable to send notification!");
    console.log(e);
    // TODO: report error !!!!!!!!! this is important
  }
}

export async function sendBackupErrNoti(
  channel: string,
  jobName: string,
  errMsg: string,
) {
  const { nfty_base_url, nfty_token } = envConfig();
  return _sendNotification(
    channel,
    nfty_token,
    `'${jobName}' bckp err`,
    errMsg,
    4,
    nfty_base_url,
  );
}

// TODO: add backup stats to notification
export async function sendSuccessNoti(channel: string, jobName: string) {
  const { nfty_base_url, nfty_token } = envConfig();
  return _sendNotification(
    channel,
    nfty_token,
    `'${jobName}' success`,
    "",
    3,
    nfty_base_url,
  );
}

export async function parseAndNotify(
  job: BackupJob,
  errorChannel: string,
  e: Error | any,
) {
  const fullMsg = e?.message.trim() || "Unknown error";
  const psqlErr: string | undefined = fullMsg.split("\n")?.[1];
  const errToReport = psqlErr || fullMsg;
  return sendBackupErrNoti(errorChannel, job.name, errToReport);
}
