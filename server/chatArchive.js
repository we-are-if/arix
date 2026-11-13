import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

// Chat messages live inside the single application state blob, so an unbounded
// history slows every read and write of the whole app. Overflow moves to monthly
// proof-friendly JSONL files on disk instead of growing the blob forever.
export const CHAT_ARCHIVE_DEFAULTS = { maxPerChannel: 3000, maxTotal: 8000 };

export function chatArchiveLimits(env = process.env) {
  const read = (key, fallback) => {
    const value = Number(env[key]);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
  };
  return {
    maxPerChannel: read("ARIX_CHAT_ARCHIVE_PER_CHANNEL", CHAT_ARCHIVE_DEFAULTS.maxPerChannel),
    maxTotal: read("ARIX_CHAT_ARCHIVE_TOTAL", CHAT_ARCHIVE_DEFAULTS.maxTotal),
  };
}

export function selectChatArchive(messages, { maxPerChannel, maxTotal }) {
  const list = Array.isArray(messages) ? messages : [];
  const ordered = [...list].sort((a, b) => String(a?.createdAt || "").localeCompare(String(b?.createdAt || "")));

  const channelSizes = new Map();
  for (const message of ordered) {
    const key = String(message?.channelId || "");
    channelSizes.set(key, (channelSizes.get(key) || 0) + 1);
  }

  const archived = new Set();
  const seen = new Map();
  const perChannelCap = Math.max(1, Number(maxPerChannel) || CHAT_ARCHIVE_DEFAULTS.maxPerChannel);
  for (const message of ordered) {
    const key = String(message?.channelId || "");
    const index = (seen.get(key) || 0) + 1;
    seen.set(key, index);
    if (index <= (channelSizes.get(key) || 0) - perChannelCap) archived.add(message);
  }

  const totalCap = Math.max(1, Number(maxTotal) || CHAT_ARCHIVE_DEFAULTS.maxTotal);
  let remaining = list.length - archived.size;
  for (const message of ordered) {
    if (remaining <= totalCap) break;
    if (archived.has(message)) continue;
    archived.add(message);
    remaining -= 1;
  }

  const archive = [];
  const keep = [];
  for (const message of list) (archived.has(message) ? archive : keep).push(message);
  return { archive, keep };
}

export async function appendChatArchive(dir, messages) {
  const items = Array.isArray(messages) ? messages : [];
  if (!items.length) return 0;
  await mkdir(dir, { recursive: true });
  const groups = new Map();
  for (const message of items) {
    const channel = String(message?.channelId || "unknown").replace(/[^a-zA-Z0-9_.-]/g, "_");
    if (!groups.has(channel)) groups.set(channel, []);
    groups.get(channel).push(message);
  }
  let written = 0;
  for (const [channel, rows] of groups) {
    await appendFile(join(dir, `${channel}.jsonl`), rows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
    written += rows.length;
  }
  return written;
}
