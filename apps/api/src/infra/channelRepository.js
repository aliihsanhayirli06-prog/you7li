import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getPool, shouldUsePostgres } from "./db.js";

function getDataDir() {
  return process.env.DATA_DIR || "data";
}

function getChannelsFile() {
  return path.join(getDataDir(), "channels.json");
}
const DEFAULT_CHANNEL = {
  channelId: "ch_default",
  tenantId: "t_default",
  name: "Default Channel",
  youtubeChannelId: null,
  defaultLanguage: "tr"
};

async function ensureFile() {
  const file = getChannelsFile();
  await mkdir(path.dirname(file), { recursive: true });
  try {
    await readFile(file, "utf8");
  } catch {
    await writeFile(file, JSON.stringify([DEFAULT_CHANNEL], null, 2), "utf8");
  }
}

async function readFromFile() {
  await ensureFile();
  const raw = await readFile(getChannelsFile(), "utf8");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [DEFAULT_CHANNEL];
  } catch {
    return [DEFAULT_CHANNEL];
  }
}

async function writeToFile(items) {
  await writeFile(getChannelsFile(), JSON.stringify(items, null, 2), "utf8");
}

function mapRow(row) {
  return {
    channelId: row.channel_id,
    tenantId: row.tenant_id || "t_default",
    name: row.name,
    youtubeChannelId: row.youtube_channel_id,
    defaultLanguage: row.default_language || "tr"
  };
}

export async function ensureDefaultChannel(tenantId = "t_default") {
  const payload = {
    ...DEFAULT_CHANNEL,
    tenantId,
    channelId: tenantId === "t_default" ? "ch_default" : `ch_${tenantId}_default`
  };

  if (!shouldUsePostgres()) {
    const channels = await readFromFile();
    if (channels.some((item) => item.channelId === payload.channelId)) {
      return payload;
    }
    channels.unshift(payload);
    await writeToFile(channels);
    return payload;
  }

  const pool = await getPool();
  await pool.query(
    `
    INSERT INTO channels (channel_id, tenant_id, name, youtube_channel_id, default_language)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (channel_id) DO NOTHING
    `,
    [
      payload.channelId,
      payload.tenantId,
      payload.name,
      payload.youtubeChannelId,
      payload.defaultLanguage
    ]
  );

  return payload;
}

export async function listChannels(tenantId = "t_default") {
  await ensureDefaultChannel(tenantId);

  if (!shouldUsePostgres()) {
    const channels = await readFromFile();
    return channels.filter((item) => (item.tenantId || "t_default") === tenantId);
  }

  const pool = await getPool();
  const result = await pool.query(
    `
    SELECT channel_id, tenant_id, name, youtube_channel_id, default_language
    FROM channels
    WHERE COALESCE(tenant_id, 't_default') = $1
    ORDER BY created_at ASC
    `,
    [tenantId]
  );

  return result.rows.map(mapRow);
}

export async function getChannelById(channelId, tenantId = null) {
  if (!channelId) return null;
  if (tenantId) await ensureDefaultChannel(tenantId);

  if (!shouldUsePostgres()) {
    const channels = await readFromFile();
    return (
      channels.find(
        (item) =>
          item.channelId === channelId &&
          (!tenantId || (item.tenantId || "t_default") === String(tenantId))
      ) || null
    );
  }

  const pool = await getPool();
  const params = [channelId];
  let whereSql = "channel_id = $1";
  if (tenantId) {
    params.push(tenantId);
    whereSql += ` AND COALESCE(tenant_id, 't_default') = $${params.length}`;
  }
  const result = await pool.query(
    `
    SELECT channel_id, tenant_id, name, youtube_channel_id, default_language
    FROM channels
    WHERE ${whereSql}
    LIMIT 1
    `,
    params
  );

  if (result.rowCount === 0) return null;
  return mapRow(result.rows[0]);
}

export async function createChannel({
  channelId,
  tenantId = "t_default",
  name,
  youtubeChannelId = null,
  defaultLanguage = "tr"
}) {
  if (!channelId || !name) {
    throw new Error("CHANNEL_ID_AND_NAME_REQUIRED");
  }

  await ensureDefaultChannel(tenantId);

  const payload = {
    channelId,
    tenantId,
    name,
    youtubeChannelId,
    defaultLanguage
  };

  if (!shouldUsePostgres()) {
    const channels = await readFromFile();
    if (
      channels.some(
        (item) =>
          item.channelId === channelId &&
          (item.tenantId || "t_default") === (tenantId || "t_default")
      )
    ) {
      throw new Error("CHANNEL_ALREADY_EXISTS");
    }
    channels.push(payload);
    await writeToFile(channels);
    return payload;
  }

  const pool = await getPool();
  try {
    await pool.query(
      `
      INSERT INTO channels (channel_id, tenant_id, name, youtube_channel_id, default_language)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [
        payload.channelId,
        payload.tenantId,
        payload.name,
        payload.youtubeChannelId,
        payload.defaultLanguage
      ]
    );
  } catch (error) {
    if (
      String(error.message || "")
        .toLowerCase()
        .includes("duplicate")
    ) {
      throw new Error("CHANNEL_ALREADY_EXISTS");
    }
    throw error;
  }

  return payload;
}
