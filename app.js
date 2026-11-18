const form = document.querySelector('#chatForm');
const input = document.querySelector('#messageInput');
const welcome = document.querySelector('#welcome');
const messages = document.querySelector('#messages');
const toast = document.querySelector('#toast');
const historyList = document.querySelector('#historyList');
const attachmentInput = document.querySelector('#attachmentInput');
const STORAGE_KEY = 'geetansh-ai-chats-v1';
const SETTINGS_KEY = 'geetansh-ai-settings-v1';
let chats = readStorage(STORAGE_KEY, []);
let settings = readStorage(SETTINGS_KEY, { name: 'Geetansh', theme: 'dark' });
let currentChatId = null;
let toastTimer;
let attachedFiles = [];
let aiReady = false;
let aiProvider = 'openai';
let sending = false;

function readStorage(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

function saveChats() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch {
    showToast('Chat storage is full. Export a chat before continuing.');
  }
  renderHistory();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function addMessage(content, role, fileNames = []) {
  const row = document.createElement('div');
  row.className = `message ${role}`;
  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = role === 'assistant' ? 'G' : 'Y';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = content;
  if (fileNames.length) {
    const fileList = document.createElement('div');
    fileList.className = 'message-files';
    fileList.textContent = `📎 ${fileNames.join(', ')}`;
    bubble.append(fileList);
  }
  row.append(avatar, bubble);
  messages.append(row);
  row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  return row;
}

function demoReply(prompt) {
  const normalized = prompt.toLowerCase();
  if (/hello|hi\b|hey|good morning/.test(normalized)) return 'Hey! 👋 I’m Geetansh AI, your personal assistant. What would you like to chat about?';
  if (/plan|productive|routine|day/.test(normalized)) return 'Here’s a simple way to shape your day:\n\n1. Pick your one most important task.\n2. Work on it for 25 minutes, then take a short break.\n3. Group small errands together instead of switching between them.\n4. Leave a little room for rest and unexpected things.\n\nWhat’s the main thing you’d like to get done today?';
  if (/teach|fascinat|learn|something/.test(normalized)) return 'Here’s a curious one: the smell after rain has a name — petrichor. It comes partly from oils released by plants during dry spells, and partly from a soil-dwelling bacteria. Raindrops help send those tiny scent-carrying particles into the air. 🌧️';
  if (/creative|brainstorm|idea|project/.test(normalized)) return 'Let’s make something! A few starting points:\n\n• Build a tiny website that solves one everyday annoyance.\n• Make a personal playlist with a story behind each song.\n• Start a “one photo a day” journal around a theme.\n\nTell me what you’re into, and I’ll tailor some ideas for you.';
  if (/what can you|help|who are you/.test(normalized)) return 'I’m Geetansh AI — a chat assistant built for you. I can help brainstorm ideas, explain concepts, plan a day, draft messages, or just have a conversation.\n\nRight now I’m running in demo mode, so my replies are examples rather than live AI answers. When you’re ready, we can connect a real AI service.';
  return 'Thanks for sharing that with me. I’m Geetansh AI, and this preview is running in demo mode, so I can only offer sample replies right now. Once a live AI service is connected, I’ll be able to respond to your message in a much more useful, specific way.\n\nFor now, try asking me to plan your day, teach you something, or brainstorm a project idea. ✨';
}

async function getAssistantReply(chat, onChunk) {
  if (!aiReady) throw new Error('Live AI is not configured yet. Add your API key to .env, then restart the server.');
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: chat.messages.map(({ role, content }) => ({ role, content })) })
  });
  if (response.headers.get('content-type')?.includes('text/event-stream')) {
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'The AI request failed.');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let reply = '';
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';
      for (const event of events) {
        const data = event.split('\n').find(line => line.startsWith('data: '))?.slice(6);
        if (!data || data === '[DONE]') continue;
        const chunk = JSON.parse(data);
        if (chunk.error) throw new Error(chunk.error);
        reply += chunk.text || '';
        onChunk?.(reply);
      }
      if (done) break;
    }
    return reply;
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The AI request failed.');
  return result.reply;
}

