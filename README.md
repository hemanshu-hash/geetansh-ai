# Geetansh AI

Phone-friendly chat website with a Node backend. Provider API keys stay on the server.

## Start locally

1. Install Node.js.
2. Run `npm install` in this folder.
3. Copy `.env.example` to `.env` and configure a provider, or keep your existing Ollama settings.
4. Run `npm start` and open `http://localhost:3000`.

Never put secret keys in `app.js` or other browser files.

## Publish on Render

1. Push the contents of this `work` folder to a GitHub repository. Keep `.env` private; `.gitignore` excludes it.
2. In Render, choose **New +** → **Blueprint**, then connect the repository containing `render.yaml`.
3. Set `GEMINI_API_KEY` in Render when prompted, then create the web service. Render provides the public HTTPS address after deployment.
4. Check `/healthz` and `/api/status` on that address, then open the website and try a chat.

The included `render.yaml` deploys the Node server as a public web service. Free-tier quotas are shared by visitors using your provider key, so check usage and protect the endpoint before widely sharing the URL. Chat history stays in each visitor's browser.

Render cannot reach Ollama at `127.0.0.1` on your computer. The Render blueprint uses Gemini for cloud replies.

## AI providers

For Google Gemini, create a key in Google AI Studio. Set `AI_PROVIDER=gemini`, `GEMINI_API_KEY`, and optionally `GEMINI_MODEL`. The server uses Google's OpenAI-compatible Chat Completions endpoint, and the key stays on the server. Google offers a free tier for selected models with project- and model-specific rate limits. Check the active quota in AI Studio. Google states that free-tier content may be used to improve its products, so avoid sending sensitive content on that tier. See [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits), and [OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai).

For OpenAI, set `AI_PROVIDER=openai`, `OPENAI_API_KEY`, and optionally `OPENAI_MODEL`. API access and billing are separate from a ChatGPT subscription.

For local Ollama, install Ollama, download a model such as `llama3.2:3b`, and set `AI_PROVIDER=ollama`, `OLLAMA_MODEL`, and optionally `OLLAMA_URL`. A Render server cannot reach Ollama bound to your computer's loopback address.

## Phone access during local development

Run the server on a computer on the same Wi-Fi and open `http://<computer-local-ip>:3000` on the phone.

Chat history stays in browser local storage. Attachments currently show filenames only and are not sent to the AI.
