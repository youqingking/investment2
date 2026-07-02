const STAGES = [
  { key: "filt", label: "filt" },
  { key: "v1", label: "v1" },
  { key: "v2", label: "v2" },
  { key: "v3", label: "v3" },
];

const state = {
  dates: [],
  selectedDate: "",
  tickers: [],
  selectedTicker: null,
  selectedStage: "filt",
  loadingStage: "",
  stageRequestId: 0,
  filter: "all",
  search: "",
};

const els = {
  statusLine: document.querySelector("#statusLine"),
  datePicker: document.querySelector("#datePicker"),
  dateSummary: document.querySelector("#dateSummary"),
  tickerList: document.querySelector("#tickerList"),
  tickerSearch: document.querySelector("#tickerSearch"),
  emptyState: document.querySelector("#emptyState"),
  reportView: document.querySelector("#reportView"),
  selectedDate: document.querySelector("#selectedDate"),
  selectedTicker: document.querySelector("#selectedTicker"),
  selectedStatus: document.querySelector("#selectedStatus"),
  stageSummary: document.querySelector("#stageSummary"),
  stageTabs: document.querySelector("#stageTabs"),
  reportMeta: document.querySelector("#reportMeta"),
  markdownContent: document.querySelector("#markdownContent"),
  attachmentsList: document.querySelector("#attachmentsList"),
  attachmentPreview: document.querySelector("#attachmentPreview"),
};

function statusLabel(status) {
  return {
    complete: "完成",
    partial: "部分",
    empty: "无报告",
  }[status] || status;
}

function setStatus(text) {
  els.statusLine.textContent = text;
}

function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  return {
    date: params.get("date") || "",
    ticker: params.get("ticker") || "",
    stage: params.get("stage") || "",
  };
}

function validStage(stage) {
  return STAGES.some((item) => item.key === stage);
}

function updateUrlState() {
  const params = new URLSearchParams();
  if (state.selectedDate) {
    params.set("date", state.selectedDate);
  }
  if (state.selectedTicker?.ticker) {
    params.set("ticker", state.selectedTicker.ticker);
    if (state.selectedStage) {
      params.set("stage", state.selectedStage);
    }
  }
  const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
  window.history.replaceState(null, "", nextUrl);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function init() {
  bindEvents();
  try {
    const urlState = readUrlState();
    state.dates = await fetchJson("/api/dates");
    if (state.dates.length > 0) {
      const initialDate = state.dates.some((item) => item.date === urlState.date)
        ? urlState.date
        : state.dates[0].date;
      await selectDate(initialDate, { stage: urlState.stage, ticker: urlState.ticker });
    } else {
      renderDates();
      setStatus("未找到 analysis-result 日期目录");
    }
  } catch (error) {
    setStatus(`加载失败：${error.message}`);
  }
}

function bindEvents() {
  els.datePicker.addEventListener("change", (event) => {
    selectDate(event.target.value);
  });
  els.tickerSearch.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toUpperCase();
    renderTickers();
  });
  document.querySelectorAll(".filter-button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".filter-button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.filter = button.dataset.filter || "all";
      renderTickers();
    });
  });
}

function renderDates() {
  const dates = state.dates.map((item) => item.date).sort();
  if (dates.length === 0) {
    els.datePicker.disabled = true;
    els.dateSummary.textContent = "未找到 analysis-result 日期目录";
    return;
  }
  els.datePicker.disabled = false;
  els.datePicker.min = dates[0];
  els.datePicker.max = dates[dates.length - 1];
  els.datePicker.value = state.selectedDate || dates[dates.length - 1];
  renderDateSummary();
}

function renderDateSummary() {
  if (!state.selectedDate) {
    els.dateSummary.textContent = "请选择日期";
    return;
  }
  const item = state.dates.find((entry) => entry.date === state.selectedDate);
  if (!item) {
    els.dateSummary.textContent = "该日期没有分析结果";
    return;
  }
  els.dateSummary.textContent = `${item.ticker_count} 个 ticker · 完成 ${item.complete_count} / 部分 ${item.partial_count} / 无报告 ${item.empty_count}`;
}

