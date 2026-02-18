async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return res.json();
}

function setText(id, value, klass = "") {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
  el.className = `v ${klass}`.trim();
}

async function loadStatus() {
  try {
    const status = await fetchJson("/api/v1/ops/status");
    const isOk = status.status === "operational";
    setText("status", status.status, isOk ? "ok" : "warn");
    setText("queue", `${status.queueSize} / ${status.dlqSize}`);
    setText("error-rate", String(status.errorRate));
    setText("http-p95", `${status.httpP95Ms} ms`);
    setText(
      "deploy",
      JSON.stringify(
        {
          deployMarker: status.deployMarker,
          deployedAt: status.deployedAt,
          generatedAt: status.generatedAt
        },
        null,
        2
      )
    );
  } catch (error) {
    setText("status", `unavailable (${error.message})`, "warn");
    setText("queue", "-");
    setText("error-rate", "-");
    setText("http-p95", "-");
    setText("deploy", "status endpoint unavailable");
  }
}

loadStatus();
setInterval(loadStatus, 15000);
