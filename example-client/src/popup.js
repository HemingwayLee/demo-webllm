import { CreateExtensionServiceWorkerMLCEngine } from "@mlc-ai/web-llm";

// This extension doesn't download any models. It asks WebLLM Model Manager
// (another extension) to run one of its downloaded models and stream the answer back.

// WebLLM Model Manager's fixed extension ID (set by the "key" in its manifest).
const MANAGER_ID = "kpfphjjelobankiknfkcigkcfnnhcddk";

const $ = (id) => document.getElementById(id);
let engine = null;
let loadedModel = null;

function setStatus(text, isError = false) {
  $("status").textContent = text;
  $("status").className = isError ? "error" : "";
}

async function loadModelList() {
  const managerId = $("manager-id").value.trim();
  $("send").disabled = true;
  if (!managerId) return;
  await chrome.storage.local.set({ managerId });

  try {
    const res = await chrome.runtime.sendMessage(managerId, { type: "listModels" });
    if (res?.error) throw new Error(res.error);
    const models = res?.models || [];
    $("model").replaceChildren(
      ...(models.length ? models : [""]).map((id) => {
        const o = document.createElement("option");
        o.value = id;
        o.textContent = id || "No models downloaded in the manager yet";
        return o;
      }),
    );
    $("send").disabled = models.length === 0;
    setStatus(models.length ? `${models.length} model(s) available` : "");
  } catch (e) {
    // sendMessage fails if no extension with that ID is installed.
    setStatus(`Can't reach the manager: ${e.message}`, true);
  }
}

async function send() {
  const managerId = $("manager-id").value.trim();
  const modelId = $("model").value;
  $("send").disabled = true;
  $("answer").textContent = "";

  try {
    if (!engine || loadedModel !== modelId) {
      setStatus("Loading model in WebLLM Model Manager…");
      engine = await CreateExtensionServiceWorkerMLCEngine(modelId, {
        extensionId: managerId,
        initProgressCallback: (r) => setStatus(r.text),
        onDisconnect: () => (engine = null),
      });
      loadedModel = modelId;
    }

    setStatus("Thinking…");
    const stream = await engine.chat.completions.create({
      messages: [{ role: "user", content: $("prompt").value }],
      stream: true,
    });
    for await (const chunk of stream) {
      $("answer").textContent += chunk.choices[0]?.delta?.content || "";
    }
    setStatus(`Answered by ${modelId}`);
  } catch (e) {
    setStatus(e?.message || String(e), true);
  } finally {
    $("send").disabled = false;
  }
}

$("manager-id").addEventListener("change", loadModelList);
$("send").addEventListener("click", send);

// Use a saved ID if the user changed it, otherwise the manager's fixed ID.
const { managerId } = await chrome.storage.local.get("managerId");
$("manager-id").value = managerId || MANAGER_ID;
await loadModelList();
