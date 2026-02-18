async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return res.json();
}

function renderHistory(items) {
  const tbody = document.getElementById("history-body");
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="7">Kayit yok</td></tr>';
    return;
  }

  tbody.innerHTML = items
    .map((item) => {
      const detail = item.topic || item.status || item.renderStatus || "-";
      return `<tr>
        <td>${new Date(item.createdAt).toLocaleString("tr-TR")}</td>
        <td>${item.eventType}</td>
        <td>${item.publishId || "-"}</td>
        <td>${detail}</td>
      </tr>`;
    })
    .join("");
}

function renderPublishes(items) {
  const tbody = document.getElementById("publish-body");
  const count = document.getElementById("publish-count");
  count.textContent = String(items.length);

  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="4">Kayit yok</td></tr>';
    return;
  }

  tbody.innerHTML = items
    .map(
      (item) => `<tr>
      <td>${item.publishId}</td>
      <td>${item.topic}</td>
      <td>${item.complianceStatus || "-"}</td>
      <td>${item.metricsCtr == null ? "-" : Number(item.metricsCtr).toFixed(3)}</td>
      <td>${item.renderStatus || "-"}</td>
      <td>${item.optimizationStatus || "-"}</td>
      <td>${item.status}</td>
    </tr>`
    )
    .join("");
}

async function refresh() {
  try {
    const [health, history, publishes] = await Promise.all([
      fetchJson("/health"),
      fetchJson("/api/v1/history?limit=20"),
      fetchJson("/api/v1/publish")
    ]);

    document.getElementById("health").textContent =
      `${health.storage}/${health.queue} q=${health.queueSize}`;
    renderHistory(history.items || []);
    renderPublishes(publishes.items || []);
  } catch (error) {
    document.getElementById("health").textContent = `hata: ${error.message}`;
  }
}

document.getElementById("refresh").addEventListener("click", refresh);
refresh();
setInterval(refresh, 5000);
