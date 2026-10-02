export function getFileNameFriendlyDate(d = new Date()) {
  return d
    .toISOString()
    .split("T")
    .map((s) => s.replace(/:/g, "_"))
    .join("T")
    .split(".")[0];
}

export function formatDateTime(d = new Date()): string {
  // UTC, format: YYYY-MM-DD HH:mm:ss
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function extractDateFromFileName(filename: string): Date | null {
  const regex = /\d{4}-\d{2}-\d{2}T\d{2}_\d{2}_\d{2}/;
  const match = filename.match(regex);
  if (match) {
    const rawDate = match[0].replace(/_/g, ":");
    const result = new Date(rawDate);
    return result;
  } else {
    return null;
  }
}

export function prettyByteSize(bytes: number, decimals = 1) {
  if (typeof bytes !== "number" || isNaN(bytes)) {
    return "-";
  }
  let lvl = 0;
  const getDivisor = (_lvl: number) => Math.pow(1024, _lvl);
  const lvlStrings = ["bytes", "kb", "Mb", "Gb", "Tb"];
  if (bytes > getDivisor(4)) {
    lvl = 4;
  } else if (bytes > getDivisor(3)) {
    lvl = 3;
  } else if (bytes > getDivisor(2)) {
    lvl = 2;
  } else if (bytes > getDivisor(1)) {
    lvl = 1;
  }
  const lvlStr = lvlStrings[lvl];
  const tenPowDecimals = Math.pow(10, decimals - 1);
  const num = bytes / getDivisor(lvl);
  const prettyNum = Math.round(tenPowDecimals * num) / tenPowDecimals;
  return `${prettyNum.toFixed(decimals)} ${lvlStr}`;
}
