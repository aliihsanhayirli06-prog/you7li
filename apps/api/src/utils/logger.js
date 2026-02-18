function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ error: "log_serialize_failed" });
  }
}

export function log(level, message, fields = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...fields
  };

  const line = safeStringify(payload);

  if (level === "error") {
    console.error(line);
    return;
  }

  console.log(line);
}
