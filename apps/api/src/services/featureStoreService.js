import { listPublishes } from "./publishService.js";
import { getChannelsByTenant } from "./channelService.js";
import { getUsageReport } from "./billingService.js";

function avg(values) {
  if (!values.length) return 0;
  const sum = values.reduce((acc, item) => acc + Number(item || 0), 0);
  return Number((sum / values.length).toFixed(4));
}

export async function getFeatureStoreSnapshot(tenantId) {
  const channels = await getChannelsByTenant(tenantId);
  const channelIds = new Set(channels.map((item) => item.channelId));
  const publishes = (await listPublishes()).filter((item) => channelIds.has(item.channelId));
  const usage = await getUsageReport({
    tenantId,
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    to: new Date().toISOString(),
    limit: 5000
  });

  const byChannel = channels.map((channel) => {
    const items = publishes.filter((item) => item.channelId === channel.channelId);
    const ctrValues = items.filter((item) => item.metricsCtr != null).map((item) => item.metricsCtr);
    return {
      channelId: channel.channelId,
      channelName: channel.name,
      publishCount: items.length,
      publishedCount: items.filter((item) => item.status === "published").length,
      avgCtr: avg(ctrValues),
      avgRetention3s: avg(
        items.filter((item) => item.metricsRetention3s != null).map((item) => item.metricsRetention3s)
      )
    };
  });

  const byContentSegment = [
    {
      segment: "high_ctr",
      threshold: 0.05,
      publishCount: publishes.filter((item) => Number(item.metricsCtr || 0) >= 0.05).length
    },
    {
      segment: "medium_ctr",
      threshold: "0.03-0.05",
      publishCount: publishes.filter((item) => {
        const ctr = Number(item.metricsCtr || 0);
        return ctr >= 0.03 && ctr < 0.05;
      }).length
    },
    {
      segment: "low_ctr",
      threshold: "<0.03",
      publishCount: publishes.filter((item) => Number(item.metricsCtr || 0) < 0.03).length
    }
  ];

  const byStatus = {};
  for (const item of publishes) {
    const key = item.status || "unknown";
    byStatus[key] = Number(byStatus[key] || 0) + 1;
  }

  return {
    tenantId,
    generatedAt: new Date().toISOString(),
    summary: {
      channels: channels.length,
      publishes: publishes.length,
      meteredEvents30d: usage.summary.eventCount
    },
    segments: {
      byChannel,
      byContentSegment,
      byStatus
    }
  };
}