async function selectDate(date, options = {}) {
  if (!date) {
    return;
  }
  state.selectedDate = date;
  state.selectedTicker = null;
  state.selectedStage = "filt";
  state.loadingStage = "";
  state.stageRequestId += 1;
  renderDates();
  showEmpty(`正在加载 ${date}`);
  let payload;
  try {
    payload = await fetchJson(`/api/dates/${encodeURIComponent(date)}/tickers`);
  } catch (error) {
    state.tickers = [];
    state.selectedTicker = null;
    renderTickers();
    setStatus(`${date}：无分析结果`);
    showEmpty("该日期没有分析结果。");
    renderDateSummary();
    updateUrlState();
    return;
  }
  state.tickers = payload.tickers
    .slice()
    .sort((a, b) => b.stage_count - a.stage_count || a.ticker.localeCompare(b.ticker));
  renderTickers();
  setStatus(`${date}：${state.tickers.length} 个 ticker`);
  if (state.tickers.length > 0) {
    const requestedTicker = state.tickers.find((item) => item.ticker === options.ticker);
    selectTicker(requestedTicker?.ticker || state.tickers[0].ticker, { stage: options.stage });
  } else {
    showEmpty("该日期没有 ticker 目录。");
    updateUrlState();
  }
}

function renderTickers() {
  els.tickerList.innerHTML = "";
  const rows = state.tickers.filter((ticker) => {
    const statusOk = state.filter === "all" || ticker.analysis_status === state.filter;
    const searchOk = !state.search || ticker.ticker.toUpperCase().includes(state.search);
    return statusOk && searchOk;
  });
  rows.forEach((ticker) => {
    const button = document.createElement("button");
    button.className = `ticker-button${state.selectedTicker?.ticker === ticker.ticker ? " active" : ""}`;
    const stageText = STAGES.map((stage) => {
      const present = ticker.stages[stage.key]?.status === "present";
      return `${stage.label}:${present ? "✓" : "-"}`;
    }).join(" ");
    button.innerHTML = `
      <div class="ticker-main">
        <span class="ticker-title">${escapeHtml(ticker.ticker)}</span>
        <span class="status-badge status-${ticker.analysis_status}">${statusLabel(ticker.analysis_status)}</span>
      </div>
      <div class="ticker-meta">${ticker.stage_count}/4 · ${escapeHtml(stageText)}</div>
    `;
    button.addEventListener("click", () => selectTicker(ticker.ticker));
    els.tickerList.appendChild(button);
  });
  if (rows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "ticker-meta";
    empty.textContent = "没有匹配的 ticker。";
    els.tickerList.appendChild(empty);
  }
}

function selectTicker(tickerName, options = {}) {
  const ticker = state.tickers.find((item) => item.ticker === tickerName);
  if (!ticker) {
    return;
  }
  state.selectedTicker = ticker;
  const firstPresent = STAGES.find((stage) => ticker.stages[stage.key]?.status === "present");
  const requestedStage = validStage(options.stage) ? options.stage : "";
  const requestedPresent = requestedStage && ticker.stages[requestedStage]?.status === "present";
  state.selectedStage = requestedPresent ? requestedStage : firstPresent?.key || "filt";
  renderTickers();
  renderTickerHeader();
  loadStage(state.selectedStage);
}