async function checkAIStatus() {
  const status = document.querySelector('#connectionStatus');
  try {
    const response = await fetch('/api/status');
    const result = await response.json();
    aiReady = result.ready;
    aiProvider = result.provider;
    status.textContent = aiReady
      ? `Connected · ${aiProvider === 'ollama' ? 'Local AI' : aiProvider === 'gemini' ? 'Google Gemini' : 'OpenAI'}`
      : aiProvider === 'gemini'
        ? 'Add GEMINI_API_KEY to the server environment to enable live AI.'
        : aiProvider === 'ollama'
          ? 'Start Ollama and check its local model configuration.'
          : 'Add OPENAI_API_KEY to the server environment to enable live AI replies.';
    status.classList.toggle('connected', aiReady);
    document.querySelector('#providerName').textContent = aiReady
      ? (aiProvider === 'ollama' ? `Local · ${result.model}` : aiProvider === 'gemini' ? `Gemini · ${result.model}` : `OpenAI · ${result.model}`)
      : 'AI not configured';
    document.querySelector('.demo-note').innerHTML = `<span class="demo-dot${aiReady ? ' connected-dot' : ''}"></span> ${aiReady ? 'Live AI' : 'Not connected'}`;
  } catch {
    aiReady = false;
    status.textContent = 'Start the app with npm start to connect live AI.';
    document.querySelector('#providerName').textContent = 'Server offline';
    document.querySelector('.demo-note').innerHTML = '<span class="demo-dot"></span> Offline';
  }
}

function ensureChat(prompt) {
  let chat = chats.find(item => item.id === currentChatId);
  if (!chat) {
    chat = { id: makeId(), title: prompt.slice(0, 34), updatedAt: Date.now(), messages: [] };
    chats.unshift(chat);
    currentChatId = chat.id;
  }
  return chat;
}

