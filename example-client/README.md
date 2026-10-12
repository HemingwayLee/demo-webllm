# WebLLM Example Client (Chrome extension)

A small demo extension that chats using a model downloaded in [WebLLM Model Manager](../extension). It doesn't download any models itself. It asks the manager to run the model and streams the answer back.

Use it to check that sharing models between extensions works, or as a starting point for your own extension.

## Build

```
cd example-client
npm install
npm run build
```

This creates the `dist/` folder.

## Try it

1. Install WebLLM Model Manager first (see [`extension/README.md`](../extension/README.md)), and download a small model in it, for example `Llama-3.2-1B-Instruct-q4f16_1-MLC`.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and choose `example-client/dist`.
3. Click the **WebLLM Example Client** icon in the toolbar. The manager's ID (`kpfphjjelobankiknfkcigkcfnnhcddk`) is already filled in.
4. Pick a model, type a prompt, and click **Send**.

If the popup says it can't reach the manager, check that the manager is installed and its ID matches the one on the manager page.

## How it works

The important part of `src/popup.js` is:

```js
import { CreateExtensionServiceWorkerMLCEngine } from "@mlc-ai/web-llm";

const MANAGER_ID = "kpfphjjelobankiknfkcigkcfnnhcddk";

// Ask the manager which models are downloaded
const { models } = await chrome.runtime.sendMessage(MANAGER_ID, { type: "listModels" });

// Connect to the manager and use one of them
const engine = await CreateExtensionServiceWorkerMLCEngine(models[0], { extensionId: MANAGER_ID });
const stream = await engine.chat.completions.create({
  messages: [{ role: "user", content: "Hello!" }],
  stream: true,
});
```

## Files

| File | What it does |
|---|---|
| `src/manifest.json` | Tells Chrome about the extension |
| `src/popup.html` | The popup UI |
| `src/popup.js` | Lists the manager's models and chats with one |
| `build.mjs` | Bundles WebLLM into `dist/popup.js` |
| `src/icons/` | The icon: a chat bubble. Edit `icon.svg` (48px and 128px) or `icon-small.svg` (16px and 32px), then run `npm run icons` to regenerate the PNGs |
| `make-icons.mjs` | Turns the SVG icons into PNGs |
