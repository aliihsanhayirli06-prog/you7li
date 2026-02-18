const API_BASE = "https://www.googleapis.com/youtube/v3";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

async function fetchJson(url, timeoutMs = 3000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP_${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function getYouTubeSignals(topic) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return null;
  }

  const q = encodeURIComponent(topic);
  const searchUrl = `${API_BASE}/search?part=snippet&type=video&maxResults=5&order=viewCount&q=${q}&key=${apiKey}`;

  try {
    const search = await fetchJson(searchUrl);
    const items = Array.isArray(search.items) ? search.items : [];
    const videoIds = items.map((item) => item.id?.videoId).filter(Boolean);

    if (videoIds.length === 0) {
      return {
        source: "youtube-api",
        trendScore: 0.4,
        competitionLevel: 0.4,
        sampleCount: 0
      };
    }

    const ids = encodeURIComponent(videoIds.join(","));
    const statsUrl = `${API_BASE}/videos?part=statistics&id=${ids}&key=${apiKey}`;
    const statsData = await fetchJson(statsUrl);
    const statsItems = Array.isArray(statsData.items) ? statsData.items : [];

    const views = statsItems
      .map((item) => Number(item.statistics?.viewCount || 0))
      .filter((count) => Number.isFinite(count));

    const avgViews = views.length ? views.reduce((sum, count) => sum + count, 0) / views.length : 0;

    const trendScore = clamp(Math.log10(avgViews + 10) / 7, 0.2, 1);
    const competitionLevel = clamp(Math.log10(avgViews + 10) / 8, 0.2, 1);

    return {
      source: "youtube-api",
      trendScore: Number(trendScore.toFixed(2)),
      competitionLevel: Number(competitionLevel.toFixed(2)),
      sampleCount: views.length
    };
  } catch {
    return {
      source: "youtube-api-fallback",
      trendScore: 0.45,
      competitionLevel: 0.45,
      sampleCount: 0
    };
  }
}
