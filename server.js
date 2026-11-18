import 'dotenv/config';
import express from 'express';
import OpenAI from 'openai';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const port = Number(process.env.PORT || 3000);
const provider = (process.env.AI_PROVIDER || 'openai').toLowerCase();
const directory = path.dirname(fileURLToPath(import.meta.url));
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(origin => origin.trim()).filter(Boolean);

app.use(express.json({ limit: '1mb' }));
app.use((request, response, next) => {
  const origin = request.get('origin');
  if (origin && allowedOrigins.length && !allowedOrigins.includes(origin)) {
    return response.status(403).json({ error: 'This website is not allowed to use the chat API.' });
  }
  if (origin && allowedOrigins.includes(origin)) {
    response.set('Access-Control-Allow-Origin', origin);
    response.set('Vary', 'Origin');
    response.set('Access-Control-Allow-Headers', 'Content-Type');
    response.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  if (request.method === 'OPTIONS') return response.sendStatus(204);
  next();
});
app.use(express.static(directory));

app.get('/healthz', (_request, response) => response.status(200).send('ok'));

app.get('/api/status', (_request, response) => {
  const configured = provider === 'ollama'
    || (provider === 'openai' && Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'put-your-api-key-here'))
    || (provider === 'gemini' && Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'put-your-api-key-here'));
  response.json({
    provider,
    model: provider === 'gemini' ? process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite' : provider === 'ollama' ? process.env.OLLAMA_MODEL || 'llama3.2' : process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    ready: configured,
    configured
  });
});

app.post('/api/chat', async (request, response) => {
  if (provider !== 'ollama' && provider !== 'openai' && provider !== 'gemini') {
    return response.status(503).json({ error: 'AI_PROVIDER must be set to openai, gemini, or ollama.' });
  }
  const messages = request.body?.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40) {
    return response.status(400).json({ error: 'Send between 1 and 40 chat messages.' });
  }

  if (messages.some(message => !['user', 'assistant'].includes(message?.role) || typeof message?.content !== 'string')) {
    return response.status(400).json({ error: 'Each message must have a valid role and text content.' });
  }
  const conversation = messages.map(message => ({ role: message.role, content: message.content.slice(0, 12000) }));

  try {
    let reply;
    if (provider === 'ollama') {
      const result = await fetch(`${process.env.OLLAMA_URL || 'http://127.0.0.1:11434'}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.OLLAMA_MODEL || 'llama3.2',
          messages: [{ role: 'system', content: 'You are Hemanshu AI, a helpful personal assistant. Be clear, friendly, and concise.' }, ...conversation],
          stream: false
        })
      });
      if (!result.ok) throw new Error(`Ollama returned ${result.status}. Check that Ollama is running and the configured model is installed.`);
      const data = await result.json();
      reply = data.message?.content;
    } else if (provider === 'gemini') {
      if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'put-your-api-key-here') {
        return response.status(503).json({ error: 'Configure GEMINI_API_KEY in the server environment to enable Gemini replies.' });
      }
      const client = new OpenAI({
        apiKey: process.env.GEMINI_API_KEY,
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/'
      });
      const result = await client.chat.completions.create({
        model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
        messages: [
          { role: 'system', content: 'You are Hemanshu AI, a helpful personal assistant. Be clear, friendly, and concise.' },
          ...conversation
        ],
        stream: true,
        extra_body: { google: { thinking_config: { thinking_level: 'low' } } }
      });
      response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      response.setHeader('Cache-Control', 'no-cache, no-transform');
      response.setHeader('Connection', 'keep-alive');
      for await (const chunk of result) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) response.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
      response.write('data: [DONE]\n\n');
      return response.end();
    } else {
      if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'put-your-api-key-here') {
        return response.status(503).json({ error: 'Configure OPENAI_API_KEY in the hosting service environment to enable live replies.' });
      }
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const result = await client.responses.create({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        instructions: 'You are Hemanshu AI, a helpful personal assistant. Be clear, friendly, and concise.',
        input: conversation
      });
      reply = result.output_text;
    }
    if (!reply) throw new Error('The AI returned an empty reply.');
    response.json({ reply, provider });
  } catch (error) {
    console.error('Chat request failed:', error.message);
    if (response.headersSent) {
      response.write(`event: error\ndata: ${JSON.stringify({ error: error.message || 'The AI request failed.' })}\n\n`);
      return response.end();
    }
    response.status(502).json({ error: provider === 'ollama' && error.cause ? 'Could not reach Ollama. Start Ollama and check its local address.' : error.message || 'The AI request failed.' });
  }
});

app.listen(port, () => {
  console.log(`Hemanshu AI is running at http://localhost:${port}`);
});
