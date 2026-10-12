# demo-webllm

## What is WebLLM?

[WebLLM](https://github.com/mlc-ai/web-llm) is a JavaScript library that lets you run a **large language model (LLM)**, the kind of AI behind chatbots like ChatGPT, **directly inside your web browser**.

Usually, when you chat with an AI, your message goes over the internet to a big server, the server runs the model, and the answer comes back. WebLLM works differently: the model is downloaded once to your computer, and from then on **your own browser runs it**, using your computer's graphics card (GPU) through a browser feature called **WebGPU**.

### Why is that useful?

- **Privacy**: your messages never leave your computer.
- **No server costs**: you don't need a backend or a paid AI API key. A static web page is enough.
- **Works offline**: after the first download, the model is cached and can run without internet.
- **Easy to try**: anyone with a modern browser can open the page and start chatting.

### Things to know as a beginner

- **The first load is slow.** Models are big (often hundreds of MB to a few GB), so the first download takes a while. Later visits load from the browser cache.
- **You need a WebGPU-capable browser.** Recent versions of Chrome, Edge, Safari and Firefox support it, but Firefox doesn't yet support it on every platform.
- **Check your browser's WebGPU support** using the table below.

  | Browser | First version with WebGPU on by default | Platforms | Released |
  |---|---|---|---|
  | Chrome | 113 | Windows, macOS, ChromeOS | May 2023 |
  | Chrome for Android | 121 | Android 12+ (on supported GPUs) | Jan 2024 |
  | Edge | 113 | Windows, macOS | May 2023 |
  | Opera | 99 | Windows, macOS | 2023 |
  | Safari | 26 | macOS, iOS, iPadOS, visionOS | Sep 2025 |
  | Firefox | 141 | Windows | Jul 2025 |
  | Firefox | 145 | macOS (Apple Silicon) | Nov 2025 |

  Chrome on Linux and Firefox on Linux and Android are still rolling out. Support also depends on your GPU and drivers. For the latest status, see [Can I use WebGPU](https://caniuse.com/webgpu). To test your own browser, open the DevTools console and run `!!navigator.gpu`.

- **Your hardware matters.** Smaller models (for example 1–3 billion parameters) run well on most laptops. Bigger models need more GPU memory.
- **It uses an OpenAI-style API.** If you've seen code like `chat.completions.create(...)`, WebLLM looks the same, so many tutorials carry over.

### A tiny example

```js
import { CreateMLCEngine } from "@mlc-ai/web-llm";

// Downloads the model (first time only) and loads it into the browser
const engine = await CreateMLCEngine("Llama-3.2-1B-Instruct-q4f16_1-MLC", {
  initProgressCallback: (p) => console.log(p.text),
});

const reply = await engine.chat.completions.create({
  messages: [{ role: "user", content: "Explain WebLLM in one sentence." }],
});

console.log(reply.choices[0].message.content);
```

### Learn more

- WebLLM on GitHub: https://github.com/mlc-ai/web-llm
- Live chat demo: https://chat.webllm.ai
- List of supported models: see `prebuiltAppConfig` in the WebLLM repo

## What's in this repo

| Path | What it is |
|---|---|
| `detect.html` | A page that checks whether your browser supports WebGPU |
| `extension/` | A Chrome extension for managing downloaded WebLLM models and sharing them with other extensions |
| `example-client/` | A demo extension that chats using the manager's models |

## Check your browser with `detect.html`

Browsers only allow WebGPU on `https://` or `localhost` pages, so serve the folder locally instead of double-clicking the file:

```
python3 -m http.server 8000
```

Then open http://localhost:8000/detect.html. You'll see one of these:

- ✅ **WebGPU is supported.** You can run WebLLM.
- ⚠️ **Software fallback.** WebGPU works, but without your graphics card, so models will be very slow.
- ❌ **Not supported.** The page explains why and how to fix it.

## Use the Chrome extension: WebLLM Model Manager

The extension shows which WebLLM models are saved in your browser, and lets you remove them or download them again.

### 1. Build it

You need [Node.js](https://nodejs.org) installed. Then run:

```
cd extension
npm install
npm run build
```

This creates the `extension/dist` folder, which holds the finished extension.

### 2. Install it in Chrome

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (switch in the top right).
3. Click **Load unpacked** and choose the `extension/dist` folder.
4. Optional: click the puzzle-piece icon in the toolbar and pin **WebLLM Model Manager** so it's always visible.

### 3. Open the manager

Click the extension's icon in the toolbar. The manager opens in a new tab. It has two lists:

- **Downloaded models:** models saved in the extension, with the space each one uses.
- **Available models:** every model WebLLM can run. Use the search box (try `llama`, `qwen` or `phi`) or tick **Small models only** to narrow the list.

The line at the top shows how many models you have and how much storage they use.

### 4. Download a model

1. Find a model under **Available models** and click **Download**.
2. A progress bar shows the download. Keep the tab open until it finishes.
3. When it's done, the model moves to **Downloaded models**.

Tip: start with a small model like `Llama-3.2-1B-Instruct-q4f16_1-MLC` (under 1 GB). If your GPU doesn't support f16 (`detect.html` tells you), pick a model whose name contains `q4f32` instead.

### 5. Remove a model

Click **Remove** next to a downloaded model and confirm. The files are deleted and the space is freed.

### 6. Re-download a model

Click **Re-download** to delete a model and download a fresh copy. This is useful if a model is broken or a download was interrupted.

### 7. Use your models in other extensions

Other Chrome extensions can use the models you downloaded in the manager, so each model is only downloaded once. The model runs inside the manager, and the other extension gets the answers.

To try it:

1. Build the example client:

   ```
   cd example-client
   npm install
   npm run build
   ```

   Then load `example-client/dist` with **Load unpacked**, just like in step 2.
2. Click the **WebLLM Example Client** icon in the toolbar. The manager's ID is already filled in.
3. Pick a downloaded model and click **Send**.

The manager always has the same extension ID, on every computer:

```
kpfphjjelobankiknfkcigkcfnnhcddk
```

It's also shown at the top of the manager page with a **Copy ID** button. To use the models in your own extension, put this ID in your code. Click **Show code for other extensions** on the manager page for a ready-to-use snippet. Other extensions can only use models you've already downloaded. They can't start downloads themselves.

### Good to know

- **The extension only sees its own models.** Each website, and each extension, gets its own separate storage. Models downloaded by a web page won't appear in the extension, and the other way around.
- **Downloading needs WebGPU and enough GPU memory**, because WebLLM loads the model once to finish the download. Each model shows roughly how much GPU memory it needs.
- **Changed the code?** Run `npm run build` again, then click the reload button on the extension's card in `chrome://extensions`.

For more details, see [`extension/README.md`](extension/README.md).