function renderTickerHeader(refreshAttachments = true) {
  const ticker = state.selectedTicker;
  if (!ticker) {
    return;
  }
  els.emptyState.classList.add("hidden");
  els.reportView.classList.remove("hidden");
  els.selectedDate.textContent = state.selectedDate;
  els.selectedTicker.textContent = ticker.ticker;
  els.selectedStatus.className = `status-badge status-${ticker.analysis_status}`;
  els.selectedStatus.textContent = `${statusLabel(ticker.analysis_status)} · ${ticker.stage_count}/4`;

  els.stageSummary.innerHTML = "";
  STAGES.forEach((stage) => {
    const present = ticker.stages[stage.key]?.status === "present";
    const pill = document.createElement("span");
    pill.className = `stage-pill ${present ? "stage-present" : "stage-missing"}`;
    pill.textContent = `${stage.label} ${present ? "present" : "missing"}`;
    els.stageSummary.appendChild(pill);
  });

  els.stageTabs.innerHTML = "";
  STAGES.forEach((stage) => {
    const button = document.createElement("button");
    const present = ticker.stages[stage.key]?.status === "present";
    const loading = state.loadingStage === stage.key;
    button.className = `stage-tab${stage.key === state.selectedStage ? " active" : ""}${loading ? " loading" : ""}`;
    button.disabled = loading;
    button.textContent = `${stage.label}${loading ? " 加载中" : present ? "" : " - 缺失"}`;
    button.addEventListener("click", () => {
      state.selectedStage = stage.key;
      renderTickerHeader(false);
      loadStage(stage.key);
    });
    els.stageTabs.appendChild(button);
  });
  if (refreshAttachments) {
    renderAttachments(ticker);
  }
}

async function loadStage(stage) {
  const ticker = state.selectedTicker;
  if (!ticker) {
    return;
  }
  const requestId = ++state.stageRequestId;
  const date = state.selectedDate;
  const tickerName = ticker.ticker;
  updateUrlState();
  state.loadingStage = stage;
  renderTickerHeader(false);
  els.reportMeta.textContent = "加载中";
  els.markdownContent.innerHTML = "";
  try {
    const payload = await fetchJson(
      `/api/report/${encodeURIComponent(date)}/${encodeURIComponent(tickerName)}/${encodeURIComponent(stage)}`,
    );
    if (requestId !== state.stageRequestId) {
      return;
    }
    if (payload.status === "missing") {
      els.reportMeta.textContent = `${stage} 阶段缺失`;
      els.markdownContent.innerHTML = `<div class="missing-report">${escapeHtml(stage)} 阶段报告不存在。</div>`;
      return;
    }
    els.reportMeta.textContent = `${payload.path} · ${payload.modified_at || ""}`;
    els.markdownContent.innerHTML = renderMarkdown(payload.content || "");
  } catch (error) {
    if (requestId !== state.stageRequestId) {
      return;
    }
    els.reportMeta.textContent = "加载失败";
    els.markdownContent.innerHTML = `<div class="missing-report">${escapeHtml(error.message)}</div>`;
  } finally {
    if (requestId === state.stageRequestId) {
      state.loadingStage = "";
      renderTickerHeader(false);
    }
  }
}

function showEmpty(text) {
  els.emptyState.textContent = text;
  els.emptyState.classList.remove("hidden");
  els.reportView.classList.add("hidden");
}

function renderAttachments(ticker) {
  els.attachmentsList.innerHTML = "";
  els.attachmentPreview.classList.add("hidden");
  els.attachmentPreview.innerHTML = "";
  const attachments = ticker.attachments || [];
  if (attachments.length === 0) {
    els.attachmentsList.innerHTML = '<div class="attachment-empty">无附件。</div>';
    return;
  }
  attachments.forEach((item) => {
    const row = document.createElement("div");
    row.className = "attachment-row";
    const kind = attachmentKind(item.name);
    row.innerHTML = `
      <div class="attachment-main">
        <div class="attachment-name">${escapeHtml(item.name)}</div>
        <div class="attachment-meta">${kind.label} · ${formatBytes(item.size_bytes || 0)}</div>
      </div>
      <div class="attachment-actions">
        <button class="attachment-action" type="button">预览</button>
        <a class="attachment-link" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">打开</a>
      </div>
    `;
    row.querySelector("button").addEventListener("click", () => previewAttachment(item));
    els.attachmentsList.appendChild(row);
  });
}

