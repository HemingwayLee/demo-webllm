import {
  ExtensionServiceWorkerMLCEngineHandler,
  hasModelInCache,
  prebuiltAppConfig,
} from "@mlc-ai/web-llm";

// Clicking the toolbar icon opens the manager in a full tab instead of a popup,
// because a popup closes (and cancels any download) as soon as it loses focus.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("manager.html") });
});

// ---------------------------------------------------------------------------
// Sharing downloaded models with other extensions
//
// Other extensions can't read this extension's storage, so instead of sharing
// the files we run the model here and send the answers back. Other extensions
// connect with WebLLM's CreateExtensionServiceWorkerMLCEngine(modelId,
// { extensionId: "<this extension's ID>" }) and use the usual OpenAI-style API.
// ---------------------------------------------------------------------------

async function downloadedModelIds() {
  const found = await Promise.all(
    prebuiltAppConfig.model_list.map((m) => hasModelInCache(m.model_id).catch(() => false)),
  );
  return prebuiltAppConfig.model_list.filter((_, i) => found[i]).map((m) => m.model_id);
}

class SharedModelHandler extends ExtensionServiceWorkerMLCEngineHandler {
  constructor(port) {
    super(port);
    // Only serve models the user already downloaded in the manager, so another
    // extension can't start a multi-GB download on its own.
    const reload = this.engine.reload.bind(this.engine);
    this.engine.reload = async (modelId, chatOpts) => {
      for (const id of [modelId].flat()) {
        if (!(await hasModelInCache(id).catch(() => false))) {
          throw new Error(
            `Model "${id}" isn't downloaded. Download it in WebLLM Model Manager first.`,
          );
        }
      }
      return reload(modelId, chatOpts);
    };
  }

  onmessage(msg) {
    // Ignore custom model lists from clients: they could point at any URL, and
    // the model's code (a .wasm file) would then run inside this extension.
    if (msg?.kind === "setAppConfig") return;
    super.onmessage(msg);
  }
}

// One model stays loaded on the GPU and is shared by everyone who connects.
// The most recently connected extension receives the replies.
let handler;
function onConnect(port) {
  if (port.name !== "web_llm_service_worker") return;
  if (handler === undefined) {
    handler = new SharedModelHandler(port);
  } else {
    handler.setPort(port);
  }
  port.onMessage.addListener(handler.onmessage.bind(handler));
}
chrome.runtime.onConnect.addListener(onConnect);
chrome.runtime.onConnectExternal.addListener(onConnect);

// Lets other extensions ask which models they can use:
//   chrome.runtime.sendMessage(MANAGER_ID, { type: "listModels" })
//   -> { models: ["Llama-3.2-1B-Instruct-q4f16_1-MLC", ...] }
chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "listModels") return;
  downloadedModelIds()
    .then((models) => sendResponse({ models }))
    .catch((e) => sendResponse({ error: e?.message || String(e) }));
  return true; // keep the channel open for the async reply
});