function sendMessage(value) {
  const prompt = value.trim();
  if (!prompt || sending) return;
  if (attachedFiles.length) {
    showToast('File contents are not connected yet. Remove attachments to send a message.');
    return;
  }
  const files = [];
  welcome.classList.add('hidden');
  messages.classList.add('visible');
  const chat = ensureChat(prompt || 'Shared file');
  const displayText = prompt || 'Please take a look at the attached file.';
  chat.messages.push({ role: 'user', content: displayText, files });
  addMessage(displayText, 'user', files);
  input.value = '';
  input.style.height = 'auto';
  const pending = document.createElement('div');
  pending.className = 'message assistant';
  pending.innerHTML = '<div class="message-avatar">G</div><div class="typing"><i></i><i></i><i></i></div>';
  messages.append(pending);
  pending.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  saveChats();
  sending = true;
  document.querySelector('#sendButton').disabled = true;
  setTimeout(async () => {
    pending.remove();
    let reply;
    try {
      if (aiReady && aiProvider === 'gemini') {
        const assistantRow = addMessage('', 'assistant');
        pending.remove();
        reply = await getAssistantReply(chat, text => {
          assistantRow.querySelector('.bubble').textContent = text;
          assistantRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      } else {
        reply = aiReady ? await getAssistantReply(chat) : demoReply(prompt);
      }
    } catch (error) {
      if (messages.lastElementChild?.classList.contains('assistant') && !messages.lastElementChild.querySelector('.typing')) {
        messages.lastElementChild.querySelector('.bubble').textContent += `\n\nConnection interrupted: ${error.message}`;
      } else {
        addMessage(`I couldn’t get a reply: ${error.message}\n\nYour message is still here. Please try again.`, 'assistant');
      }
      sending = false;
      document.querySelector('#sendButton').disabled = false;
      saveChats();
      return;
    }
    chat.messages.push({ role: 'assistant', content: reply, files: [] });
    chat.updatedAt = Date.now();
    addMessage(reply, 'assistant');
    sending = false;
    document.querySelector('#sendButton').disabled = false;
    saveChats();
  }, 700);
}

function renderHistory() {
  historyList.replaceChildren();
  if (!chats.length) {
    const empty = document.createElement('p');
    empty.className = 'history-empty';
    empty.textContent = 'Your chats will show up here';
    historyList.append(empty);
    return;
  }
  chats.forEach(chat => {
    const row = document.createElement('div');
    row.className = `history-item${chat.id === currentChatId ? ' active' : ''}`;
    const open = document.createElement('button');
    open.className = 'history-open';
    const dot = document.createElement('span');
    dot.className = 'history-dot';
    const title = document.createElement('span');
    title.className = 'history-title';
    title.textContent = chat.title;
    open.append(dot, title);
    open.addEventListener('click', () => loadChat(chat.id));
    const menu = document.createElement('button');
    menu.className = 'history-menu';
    menu.textContent = '···';
    menu.setAttribute('aria-label', `Options for ${chat.title}`);
    menu.addEventListener('click', event => {
      event.stopPropagation();
      const action = window.prompt('Type “rename” to rename this chat, or “delete” to delete it.');
      if (action?.toLowerCase() === 'rename') {
        const titleValue = window.prompt('Enter a new chat name:', chat.title);
        if (titleValue?.trim()) { chat.title = titleValue.trim(); saveChats(); }
      } else if (action?.toLowerCase() === 'delete') {
        chats = chats.filter(item => item.id !== chat.id);
        if (currentChatId === chat.id) { currentChatId = null; resetView(); }
        saveChats();
      }
    });
    row.append(open, menu);
    historyList.append(row);
  });
}

function loadChat(id) {
  const chat = chats.find(item => item.id === id);
  if (!chat) return;
  currentChatId = id;
  welcome.classList.add('hidden');
  messages.classList.add('visible');
  messages.replaceChildren();
  chat.messages.forEach(message => addMessage(message.content, message.role, message.files));
  renderHistory();
  document.querySelector('#sidebar').classList.remove('open');
}

function resetView() {
  messages.replaceChildren();
  messages.classList.remove('visible');
  welcome.classList.remove('hidden');
  currentChatId = null;
  renderHistory();
}

function renderAttachments() {
  const container = document.querySelector('#attachments');
  container.replaceChildren();
  attachedFiles.forEach((file, index) => {
    const chip = document.createElement('span');
    chip.className = 'attachment-chip';
    chip.textContent = `📎 ${file.name}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Remove ${file.name}`);
    remove.addEventListener('click', () => { attachedFiles.splice(index, 1); renderAttachments(); });
    chip.append(remove);
    container.append(chip);
  });
}

function openSettings() {
  const name = window.prompt('What should Geetansh AI call you?', settings.name);
  if (name?.trim()) {
    settings.name = name.trim();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    document.querySelector('#profileName').textContent = settings.name;
    document.querySelector('#welcomeName').textContent = `${settings.name}.`;
    document.querySelector('#profileAvatar').textContent = settings.name[0].toUpperCase();
    showToast('Your profile name was updated');
  }
}

form.addEventListener('submit', event => { event.preventDefault(); sendMessage(input.value); });
input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 130)}px`; });
input.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); }
});
document.querySelectorAll('.suggestion').forEach(button => button.addEventListener('click', () => sendMessage(button.dataset.prompt)));
document.querySelector('#newChat').addEventListener('click', () => { resetView(); document.querySelector('#sidebar').classList.remove('open'); input.focus(); });
document.querySelector('#menuButton').addEventListener('click', () => document.querySelector('#sidebar').classList.toggle('open'));
document.querySelector('#shareButton').addEventListener('click', async () => {
  const chat = chats.find(item => item.id === currentChatId);
  if (!chat) { showToast('Start a chat first, then you can export it'); return; }
  const transcript = chat.messages.map(message => `${message.role === 'user' ? settings.name : 'Geetansh AI'}: ${message.content}`).join('\n\n');
  try {
    const exportBlob = new Blob([transcript], { type: 'text/plain;charset=utf-8' });
    const downloadUrl = URL.createObjectURL(exportBlob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `${chat.title.replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-|-$/g, '') || 'geetansh-chat'}.txt`;
    link.click();
    URL.revokeObjectURL(downloadUrl);
    showToast('Conversation exported');
  } catch (error) { if (error.name !== 'AbortError') showToast('Could not share this conversation'); }
});
document.querySelector('#attachButton').addEventListener('click', () => {
  showToast('Attachments are not sent to the AI yet. You can select one to preview its name.');
  attachmentInput.click();
});
attachmentInput.addEventListener('change', () => {
  const added = [...attachmentInput.files];
  if (added.length) { attachedFiles.push(...added); renderAttachments(); }
  attachmentInput.value = '';
});
document.querySelector('#profileButton').addEventListener('click', openSettings);
document.querySelector('#profileMenu').addEventListener('click', openSettings);
document.querySelector('#chatActionsButton').addEventListener('click', () => {
  const chat = chats.find(item => item.id === currentChatId);
  if (!chat) { showToast('Start a chat first'); return; }
  const action = window.prompt('Type “rename” to rename this chat, or “delete” to delete it.');
  if (action?.toLowerCase() === 'rename') {
    const title = window.prompt('Enter a new chat name:', chat.title);
    if (title?.trim()) { chat.title = title.trim(); saveChats(); }
  } else if (action?.toLowerCase() === 'delete') {
    chats = chats.filter(item => item.id !== chat.id);
    resetView();
    saveChats();
    showToast('Conversation deleted');
  }
});
document.querySelector('#modelButton').addEventListener('click', () => showToast(aiReady ? `Connected to ${aiProvider === 'ollama' ? 'your local Ollama model' : aiProvider === 'gemini' ? 'Google Gemini' : 'OpenAI'}` : 'Configure the selected AI provider on the server'));
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); resetView(); input.focus(); }
  if (event.key === 'Escape') document.querySelector('#sidebar').classList.remove('open');
});

document.querySelector('#profileName').textContent = settings.name;
document.querySelector('#welcomeName').textContent = `${settings.name}.`;
document.querySelector('#profileAvatar').textContent = settings.name[0].toUpperCase();
document.querySelector('#providerName').textContent = 'Checking…';
renderHistory();
checkAIStatus();
