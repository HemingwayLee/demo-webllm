# WebLLM Model Manager (Chrome extension)

A Chrome extension that lists the WebLLM models downloaded in your browser, and lets you remove them or download them again. Other Chrome extensions can also use the downloaded models, so each model is only downloaded once.

## Build

```
cd extension
npm install
npm run build
```

This creates the `dist/` folder, which is the extension Chrome loads.

## Install in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick the `extension/dist` folder.
4. Click the extension's icon in the toolbar. The manager opens in a new tab.

After changing code in `src/`, run `npm run build` again, then click the reload button on the extension's card in `chrome://extensions`.

## Good to know

- **The extension only sees its own models.** Browsers keep each website's storage separate, and an extension counts as its own site. Models that a web page (like `localhost:8000` or chat.webllm.ai) downloaded won't show up here, and models downloaded here won't be visible to those pages.
- **Downloading also loads the model onto your GPU.** WebLLM has no "download only" function, so the extension loads the model and unloads it right after. That means you need WebGPU and enough GPU memory for the model. If the model is too big, the files are still saved but you'll see an error.
- **Keep the tab open while downloading.** Closing it stops the download. Files that finished downloading stay cached, so the next try skips them.
- **Some models share files.** For example, a model and its `-1k` variant can use the same weights. Removing one removes both, and the extension warns you first.

## Share models with other extensions

Chrome keeps each extension's storage private, so other extensions can't read the model files directly. Instead, the manager runs the model in its background worker and sends the answers back. The other extension uses the normal WebLLM API and only needs the manager's extension ID, which is always:

```
kpfphjjelobankiknfkcigkcfnnhcddk
```

```js
import { CreateExtensionServiceWorkerMLCEngine } from "@mlc-ai/web-llm";

const MANAGER_ID = "kpfphjjelobankiknfkcigkcfnnhcddk";

// List the models the user has downloaded
const { models } = await chrome.runtime.sendMessage(MANAGER_ID, { type: "listModels" });

// Load one and chat with it. Nothing is downloaded.
const engine = await CreateExtensionServiceWorkerMLCEngine(models[0], { extensionId: MANAGER_ID });
const reply = await engine.chat.completions.create({
  messages: [{ role: "user", content: "Hello!" }],
});
```

The manager page also shows this ID, with a **Copy ID** button and this snippet.

### Try it with the example client

The [`example-client/`](../example-client) folder at the repo root has a small demo extension that chats using the manager's models. See its README to build and load it.

### Rules and limits

- **Only downloaded models can be used.** If another extension asks for a model that isn't downloaded, it gets an error. It can't start a download, so you decide what takes up disk space.
- **Only WebLLM's built-in model list is allowed.** The manager ignores custom model lists from other extensions, because a model includes code (a `.wasm` file) that would run inside the manager.
- **One model at a time.** One model stays loaded on the GPU and is shared. If two extensions ask for different models, the manager switches models, which takes a few seconds.
- **One extension at a time.** Replies go to the extension that connected most recently. If two extensions use it at once, the first one stops getting answers.
- **Any installed extension can connect.** To allow only specific extensions, add `"externally_connectable": { "ids": ["<allowed extension ID>"] }` to `src/manifest.json`.

## The fixed extension ID

Normally an unpacked extension's ID comes from its folder path, so it's different on every computer. The `"key"` field in `src/manifest.json` fixes it: Chrome turns this public key into the ID, so the manager is always `kpfphjjelobankiknfkcigkcfnnhcddk`, wherever it's loaded from. That's what lets other extensions write the ID into their code.

- **The `"key"` is a public key**, so it's safe to commit and share.
- **The matching private key is `manager-key.pem`.** It's in `.gitignore`, so keep it secret and never commit it. Day-to-day work doesn't need it. You only need it to pack the extension yourself as a `.crx` file with the same ID.
- **The Chrome Web Store assigns its own ID.** If you publish the manager there, it gets a new permanent ID. Copy the store's public key into `"key"` and update `FIXED_ID` in `src/manager.js` and `MANAGER_ID` in `../example-client/src/popup.js`.
- **If the ID ever doesn't match**, the manager page shows a red warning under the ID.

## Files

| File | What it does |
|---|---|
| `src/manifest.json` | Tells Chrome about the extension. Its `"key"` fixes the extension ID |
| `src/background.js` | Opens the manager tab when you click the toolbar icon, and runs models for other extensions |
| `src/manager.html` / `manager.css` | The manager page |
| `src/manager.js` | Lists, downloads and removes models with WebLLM |
| `build.mjs` | Bundles WebLLM into `dist/` (Chrome extensions can't load code from a CDN) |
| `src/icons/` | The icon. Edit `icon.svg` (48px and 128px) or `icon-small.svg` (16px and 32px), then run `npm run icons` to regenerate the PNGs |
| `make-icons.mjs` | Turns the SVG icons into PNGs |