function attachmentKind(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".webp")) {
    return { type: "image", label: "图片" };
  }
  if (
    lower.endsWith(".md") ||
    lower.endsWith(".csv") ||
    lower.endsWith(".json") ||
    lower.endsWith(".log") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".chatgpt_chat_url")
  ) {
    return { type: "text", label: "文本" };
  }
  return { type: "file", label: "文件" };
}

async function previewAttachment(item) {
  const kind = attachmentKind(item.name);
  els.attachmentPreview.classList.remove("hidden");
  if (kind.type === "image") {
    els.attachmentPreview.innerHTML = `
      <div class="attachment-preview-title">${escapeHtml(item.name)}</div>
      <img class="attachment-image" src="${escapeHtml(item.url)}" alt="${escapeHtml(item.name)}">
    `;
    return;
  }
  if (kind.type === "text") {
    els.attachmentPreview.innerHTML = `<div class="attachment-preview-title">${escapeHtml(item.name)}</div><pre>加载中</pre>`;
    try {
      const response = await fetch(item.url);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      const text = await response.text();
      els.attachmentPreview.innerHTML = `
        <div class="attachment-preview-title">${escapeHtml(item.name)}</div>
        <pre>${escapeHtml(text)}</pre>
      `;
    } catch (error) {
      els.attachmentPreview.innerHTML = `
        <div class="attachment-preview-title">${escapeHtml(item.name)}</div>
        <pre>${escapeHtml(error.message)}</pre>
      `;
    }
    return;
  }
  els.attachmentPreview.innerHTML = `
    <div class="attachment-preview-title">${escapeHtml(item.name)}</div>
    <div class="attachment-empty">该类型暂不内嵌预览，请使用“打开”。</div>
  `;
}

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let inCode = false;
  let listOpen = false;
  let paragraph = [];
  let tableRows = [];

  function flushParagraph() {
    if (paragraph.length > 0) {
      html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  }

  function flushList() {
    if (listOpen) {
      html.push("</ul>");
      listOpen = false;
    }
  }

  function flushTable() {
    if (tableRows.length === 0) {
      return;
    }
    const rows = tableRows.filter((row) => !isTableSeparatorRow(row));
    html.push("<table>");
    rows.forEach((row, index) => {
      const cells = row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
      html.push("<tr>");
      cells.forEach((cell) => {
        const tag = index === 0 ? "th" : "td";
        html.push(`<${tag}>${renderInline(cell.trim())}</${tag}>`);
      });
      html.push("</tr>");
    });
    html.push("</table>");
    tableRows = [];
  }

  for (const line of lines) {
    if (line.startsWith("```")) {
      flushParagraph();
      flushList();
      flushTable();
      if (!inCode) {
        html.push("<pre><code>");
        inCode = true;
      } else {
        html.push("</code></pre>");
        inCode = false;
      }
      continue;
    }
    if (inCode) {
      html.push(`${escapeHtml(line)}\n`);
      continue;
    }
    if (/^\s*\|.+\|\s*$/.test(line)) {
      flushParagraph();
      flushList();
      tableRows.push(line);
      continue;
    }
    flushTable();
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }
    const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
    if (bullet) {
      flushParagraph();
      if (!listOpen) {
        html.push("<ul>");
        listOpen = true;
      }
      html.push(`<li>${renderInline(bullet[1])}</li>`);
      continue;
    }
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  flushTable();
  if (inCode) {
    html.push("</code></pre>");
  }
  return html.join("\n");
}

function isTableSeparatorRow(row) {
  const compact = row.trim().replace(/^\|/, "").replace(/\|$/, "").trim();
  if (!compact) {
    return false;
  }
  return compact.split("|").every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function renderInline(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

init();
