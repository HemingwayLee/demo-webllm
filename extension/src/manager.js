import * as webllm from "@mlc-ai/web-llm";

// Models are stored in the Cache API under this extension's own origin, so the
// extension only sees models it downloaded itself, not ones cached by websites.
const appConfig = webllm.prebuiltAppConfig;
const models = appConfig.model_list;

const $ = (id) => document.getElementById(id);
const state = {
  downloaded: new Set(), // model_ids found in the cache
  sizes: new Map(), // model_id -> bytes on disk
  busyId: null, // model currently being downloaded or removed
  errors: new Map(), // model_id -> last error message
  hasWebGPU: false,
};

// Same rule WebLLM uses to build cache keys from a model's Hugging Face URL.
function cleanModelUrl(url) {
  url += url.endsWith("/") ? "" : "/";
  if (!url.match(/.+\/resolve\/.+\//)) url += "resolve/main/";
  return new URL(url).href;
}

// Some model_ids point at the same weights (e.g. "-1k" variants), so removing
// one also removes the other.
const idsByUrl = new Map();
for (const m of models) {
  const url = cleanModelUrl(m.model);
  idsByUrl.set(url, [...(idsByUrl.get(url) || []), m.model_id]);
}

function formatBytes(bytes) {
  if (!bytes) return "0 MB";
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

function modelTypeLabel(m) {
  if (m.model_type === webllm.ModelType.embedding) return "Embedding";
  if (m.model_type === webllm.ModelType.VLM) return "Vision";
  return "Chat";
}

async function checkWebGPU() {
  try {
    return Boolean(navigator.gpu && (await navigator.gpu.requestAdapter()));
  } catch {
    return false;
  }
}

async function scanCache() {
  const found = await Promise.all(
    models.map((m) => webllm.hasModelInCache(m.model_id, appConfig).catch(() => false)),
  );
  state.downloaded = new Set(models.filter((_, i) => found[i]).map((m) => m.model_id));

  // Add up the size of every cached weight file that belongs to each model.
  state.sizes = new Map();
  if (!(await caches.has("webllm/model"))) return;
  const cache = await caches.open("webllm/model");
  for (const request of await cache.keys()) {
    const url = [...idsByUrl.keys()].find((prefix) => request.url.startsWith(prefix));
    if (!url) continue;
    const response = await cache.match(request);
    const bytes = Number(response.headers.get("content-length")) || (await response.blob()).size;
    for (const id of idsByUrl.get(url)) state.sizes.set(id, (state.sizes.get(id) || 0) + bytes);
  }
}

async function renderSummary() {
  const { usage = 0, quota = 0 } = (await navigator.storage?.estimate?.()) || {};
  $("summary").textContent =
    `${state.downloaded.size} of ${models.length} models downloaded · ` +
    `${formatBytes(usage)} used of ${formatBytes(quota)} available to this extension`;
}

function modelRow(m, isDownloaded) {
  const id = m.model_id;
  const li = document.createElement("li");
  li.className = "model" + (state.busyId === id ? " busy" : "");
  li.dataset.id = id;

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = id;

  const meta = document.createElement("div");
  meta.className = "meta";
  const tags = [modelTypeLabel(m)];
  if (isDownloaded) tags.push(`${formatBytes(state.sizes.get(id))} on disk`);
  if (m.vram_required_MB) tags.push(`needs ~${(m.vram_required_MB / 1024).toFixed(1)} GB GPU memory`);
  if (m.low_resource_required) tags.push("small");
  if (m.required_features?.includes("shader-f16")) tags.push("needs f16");
  const sharedWith = idsByUrl.get(cleanModelUrl(m.model)).filter((other) => other !== id);
  if (isDownloaded && sharedWith.length) tags.push(`shares files with ${sharedWith.join(", ")}`);
  for (const t of tags) {
    const span = document.createElement("span");
    span.className = "tag";
    span.textContent = t;
    meta.append(span);
  }

  const actions = document.createElement("div");
  actions.className = "actions";
  const busy = state.busyId !== null;
  const button = (label, cls, onClick, disabled = busy) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.className = cls;
    b.disabled = disabled;
    b.addEventListener("click", onClick);
    actions.append(b);
  };
  if (isDownloaded) {
    button("Re-download", "", () => redownload(id), busy || !state.hasWebGPU);
    button("Remove", "danger", () => remove(id));
  } else {
    button("Download", "primary", () => download(id), busy || !state.hasWebGPU);
  }

  const progress = document.createElement("div");
  progress.className = "progress";
  progress.innerHTML = '<progress max="1" value="0"></progress><div class="text">Starting…</div>';

  li.append(name, actions, meta, progress);

  if (state.errors.has(id)) {
    const err = document.createElement("div");
    err.className = "error";
    err.textContent = state.errors.get(id);
    li.append(err);
  }
  return li;
}

function render() {
  const query = $("search").value.trim().toLowerCase();
  const smallOnly = $("small-only").checked;

  const downloaded = models.filter((m) => state.downloaded.has(m.model_id));
  $("downloaded").replaceChildren(...downloaded.map((m) => modelRow(m, true)));
  $("downloaded-empty").hidden = downloaded.length > 0;

  const available = models.filter(
    (m) =>
      !state.downloaded.has(m.model_id) &&
      (!smallOnly || m.low_resource_required) &&
      m.model_id.toLowerCase().includes(query),
  );
  $("available").replaceChildren(...available.map((m) => modelRow(m, false)));
}

function showProgress(id, report) {
  const row = document.querySelector(`.model[data-id="${CSS.escape(id)}"]`);
  if (!row) return;
  row.querySelector("progress").value = report.progress;
  row.querySelector(".progress .text").textContent = report.text;
}

async function refresh() {
  await scanCache();
  render();
  await renderSummary();
}

async function runTask(id, task) {
  state.busyId = id;
  state.errors.delete(id);
  render();
  try {
    await task();
  } catch (e) {
    state.errors.set(id, e?.message || String(e));
  } finally {
    state.busyId = null;
    await refresh();
  }
}

// WebLLM has no "download only" call, so we load the model (which downloads
// anything missing into the cache) and then unload it right away.
async function fetchModel(id) {
  const engine = await webllm.CreateMLCEngine(id, {
    appConfig,
    initProgressCallback: (report) => showProgress(id, report),
  });
  await engine.unload();
}

function download(id) {
  return runTask(id, () => fetchModel(id));
}

function remove(id) {
  const sharedWith = idsByUrl.get(cleanModelUrl(models.find((m) => m.model_id === id).model));
  const extra = sharedWith.length > 1 ? `\n\nThis also removes: ${sharedWith.filter((x) => x !== id).join(", ")}` : "";
  if (!confirm(`Remove ${id} from this browser?${extra}`)) return;
  return runTask(id, () => webllm.deleteModelAllInfoInCache(id, appConfig));
}

function redownload(id) {
  if (!confirm(`Delete ${id} and download it again?`)) return;
  return runTask(id, async () => {
    await webllm.deleteModelAllInfoInCache(id, appConfig);
    await fetchModel(id);
  });
}

// Ask the browser not to evict our models when disk space runs low.
navigator.storage?.persist?.();

window.addEventListener("beforeunload", (e) => {
  if (state.busyId) e.preventDefault(); // warn before closing mid-download
});

// "Use these models in other extensions" section
// The "key" in manifest.json fixes this extension's ID, so it's the same on
// every computer and other extensions can write it into their code.
const FIXED_ID = "kpfphjjelobankiknfkcigkcfnnhcddk";
const extensionId = chrome.runtime.id;
$("extension-id").textContent = extensionId;
if (extensionId === FIXED_ID) {
  $("id-note").textContent =
    "It's fixed, so it's the same on every computer.";
} else {
  // Happens if the "key" was removed, or Chrome Web Store assigned a different one.
  $("id-note").textContent =
    `This ID isn't the expected fixed ID (${FIXED_ID}). Other extensions need to use the ID shown above.`;
  $("id-note").className = "warn";
}
$("copy-id").addEventListener("click", async () => {
  await navigator.clipboard.writeText(extensionId);
  $("copy-id").textContent = "Copied!";
  setTimeout(() => ($("copy-id").textContent = "Copy ID"), 1500);
});
$("snippet").textContent = `import { CreateExtensionServiceWorkerMLCEngine } from "@mlc-ai/web-llm";

// WebLLM Model Manager's fixed extension ID
const MANAGER_ID = "${extensionId}";

// Which models are downloaded?
const { models } = await chrome.runtime.sendMessage(MANAGER_ID, { type: "listModels" });

// Load one (no download needed) and chat with it
const engine = await CreateExtensionServiceWorkerMLCEngine(models[0], {
  extensionId: MANAGER_ID,
});
const reply = await engine.chat.completions.create({
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(reply.choices[0].message.content);`;

$("search").addEventListener("input", render);
$("small-only").addEventListener("change", render);

state.hasWebGPU = await checkWebGPU();
$("gpu-warning").hidden = state.hasWebGPU;
await refresh();
