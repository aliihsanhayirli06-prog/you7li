function normalizeText(value) {
  return String(value || "").trim();
}

function toKeywords(topic, script = "", max = 8) {
  const full = `${topic} ${script}`.toLowerCase();
  const tokens = full
    .replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ\s]/gi, " ")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => item.length >= 3);

  const stopwords = new Set([
    "ve",
    "ile",
    "icin",
    "ama",
    "gibi",
    "daha",
    "this",
    "that",
    "the",
    "for",
    "you",
    "bir",
    "video"
  ]);

  const freq = new Map();
  for (const token of tokens) {
    if (stopwords.has(token)) continue;
    freq.set(token, (freq.get(token) || 0) + 1);
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([token]) => token)
    .slice(0, max);
}

function capitalize(value) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function formatHashtag(value) {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ]+/gi, "")
    .trim();
  if (!slug) return null;
  return `#${slug}`;
}

function normalizeFormat(format) {
  const normalized = String(format || "shorts").toLowerCase();
  if (normalized === "reels" || normalized === "tiktok" || normalized === "youtube") return normalized;
  return "shorts";
}

export function generateSeoMetadata({ topic, script = "", format = "shorts", language = "tr" }) {
  const normalizedTopic = normalizeText(topic);
  if (!normalizedTopic) {
    throw new Error("TOPIC_REQUIRED");
  }

  const normalizedFormat = normalizeFormat(format);
  const keywords = toKeywords(normalizedTopic, script);
  const shortTopic = normalizedTopic.length > 68 ? `${normalizedTopic.slice(0, 65).trim()}...` : normalizedTopic;

  const primaryKeyword = keywords[0] || shortTopic.toLowerCase();
  const secondaryKeyword = keywords[1] || "youtube";
  const formatSuffix =
    normalizedFormat === "youtube" ? "Uzun Video Rehberi" : `${capitalize(normalizedFormat)} Stratejisi`;

  const titleOptions = unique([
    `${shortTopic}: 3 Adimda Uygulanabilir Plan`,
    `${shortTopic} | ${formatSuffix}`,
    `${capitalize(primaryKeyword)} ve ${capitalize(secondaryKeyword)} ile Hızlı Büyüme`
  ]);
  const title = titleOptions[0];

  const hashtags = unique(
    ["youtube", normalizedFormat, ...keywords.slice(0, 3)].map((item) => formatHashtag(item))
  ).slice(0, 6);

  const descriptionLines = [
    `${shortTopic} konusunda uygulanabilir bir yol haritasi.`,
    `Odak anahtar kelimeler: ${keywords.slice(0, 5).join(", ") || primaryKeyword}.`,
    "Icerikte performans ve compliance odakli aksiyon adimlari yer alir.",
    hashtags.join(" ")
  ];

  return {
    topic: normalizedTopic,
    language,
    format: normalizedFormat,
    title,
    titleOptions,
    description: descriptionLines.join("\n"),
    keywords,
    hashtags,
    generatedAt: new Date().toISOString()
  };
}
