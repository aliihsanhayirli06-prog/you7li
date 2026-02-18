import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getPool, shouldUsePostgres } from "./db.js";

function getDataDir() {
  return process.env.DATA_DIR || "data";
}

function getPublishesFile() {
  return path.join(getDataDir(), "publishes.json");
}

async function ensureFile() {
  const file = getPublishesFile();
  await mkdir(path.dirname(file), { recursive: true });
  try {
    await readFile(file, "utf8");
  } catch {
    await writeFile(file, "[]", "utf8");
  }
}

async function readAllFromFile() {
  await ensureFile();
  const raw = await readFile(getPublishesFile(), "utf8");

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAllToFile(items) {
  await writeFile(getPublishesFile(), JSON.stringify(items, null, 2), "utf8");
}

function normalizeRecord(record) {
  return {
    ...record,
    channelId: record.channelId ?? "ch_default",
    renderStatus: record.renderStatus ?? null,
    videoAssetUrl: record.videoAssetUrl ?? null,
    videoAssetPath: record.videoAssetPath ?? null,
    renderedAt: record.renderedAt ?? null,
    publishedAt: record.publishedAt ?? null,
    youtubeVideoId: record.youtubeVideoId ?? null,
    youtubePublishedAt: record.youtubePublishedAt ?? null,
    youtubeSyncStatus: record.youtubeSyncStatus ?? "pending",
    complianceStatus: record.complianceStatus ?? "pending",
    complianceRiskScore: record.complianceRiskScore ?? 0,
    complianceReport: record.complianceReport ?? null,
    metricsCtr: record.metricsCtr ?? null,
    metricsRetention3s: record.metricsRetention3s ?? null,
    metricsAvgWatchDurationSec: record.metricsAvgWatchDurationSec ?? null,
    metricsCompletionRate: record.metricsCompletionRate ?? null,
    lastAnalyzedAt: record.lastAnalyzedAt ?? null,
    optimizationStatus: record.optimizationStatus ?? "idle",
    optimizationVariants: record.optimizationVariants ?? null,
    optimizationUpdatedAt: record.optimizationUpdatedAt ?? null
  };
}

function mapRow(row) {
  return {
    publishId: row.publish_id,
    channelId: row.channel_id || "ch_default",
    topic: row.topic,
    title: row.title,
    description: row.description,
    status: row.status,
    renderStatus: row.render_status || null,
    videoAssetUrl: row.video_asset_url || null,
    videoAssetPath: row.video_asset_path || null,
    scheduledAt: new Date(row.scheduled_at).toISOString(),
    renderedAt: row.rendered_at ? new Date(row.rendered_at).toISOString() : null,
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
    youtubeVideoId: row.youtube_video_id || null,
    youtubePublishedAt: row.youtube_published_at
      ? new Date(row.youtube_published_at).toISOString()
      : null,
    youtubeSyncStatus: row.youtube_sync_status || "pending",
    complianceStatus: row.compliance_status || "pending",
    complianceRiskScore: Number(row.compliance_risk_score || 0),
    complianceReport: row.compliance_report || null,
    metricsCtr: row.metrics_ctr == null ? null : Number(row.metrics_ctr),
    metricsRetention3s: row.metrics_retention_3s == null ? null : Number(row.metrics_retention_3s),
    metricsAvgWatchDurationSec:
      row.metrics_avg_watch_duration_sec == null
        ? null
        : Number(row.metrics_avg_watch_duration_sec),
    metricsCompletionRate:
      row.metrics_completion_rate == null ? null : Number(row.metrics_completion_rate),
    lastAnalyzedAt: row.last_analyzed_at ? new Date(row.last_analyzed_at).toISOString() : null,
    optimizationStatus: row.optimization_status || "idle",
    optimizationVariants: row.optimization_variants || null,
    optimizationUpdatedAt: row.optimization_updated_at
      ? new Date(row.optimization_updated_at).toISOString()
      : null
  };
}

const BASE_SELECT = `
  SELECT publish_id, channel_id, topic, title, description, status, render_status, video_asset_url, video_asset_path,
         scheduled_at, rendered_at, published_at, youtube_video_id, youtube_published_at, youtube_sync_status,
         compliance_status, compliance_risk_score, compliance_report, metrics_ctr, metrics_retention_3s,
         metrics_avg_watch_duration_sec, metrics_completion_rate, last_analyzed_at, optimization_status,
         optimization_variants, optimization_updated_at
  FROM publishes
`;

export async function readPublishes({ channelIds = null } = {}) {
  if (!shouldUsePostgres()) {
    const items = await readAllFromFile();
    const filtered =
      Array.isArray(channelIds) && channelIds.length
        ? items.filter((item) => channelIds.includes(item.channelId || "ch_default"))
        : items;
    return filtered.slice(-20).reverse();
  }

  try {
    const pool = await getPool();
    const params = [];
    const where = [];
    if (Array.isArray(channelIds) && channelIds.length) {
      params.push(channelIds);
      where.push(`COALESCE(channel_id, 'ch_default') = ANY($${params.length})`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const result = await pool.query(
      `${BASE_SELECT} ${whereSql} ORDER BY created_at DESC LIMIT 20`,
      params
    );
    return result.rows.map(mapRow);
  } catch {
    const items = await readAllFromFile();
    const filtered =
      Array.isArray(channelIds) && channelIds.length
        ? items.filter((item) => channelIds.includes(item.channelId || "ch_default"))
        : items;
    return filtered.slice(-20).reverse();
  }
}

export async function getPublishById(publishId) {
  if (!publishId) {
    throw new Error("PUBLISH_ID_REQUIRED");
  }

  if (!shouldUsePostgres()) {
    const all = await readAllFromFile();
    return all.find((item) => item.publishId === publishId) || null;
  }

  try {
    const pool = await getPool();
    const result = await pool.query(`${BASE_SELECT} WHERE publish_id = $1 LIMIT 1`, [publishId]);
    if (result.rowCount === 0) return null;
    return mapRow(result.rows[0]);
  } catch {
    const all = await readAllFromFile();
    return all.find((item) => item.publishId === publishId) || null;
  }
}

export async function savePublish(record) {
  const normalized = normalizeRecord(record);

  if (!shouldUsePostgres()) {
    const all = await readAllFromFile();
    all.push(normalized);
    await writeAllToFile(all);
    return normalized;
  }

  try {
    const pool = await getPool();
    await pool.query(
      `
      INSERT INTO publishes (
        publish_id, channel_id, topic, title, description, status, render_status, video_asset_url, video_asset_path,
        scheduled_at, rendered_at, published_at, youtube_video_id, youtube_published_at, youtube_sync_status,
        compliance_status, compliance_risk_score, compliance_report, metrics_ctr, metrics_retention_3s,
        metrics_avg_watch_duration_sec, metrics_completion_rate, last_analyzed_at, optimization_status,
        optimization_variants, optimization_updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20,
        $21, $22, $23, $24,
        $25, $26
      )
      `,
      [
        normalized.publishId,
        normalized.channelId,
        normalized.topic,
        normalized.title,
        normalized.description,
        normalized.status,
        normalized.renderStatus,
        normalized.videoAssetUrl,
        normalized.videoAssetPath,
        normalized.scheduledAt,
        normalized.renderedAt,
        normalized.publishedAt,
        normalized.youtubeVideoId,
        normalized.youtubePublishedAt,
        normalized.youtubeSyncStatus,
        normalized.complianceStatus,
        normalized.complianceRiskScore,
        normalized.complianceReport ? JSON.stringify(normalized.complianceReport) : null,
        normalized.metricsCtr,
        normalized.metricsRetention3s,
        normalized.metricsAvgWatchDurationSec,
        normalized.metricsCompletionRate,
        normalized.lastAnalyzedAt,
        normalized.optimizationStatus,
        normalized.optimizationVariants ? JSON.stringify(normalized.optimizationVariants) : null,
        normalized.optimizationUpdatedAt
      ]
    );

    return normalized;
  } catch {
    const all = await readAllFromFile();
    all.push(normalized);
    await writeAllToFile(all);
    return normalized;
  }
}

export async function updatePublishStatus({ publishId, status, publishedAt = null }) {
  if (!publishId || !status) {
    throw new Error("PUBLISH_ID_AND_STATUS_REQUIRED");
  }

  if (!shouldUsePostgres()) {
    const all = await readAllFromFile();
    const idx = all.findIndex((item) => item.publishId === publishId);
    if (idx === -1) return null;

    all[idx] = { ...all[idx], status, publishedAt: publishedAt || all[idx].publishedAt || null };
    await writeAllToFile(all);
    return all[idx];
  }

  try {
    const pool = await getPool();
    const result = await pool.query(
      `
      UPDATE publishes
      SET status = $2,
          published_at = COALESCE($3, published_at),
          updated_at = NOW()
      WHERE publish_id = $1
      RETURNING *
      `,
      [publishId, status, publishedAt]
    );

    if (result.rowCount === 0) return null;
    return mapRow(result.rows[0]);
  } catch {
    const all = await readAllFromFile();
    const idx = all.findIndex((item) => item.publishId === publishId);
    if (idx === -1) return null;

    all[idx] = { ...all[idx], status, publishedAt: publishedAt || all[idx].publishedAt || null };
    await writeAllToFile(all);
    return all[idx];
  }
}

export async function updatePublishRender({
  publishId,
  renderStatus,
  videoAssetUrl = null,
  videoAssetPath = null,
  renderedAt = null
}) {
  if (!publishId || !renderStatus) {
    throw new Error("PUBLISH_ID_AND_RENDER_STATUS_REQUIRED");
  }

  if (!shouldUsePostgres()) {
    const all = await readAllFromFile();
    const idx = all.findIndex((item) => item.publishId === publishId);
    if (idx === -1) return null;

    all[idx] = {
      ...all[idx],
      renderStatus,
      videoAssetUrl: videoAssetUrl || all[idx].videoAssetUrl || null,
      videoAssetPath: videoAssetPath || all[idx].videoAssetPath || null,
      renderedAt: renderedAt || all[idx].renderedAt || null
    };

    await writeAllToFile(all);
    return all[idx];
  }

  try {
    const pool = await getPool();
    const result = await pool.query(
      `
      UPDATE publishes
      SET render_status = $2,
          video_asset_url = COALESCE($3, video_asset_url),
          video_asset_path = COALESCE($4, video_asset_path),
          rendered_at = COALESCE($5, rendered_at),
          updated_at = NOW()
      WHERE publish_id = $1
      RETURNING *
      `,
      [publishId, renderStatus, videoAssetUrl, videoAssetPath, renderedAt]
    );

    if (result.rowCount === 0) return null;
    return mapRow(result.rows[0]);
  } catch {
    const all = await readAllFromFile();
    const idx = all.findIndex((item) => item.publishId === publishId);
    if (idx === -1) return null;

    all[idx] = {
      ...all[idx],
      renderStatus,
      videoAssetUrl: videoAssetUrl || all[idx].videoAssetUrl || null,
      videoAssetPath: videoAssetPath || all[idx].videoAssetPath || null,
      renderedAt: renderedAt || all[idx].renderedAt || null
    };

    await writeAllToFile(all);
    return all[idx];
  }
}

export async function updatePublishYouTube({
  publishId,
  youtubeVideoId,
  youtubePublishedAt,
  youtubeSyncStatus
}) {
  if (!publishId || !youtubeSyncStatus) {
    throw new Error("PUBLISH_ID_AND_YOUTUBE_SYNC_STATUS_REQUIRED");
  }

  if (!shouldUsePostgres()) {
    const all = await readAllFromFile();
    const idx = all.findIndex((item) => item.publishId === publishId);
    if (idx === -1) return null;

    all[idx] = {
      ...all[idx],
      youtubeVideoId: youtubeVideoId || all[idx].youtubeVideoId || null,
      youtubePublishedAt: youtubePublishedAt || all[idx].youtubePublishedAt || null,
      youtubeSyncStatus
    };

    await writeAllToFile(all);
    return all[idx];
  }

  try {
    const pool = await getPool();
    const result = await pool.query(
      `
      UPDATE publishes
      SET youtube_video_id = COALESCE($2, youtube_video_id),
          youtube_published_at = COALESCE($3, youtube_published_at),
          youtube_sync_status = $4,
          updated_at = NOW()
      WHERE publish_id = $1
      RETURNING *
      `,
      [publishId, youtubeVideoId, youtubePublishedAt, youtubeSyncStatus]
    );

    if (result.rowCount === 0) return null;
    return mapRow(result.rows[0]);
  } catch {
    const all = await readAllFromFile();
    const idx = all.findIndex((item) => item.publishId === publishId);
    if (idx === -1) return null;

    all[idx] = {
      ...all[idx],
      youtubeVideoId: youtubeVideoId || all[idx].youtubeVideoId || null,
      youtubePublishedAt: youtubePublishedAt || all[idx].youtubePublishedAt || null,
      youtubeSyncStatus
    };

    await writeAllToFile(all);
    return all[idx];
  }
}

export async function updatePublishCompliance({
  publishId,
  complianceStatus,
  complianceRiskScore,
  complianceReport
}) {
  if (!publishId || !complianceStatus) {
    throw new Error("PUBLISH_ID_AND_COMPLIANCE_STATUS_REQUIRED");
  }

  if (!shouldUsePostgres()) {
    const all = await readAllFromFile();
    const idx = all.findIndex((item) => item.publishId === publishId);
    if (idx === -1) return null;

    all[idx] = { ...all[idx], complianceStatus, complianceRiskScore, complianceReport };
    await writeAllToFile(all);
    return all[idx];
  }

  try {
    const pool = await getPool();
    const result = await pool.query(
      `
      UPDATE publishes
      SET compliance_status = $2,
          compliance_risk_score = $3,
          compliance_report = $4,
          updated_at = NOW()
      WHERE publish_id = $1
      RETURNING *
      `,
      [publishId, complianceStatus, complianceRiskScore, JSON.stringify(complianceReport)]
    );

    if (result.rowCount === 0) return null;
    return mapRow(result.rows[0]);
  } catch {
    const all = await readAllFromFile();
    const idx = all.findIndex((item) => item.publishId === publishId);
    if (idx === -1) return null;

    all[idx] = { ...all[idx], complianceStatus, complianceRiskScore, complianceReport };
    await writeAllToFile(all);
    return all[idx];
  }
}

export async function updatePublishAnalytics({
  publishId,
  metricsCtr,
  metricsRetention3s,
  metricsAvgWatchDurationSec,
  metricsCompletionRate,
  lastAnalyzedAt
}) {
  if (!publishId) {
    throw new Error("PUBLISH_ID_REQUIRED");
  }

  if (!shouldUsePostgres()) {
    const all = await readAllFromFile();
    const idx = all.findIndex((item) => item.publishId === publishId);
    if (idx === -1) return null;

    all[idx] = {
      ...all[idx],
      metricsCtr,
      metricsRetention3s,
      metricsAvgWatchDurationSec,
      metricsCompletionRate,
      lastAnalyzedAt
    };

    await writeAllToFile(all);
    return all[idx];
  }

  try {
    const pool = await getPool();
    const result = await pool.query(
      `
      UPDATE publishes
      SET metrics_ctr = $2,
          metrics_retention_3s = $3,
          metrics_avg_watch_duration_sec = $4,
          metrics_completion_rate = $5,
          last_analyzed_at = $6,
          updated_at = NOW()
      WHERE publish_id = $1
      RETURNING *
      `,
      [
        publishId,
        metricsCtr,
        metricsRetention3s,
        metricsAvgWatchDurationSec,
        metricsCompletionRate,
        lastAnalyzedAt
      ]
    );

    if (result.rowCount === 0) return null;
    return mapRow(result.rows[0]);
  } catch {
    const all = await readAllFromFile();
    const idx = all.findIndex((item) => item.publishId === publishId);
    if (idx === -1) return null;

    all[idx] = {
      ...all[idx],
      metricsCtr,
      metricsRetention3s,
      metricsAvgWatchDurationSec,
      metricsCompletionRate,
      lastAnalyzedAt
    };

    await writeAllToFile(all);
    return all[idx];
  }
}

export async function updatePublishOptimization({
  publishId,
  optimizationStatus,
  optimizationVariants,
  optimizationUpdatedAt
}) {
  if (!publishId || !optimizationStatus) {
    throw new Error("PUBLISH_ID_AND_OPTIMIZATION_STATUS_REQUIRED");
  }

  if (!shouldUsePostgres()) {
    const all = await readAllFromFile();
    const idx = all.findIndex((item) => item.publishId === publishId);
    if (idx === -1) return null;

    all[idx] = {
      ...all[idx],
      optimizationStatus,
      optimizationVariants: optimizationVariants || all[idx].optimizationVariants || null,
      optimizationUpdatedAt
    };

    await writeAllToFile(all);
    return all[idx];
  }

  try {
    const pool = await getPool();
    const result = await pool.query(
      `
      UPDATE publishes
      SET optimization_status = $2,
          optimization_variants = COALESCE($3, optimization_variants),
          optimization_updated_at = $4,
          updated_at = NOW()
      WHERE publish_id = $1
      RETURNING *
      `,
      [
        publishId,
        optimizationStatus,
        optimizationVariants ? JSON.stringify(optimizationVariants) : null,
        optimizationUpdatedAt
      ]
    );

    if (result.rowCount === 0) return null;
    return mapRow(result.rows[0]);
  } catch {
    const all = await readAllFromFile();
    const idx = all.findIndex((item) => item.publishId === publishId);
    if (idx === -1) return null;

    all[idx] = {
      ...all[idx],
      optimizationStatus,
      optimizationVariants: optimizationVariants || all[idx].optimizationVariants || null,
      optimizationUpdatedAt
    };

    await writeAllToFile(all);
    return all[idx];
  }
}
