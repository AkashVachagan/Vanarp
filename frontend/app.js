const $ = (selector) => document.querySelector(selector);
const state = {
  token: sessionStorage.getItem('gcode_token'), mode: 'login', tree: null,
  tabs: [], activeKey: null, chatId: null, saving: false, toastTimer: null,
  session: null, sessionTimer: null, jitsiApi: null,
};
const auth = $('#auth'), app = $('#app'), editor = $('#editor');
const API_URL = 'http://localhost:3000';

async function api(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${API_URL}${url}`, { ...options, headers });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  if (!response.ok) throw new Error(data.error || data.message || `Request failed (${response.status})`);
  return data;
}
function showToast(message) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('show');
  clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}
function setAuthMode(mode) {
  state.mode = mode;
  $('#auth-title').textContent = mode === 'login' ? 'Welcome back.' : 'Get started.';
  $('.auth-subtitle').textContent = mode === 'login' ? 'Sign in to pick up where you left off.' : 'Create an account for your own workspace.';
  $('#auth-submit').innerHTML = mode === 'login' ? 'Sign in <span>↗</span>' : 'Create account <span>↗</span>';
  $('#auth-switch-copy').textContent = mode === 'login' ? 'New to gcode?' : 'Already have an account?';
  $('#mode-toggle').textContent = mode === 'login' ? 'Create account' : 'Sign in';
  $('#password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  $('#auth-error').textContent = '';
}
$('#mode-toggle').addEventListener('click', () => setAuthMode(state.mode === 'login' ? 'register' : 'login'));
$('#auth-form').addEventListener('submit', async (event) => {
  event.preventDefault(); $('#auth-error').textContent = '';
  const button = $('#auth-submit'); button.disabled = true;
  try {
    const data = await api(`/user/${state.mode}`, { method: 'POST', body: JSON.stringify({ username: $('#username').value.trim(), password: $('#password').value }) });
    state.token = data.token; sessionStorage.setItem('gcode_token', data.token); await enterWorkspace();
  } catch (error) { $('#auth-error').textContent = error.message; }
  finally { button.disabled = false; }
});

function collectFiles(items = state.tree?.content || [], prefix = []) {
  return items.flatMap((item) => item.type === 'file'
    ? [{ ...item, path: [...prefix, item.name] }]
    : collectFiles(item.content || [], [...prefix, item.name]));
}
const pathUrl = (path) => `/file/${path.map(encodeURIComponent).join('/')}`;
const folderUrl = (path) => `/folder/${path.map(encodeURIComponent).join('/')}`;
const pathKey = (path) => path.join('/');
function activeTab() { return state.tabs.find((tab) => tab.key === state.activeKey) || null; }
function updateDirty() {
  const dirty = state.tabs.some((tab) => tab.content !== tab.savedContent);
  $('#save-state').classList.toggle('saving', dirty);
  $('#save-state').lastChild.textContent = dirty ? ' Unsaved changes' : ' All changes saved';
  renderTabs();
}
function updateLines() {
  $('#line-numbers').textContent = Array.from({ length: editor.value.split('\n').length }, (_, index) => index + 1).join('\n');
}
function renderTabs() {
  const tabs = $('#tabs'); tabs.replaceChildren();
  for (const tab of state.tabs) {
    const item = document.createElement('div'); item.className = `editor-tab${tab.key === state.activeKey ? ' active' : ''}`;
    item.title = tab.path.join('/');
    const icon = document.createElement('span'); icon.className = 'language-dot'; icon.style.background = languageColor(tab.fileName);
    const name = document.createElement('span'); name.className = 'editor-tab-name'; name.textContent = tab.fileName;
    const dirty = document.createElement('span'); dirty.className = 'tab-dirty'; dirty.textContent = tab.content !== tab.savedContent ? '●' : '';
    const close = document.createElement('button'); close.className = 'tab-close'; close.type = 'button'; close.title = `Close ${tab.fileName}`; close.setAttribute('aria-label', `Close ${tab.fileName}`); close.textContent = '×';
    item.append(icon, name, dirty, close); tabs.append(item);
    item.addEventListener('click', () => activateTab(tab.key));
    close.addEventListener('click', (event) => { event.stopPropagation(); closeTab(tab.key); });
  }
}
function languageColor(name) {
  const ext = name.split('.').pop().toLowerCase();
  return ({ js: '#e4c94c', mjs: '#e4c94c', py: '#d9a461', html: '#df785f', css: '#68a9d7', json: '#b4cf7a', md: '#9a9feb', c: '#68a9d7', cpp: '#9a9feb' })[ext] || '#aaa';
}
function renderContextFiles() {
  const container = $('#context-files');
  const selected = new Set([...container.querySelectorAll('input:checked')].map((input) => input.dataset.id));
  const files = collectFiles(); container.replaceChildren();
  if (!files.length) container.innerHTML = '<div class="empty-files">Create a file to add code context.</div>';
  for (const file of files) {
    const label = document.createElement('label'); label.className = 'context-file';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.dataset.id = file.file_id; checkbox.checked = selected.has(file.file_id);
    checkbox.addEventListener('change', () => updateSelectedCount());
    const icon = document.createElement('span'); icon.className = 'tree-icon'; icon.textContent = '●';
    const name = document.createElement('span'); name.textContent = file.path.join('/');
    label.append(checkbox, icon, name); container.append(label);
  }
  updateSelectedCount();
}
function updateSelectedCount() { $('#selected-count').textContent = `${$('#context-files').querySelectorAll('input:checked').length} selected`; }
function renderTree() {
  const root = $('#file-tree'); root.replaceChildren(); if (!state.tree) return;
  $('#project-name').textContent = state.tree.name || 'PROJECT';
  const draw = (items, parent, path = []) => {
    for (const entry of items) {
      const entryPath = [...path, entry.name];
      const row = document.createElement('div');
      row.className = `tree-item${activeTab()?.key === pathKey(entryPath) ? ' selected' : ''}`;
      const arrow = document.createElement('span'); arrow.className = 'tree-arrow'; arrow.textContent = entry.type === 'folder' ? '⌄' : '';
      const icon = document.createElement('span'); icon.className = `tree-icon ${entry.type}`; icon.textContent = entry.type === 'folder' ? '▱' : '●';
      const label = document.createElement('span'); label.className = 'tree-label'; label.textContent = entry.name;
      const actions = document.createElement('span'); actions.className = 'tree-actions';
      const rename = document.createElement('button'); rename.type = 'button'; rename.title = 'Rename'; rename.setAttribute('aria-label', `Rename ${entry.name}`); rename.textContent = '✎';
      const remove = document.createElement('button'); remove.type = 'button'; remove.title = 'Delete'; remove.setAttribute('aria-label', `Delete ${entry.name}`); remove.textContent = '×';
      rename.addEventListener('click', (event) => { event.stopPropagation(); renameEntry(entry, entryPath); });
      remove.addEventListener('click', (event) => { event.stopPropagation(); deleteEntry(entry, entryPath); });
      actions.append(rename, remove); row.append(arrow, icon, label, actions); parent.append(row);
      if (entry.type === 'file') row.addEventListener('click', () => openFile(entryPath));
      else {
        const children = document.createElement('div'); children.className = 'tree-children'; parent.append(children);
        draw(entry.content || [], children, entryPath);
      }
    }
  };
  draw(state.tree.content || [], root); renderContextFiles();
}
async function refreshTree() { state.tree = await api('/file/tree'); renderTree(); }
function activateTab(key) {
  const current = activeTab(); if (current) current.content = editor.value;
  const tab = state.tabs.find((candidate) => candidate.key === key); if (!tab) return;
  state.activeKey = key; editor.value = tab.content;
  $('#language-status').textContent = tab.fileName.split('.').pop().toUpperCase();
  $('#welcome').classList.add('hidden'); $('#editor-view').classList.remove('hidden');
  updateLines(); updateDirty(); renderTree(); editor.focus();
}
async function openFile(path) {
  const key = pathKey(path);
  if (state.tabs.some((tab) => tab.key === key)) { activateTab(key); return; }
  try {
    const data = await api(pathUrl(path));
    state.tabs.push({ key, path, file_id: data.file_id, fileName: data.fileName, content: data.content ?? '', savedContent: data.content ?? '' });
    activateTab(key);
  } catch (error) { showToast(error.message); }
}
function syncActiveFromEditor() { const tab = activeTab(); if (tab) tab.content = editor.value; }
async function saveFile(tab = activeTab()) {
  if (!tab || tab.content === tab.savedContent || state.saving) return true;
  if (tab === activeTab()) tab.content = editor.value;
  state.saving = true;
  try {
    await api(pathUrl(tab.path), { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: tab.content });
    tab.savedContent = tab.content; updateDirty(); return true;
  } catch (error) {
    $('#save-state').classList.add('error-state'); $('#save-state').lastChild.textContent = ' Save failed'; showToast(error.message); return false;
  } finally { state.saving = false; }
}
async function closeTab(key) {
  const tab = state.tabs.find((item) => item.key === key); if (!tab) return;
  if (tab === activeTab()) tab.content = editor.value;
  if (tab.content !== tab.savedContent) {
    if (confirm(`Save changes to ${tab.fileName} before closing?`)) { if (!await saveFile(tab)) return; }
    else if (!confirm('Discard unsaved changes?')) return;
  }
  const index = state.tabs.indexOf(tab); state.tabs.splice(index, 1);
  if (state.activeKey === key) {
    state.activeKey = null;
    const next = state.tabs[Math.min(index, state.tabs.length - 1)];
    if (next) activateTab(next.key);
    else { $('#editor-view').classList.add('hidden'); $('#welcome').classList.remove('hidden'); updateDirty(); renderTree(); }
  } else { updateDirty(); renderTree(); }
}
editor.addEventListener('input', () => { syncActiveFromEditor(); updateDirty(); updateLines(); });
editor.addEventListener('keydown', (event) => {
  if (event.key === 'Tab') { event.preventDefault(); editor.setRangeText('    ', editor.selectionStart, editor.selectionEnd, 'end'); editor.dispatchEvent(new Event('input')); }
});
editor.addEventListener('keyup', () => {
  const before = editor.value.slice(0, editor.selectionStart).split('\n');
  $('#cursor-status').textContent = `Ln ${before.length}, Col ${before.at(-1).length + 1}`;
});
$('#save-button').addEventListener('click', () => saveFile());
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); saveFile(); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); toggleAI(true); }
});

async function renameEntry(entry, oldPath) {
  const newName = prompt(`Rename ${entry.name} to:`, entry.name)?.trim();
  if (!newName || newName === entry.name) return;
  const url = entry.type === 'file' ? pathUrl(oldPath) : folderUrl(oldPath);
  try {
    await api(url, { method: 'PATCH', headers: { 'Content-Type': 'text/plain' }, body: newName });
    const oldPrefix = pathKey(oldPath);
    for (const tab of state.tabs) {
      if (tab.key === oldPrefix || tab.key.startsWith(`${oldPrefix}/`)) {
        const previousKey = tab.key;
        tab.path[oldPath.length - 1] = newName; tab.key = pathKey(tab.path);
        if (state.activeKey === previousKey) state.activeKey = tab.key;
        if (entry.type === 'file' && tab === state.tabs.find((candidate) => candidate.file_id === entry.file_id)) tab.fileName = newName;
      }
    }
    await refreshTree();
    if (activeTab()) activateTab(state.activeKey);
    showToast('Renamed successfully');
  } catch (error) { showToast(error.message); }
}
async function deleteEntry(entry, path) {
  const label = entry.type === 'file' ? 'file' : 'folder';
  if (!confirm(`Delete ${label} “${entry.name}”?`)) return;
  try {
    await api(entry.type === 'file' ? pathUrl(path) : folderUrl(path), { method: 'DELETE' });
    const prefix = pathKey(path);
    state.tabs = state.tabs.filter((tab) => tab.key !== prefix && !tab.key.startsWith(`${prefix}/`));
    if (!state.tabs.some((tab) => tab.key === state.activeKey)) {
      state.activeKey = null;
      const last = state.tabs.at(-1);
      if (last) activateTab(last.key);
      else { $('#editor-view').classList.add('hidden'); $('#welcome').classList.remove('hidden'); }
    }
    await refreshTree(); updateDirty(); showToast(`${label[0].toUpperCase()}${label.slice(1)} deleted`);
  } catch (error) { showToast(error.message); }
}
$('#new-file').addEventListener('click', async () => {
  const name = prompt('File name (for example, main.py)'); if (!name) return;
  const parent = prompt('Folder path, separated by / (leave blank for project root)') || '';
  try { const path = [...parent.split('/').filter(Boolean), name]; await api(pathUrl(path), { method: 'POST' }); await refreshTree(); await openFile(path); showToast('File created'); }
  catch (error) { showToast(error.message); }
});
$('#new-folder').addEventListener('click', async () => {
  const name = prompt('Folder name'); if (!name) return;
  const parent = prompt('Parent folder path, separated by / (leave blank for project root)') || '';
  try { await api(folderUrl([...parent.split('/').filter(Boolean), name]), { method: 'POST' }); await refreshTree(); showToast('Folder created'); }
  catch (error) { showToast(error.message); }
});
$('#refresh-tree').addEventListener('click', () => refreshTree().catch((error) => showToast(error.message)));

$('#run-button').addEventListener('click', async () => {
  const tab = activeTab(); if (!tab) return;
  tab.content = editor.value;
  const button = $('#run-button'); button.disabled = true; button.classList.add('running');
  $('#output-panel').classList.remove('hidden'); $('#output-file').textContent = tab.path.join('/');
  $('#output-status').textContent = 'Running…'; $('#output-text').textContent = '';
  try {
    if (!await saveFile(tab)) throw new Error('Save the file before running it.');
    const result = await api(`/run/${tab.path.map(encodeURIComponent).join('/')}`, { method: 'POST', body: JSON.stringify({ code: tab.content }) });
    const output = [result.output, result.error].filter(Boolean).join(result.output && result.error ? '\n' : '');
    $('#output-text').textContent = output || '(No output)';
    $('#output-status').textContent = result.timedOut ? 'Timed out' : result.outputLimit ? 'Output limit reached' : result.exitCode === 0 ? 'Finished' : `Exited with code ${result.exitCode}`;
    $('#output-status').className = result.exitCode === 0 && !result.timedOut ? 'output-ok' : 'output-error';
  } catch (error) { $('#output-text').textContent = error.message; $('#output-status').textContent = 'Run failed'; $('#output-status').className = 'output-error'; }
  finally { button.disabled = false; button.classList.remove('running'); }
});
$('#close-output').addEventListener('click', () => $('#output-panel').classList.add('hidden'));
$('#output-toggle').addEventListener('click', () => $('#output-panel').classList.toggle('hidden'));

function toggleAI(open = !$('#ai-panel').classList.contains('open')) {
  $('#ai-panel').classList.toggle('open', open); if (open) setTimeout(() => $('#chat-query').focus(), 210);
}
$('#ai-toggle').addEventListener('click', () => toggleAI()); $('#close-ai').addEventListener('click', () => toggleAI(false));
$('#chat-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const query = $('#chat-query').value.trim(); if (!query) return;
  const button = $('#send-chat'); button.disabled = true; addMessage(query, 'user'); $('#chat-query').value = '';
  try {
    if (!state.chatId) state.chatId = (await api('/ai/createChatLog', { method: 'POST' })).chat_id;
    const file_ids = [...$('#context-files').querySelectorAll('input:checked')].map((input) => {
      const file = collectFiles().find((candidate) => candidate.file_id === input.dataset.id);
      return { fileName: file.name, file_id: file.file_id };
    });
    const result = await api('/ai/chat', { method: 'POST', body: JSON.stringify({ chat_id: state.chatId, file_ids, query }) });
    addMessage(result.message, 'assistant');
  } catch (error) { addMessage(`Something went wrong: ${error.message}`, 'assistant'); }
  finally { button.disabled = false; }
});
function addMessage(text, type) {
  const box = $('#chat-messages'), row = document.createElement('div');
  if (type === 'user') { row.className = 'user-message'; row.textContent = text; }
  else {
    row.className = 'assistant-message'; const avatar = document.createElement('span'); avatar.className = 'message-avatar'; avatar.textContent = '✳';
    const content = document.createElement('div'), paragraph = document.createElement('p'); paragraph.textContent = text; content.append(paragraph); row.append(avatar, content);
  }
  box.append(row); box.scrollTop = box.scrollHeight;
}

function updateSessionControls() {
  const inSession = Boolean(state.session);
  $('#create-session').classList.toggle('hidden', inSession);
  $('#join-session').classList.toggle('hidden', inSession);
  for (const id of ['session-chat-button', 'video-call-button', 'send-code-button', 'received-code-button', 'leave-session']) $(`#${id}`).classList.toggle('hidden', !inSession);
  const code = $('#session-code');
  code.textContent = inSession ? `session · ${state.session.session_id}` : 'workspace';
  code.title = inSession ? 'Click to copy the session code' : 'Workspace';
}
function renderSessionMessages() {
  const messages = $('#session-chat-messages');
  if (!state.session) return;
  const wasAtBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 40;
  messages.replaceChildren();
  if (!state.session.messages.length) {
    const empty = document.createElement('p'); empty.className = 'session-empty'; empty.textContent = 'No messages yet. Start the conversation.'; messages.append(empty);
  }
  for (const item of state.session.messages) {
    const row = document.createElement('article'); row.className = `session-message${item.user_id === state.session.current_user_id ? ' own' : ''}`;
    const title = document.createElement('div'); title.className = 'session-message-title';
    const username = document.createElement('strong'); username.textContent = item.username;
    const time = document.createElement('time'); time.textContent = new Date(item.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const text = document.createElement('p'); text.textContent = item.message;
    title.append(username, time); row.append(title, text); messages.append(row);
  }
  if (wasAtBottom || messages.children.length < 2) messages.scrollTop = messages.scrollHeight;
  $('#session-members-label').textContent = state.session.members.map((member) => member.username).join(' · ');
  $('#video-call-button').textContent = state.session.call_room ? 'Join video call' : 'Video call';
}
async function refreshSession() {
  if (!state.session) return;
  const info = await api(`/session/${encodeURIComponent(state.session.session_id)}`);
  state.session = info; renderSessionMessages();
}
function activateSession(info) {
  state.session = info;
  sessionStorage.setItem('gcode_session_id', info.session_id);
  updateSessionControls(); renderSessionMessages();
  clearInterval(state.sessionTimer);
  state.sessionTimer = setInterval(() => refreshSession().catch(() => {}), 1800);
}
async function createSession() {
  if (state.session) return;
  try {
    const info = await api('/session/create', { method: 'POST' });
    activateSession(await api(`/session/${encodeURIComponent(info.session_id)}`));
    showToast('Session created. Copy the code from the top bar to invite someone.');
  } catch (error) { showToast(error.message); }
}
async function joinSession() {
  const sessionId = prompt('Paste the session code');
  if (!sessionId?.trim()) return;
  if (state.session) { showToast('Leave your current session before joining another.'); return; }
  try {
    const result = await api('/session/join', { method: 'POST', body: JSON.stringify({ session_id: sessionId.trim() }) });
    activateSession(await api(`/session/${encodeURIComponent(result.session_id)}`));
    showToast('Joined session');
  } catch (error) { showToast(error.message); }
}
async function leaveSession() {
  if (!state.session) return;
  try { await api(`/session/${encodeURIComponent(state.session.session_id)}/leave`, { method: 'POST' }); }
  catch (error) { showToast(error.message); }
  clearInterval(state.sessionTimer); state.sessionTimer = null; state.session = null;
  if (state.jitsiApi) closeVideoCall();
  sessionStorage.removeItem('gcode_session_id'); updateSessionControls();
  $('#session-chat-modal').classList.add('hidden'); $('#send-code-modal').classList.add('hidden'); $('#received-code-modal').classList.add('hidden');
}
function openModal(id) { $(`#${id}`).classList.remove('hidden'); }
document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', () => $(`#${button.dataset.closeModal}`).classList.add('hidden')));
$('#create-session').addEventListener('click', createSession);
$('#join-session').addEventListener('click', joinSession);
$('#leave-session').addEventListener('click', leaveSession);
$('#session-code').addEventListener('click', async () => {
  if (!state.session) return;
  try { await navigator.clipboard.writeText(state.session.session_id); showToast('Session code copied'); }
  catch { prompt('Copy this session code:', state.session.session_id); }
});
$('#session-chat-button').addEventListener('click', async () => {
  if (!state.session) return;
  try { await refreshSession(); openModal('session-chat-modal'); }
  catch (error) { showToast(error.message); }
});
$('#session-chat-form').addEventListener('submit', async (event) => {
  event.preventDefault(); if (!state.session) return;
  const input = $('#session-chat-input'), message = input.value.trim(); if (!message) return;
  const button = event.submitter; if (button) button.disabled = true;
  try {
    await api(`/session/${encodeURIComponent(state.session.session_id)}/chat`, { method: 'POST', body: JSON.stringify({ message }) });
    input.value = ''; await refreshSession();
  } catch (error) { showToast(error.message); }
  finally { if (button) button.disabled = false; }
});
$('#send-code-button').addEventListener('click', () => {
  if (!state.session) return;
  const recipients = $('#session-recipient-list'); recipients.replaceChildren();
  for (const member of state.session.members.filter((item) => item.user_id !== state.session.current_user_id)) {
    const label = document.createElement('label'); label.className = 'picker-row';
    const input = document.createElement('input'); input.type = 'checkbox'; input.value = member.user_id; input.name = 'recipient';
    const name = document.createElement('span'); name.textContent = member.username;
    label.append(input, name); recipients.append(label);
  }
  const filesNode = $('#session-file-list'); filesNode.replaceChildren();
  const files = collectFiles();
  for (const file of files) {
    const label = document.createElement('label'); label.className = 'picker-row';
    const input = document.createElement('input'); input.type = 'checkbox'; input.value = file.file_id; input.name = 'shared-file';
    const name = document.createElement('span'); name.textContent = file.path.join('/');
    label.append(input, name); filesNode.append(label);
  }
  if (!recipients.children.length) recipients.textContent = 'No other users have joined yet.';
  if (!files.length) filesNode.textContent = 'No files in your workspace yet.';
  $('#share-status').textContent = '';
  openModal('send-code-modal');
});
$('#confirm-send-code').addEventListener('click', async () => {
  if (!state.session) return;
  const recipients = [...document.querySelectorAll('input[name="recipient"]:checked')].map((input) => input.value);
  const file_ids = [...document.querySelectorAll('input[name="shared-file"]:checked')].map((input) => input.value);
  const button = $('#confirm-send-code'); button.disabled = true; $('#share-status').textContent = 'Sending…';
  try {
    const result = await api(`/session/${encodeURIComponent(state.session.session_id)}/send-code`, { method: 'POST', body: JSON.stringify({ recipients, file_ids }) });
    $('#send-code-modal').classList.add('hidden'); showToast(`Sent ${result.file_count} file(s) to ${result.recipient_count} user(s)`);
  } catch (error) { $('#share-status').textContent = error.message; }
  finally { button.disabled = false; }
});
$('#received-code-button').addEventListener('click', async () => {
  if (!state.session) return;
  try {
    const { deliveries } = await api(`/session/${encodeURIComponent(state.session.session_id)}/received`);
    const list = $('#received-code-list'); list.replaceChildren();
    if (!deliveries.length) list.textContent = 'No code has been shared with you yet.';
    for (const delivery of deliveries) {
      const card = document.createElement('article'); card.className = 'delivery-card';
      const heading = document.createElement('h3'); heading.textContent = `${delivery.sender_name} shared code`;
      const date = document.createElement('time'); date.textContent = new Date(delivery.sent_at).toLocaleString(); card.append(heading, date);
      for (const file of delivery.files) {
        const fileTitle = document.createElement('h4'); fileTitle.textContent = file.fileName;
        const code = document.createElement('pre'); code.textContent = file.content; card.append(fileTitle, code);
      }
      list.append(card);
    }
    openModal('received-code-modal');
  } catch (error) { showToast(error.message); }
});

function loadJitsiApi() {
  if (window.JitsiMeetExternalAPI) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://meet.jit.si/external_api.js';
    script.onload = resolve; script.onerror = () => reject(new Error('Could not load Jitsi Meet'));
    document.head.append(script);
  });
}
$('#video-call-button').addEventListener('click', async () => {
  if (!state.session) return;
  if (state.jitsiApi) { $('#video-call-modal').classList.remove('hidden'); return; }
  try {
    const { room_name } = await api(`/session/${encodeURIComponent(state.session.session_id)}/call`, { method: 'POST' });
    state.session.call_room = room_name; $('#video-call-button').textContent = 'Join video call';
    await loadJitsiApi();
    $('#video-call-modal').classList.remove('hidden');
    const currentMember = state.session.members.find((member) => member.user_id === state.session.current_user_id);
    state.jitsiApi = new window.JitsiMeetExternalAPI('meet.jit.si', {
      roomName: room_name, parentNode: $('#jitsi-container'), width: '100%', height: '100%',
      userInfo: { displayName: currentMember?.username || 'gcode user' },
    });
  } catch (error) { showToast(error.message); }
});
function closeVideoCall() {
  if (state.jitsiApi) { state.jitsiApi.dispose(); state.jitsiApi = null; }
  $('#jitsi-container').replaceChildren(); $('#video-call-modal').classList.add('hidden');
}
$('#close-video-call').addEventListener('click', closeVideoCall);
$('#video-call-modal').addEventListener('click', (event) => { if (event.target.id === 'video-call-modal') closeVideoCall(); });

async function saveAllOpenFiles() {
  syncActiveFromEditor();
  for (const tab of state.tabs) if (tab.content !== tab.savedContent && !await saveFile(tab)) return false;
  return true;
}
async function openGitLibrary() {
  try {
    const { snapshots } = await api('/git');
    const list = $('#git-snapshot-list'); list.replaceChildren();
    if (!snapshots.length) list.textContent = 'No saved snapshots yet. Push your workspace to git to create one.';
    for (const snapshot of snapshots) {
      const card = document.createElement('article'); card.className = 'git-snapshot';
      const header = document.createElement('div'); header.className = 'git-snapshot-head';
      const title = document.createElement('div');
      const owner = document.createElement('strong'); owner.textContent = snapshot.owner_username;
      const stamp = document.createElement('time'); stamp.textContent = new Date(snapshot.created_at).toLocaleString();
      title.append(owner, stamp);
      const count = document.createElement('span'); count.textContent = `${snapshot.file_count} file${snapshot.file_count === 1 ? '' : 's'}`;
      header.append(title, count); card.append(header);
      const pathList = document.createElement('p'); pathList.className = 'git-file-list'; pathList.textContent = snapshot.files.slice(0, 8).join(' · ') || 'Empty workspace'; card.append(pathList);
      const actions = document.createElement('div'); actions.className = 'git-snapshot-actions';
      if (snapshot.can_manage && state.session) {
        const share = document.createElement('button'); share.className = 'session-button'; share.textContent = 'Share with session';
        share.addEventListener('click', () => renderSnapshotSharing(card, snapshot)); actions.append(share);
      }
      const copy = document.createElement('button'); copy.className = 'session-button primary-outline'; copy.textContent = 'Copy root';
      copy.addEventListener('click', () => copySnapshot(snapshot)); actions.append(copy); card.append(actions); list.append(card);
    }
    openModal('git-library-modal');
  } catch (error) { showToast(error.message); }
}
function renderSnapshotSharing(card, snapshot) {
  card.querySelector('.snapshot-sharing')?.remove();
  const panel = document.createElement('section'); panel.className = 'snapshot-sharing';
  const intro = document.createElement('p'); intro.textContent = 'Select session members who can see this snapshot:'; panel.append(intro);
  const selected = new Set(snapshot.access_user_ids || []);
  for (const member of state.session.members.filter((item) => item.user_id !== state.session.current_user_id)) {
    const label = document.createElement('label'); label.className = 'picker-row';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = member.user_id; checkbox.checked = selected.has(member.user_id);
    const name = document.createElement('span'); name.textContent = member.username;
    label.append(checkbox, name); panel.append(label);
  }
  const save = document.createElement('button'); save.className = 'session-button'; save.textContent = 'Save access';
  save.addEventListener('click', async () => {
    const user_ids = [...panel.querySelectorAll('input:checked')].map((input) => input.value);
    try {
      const result = await api(`/git/${encodeURIComponent(snapshot.snapshot_id)}/access`, { method: 'PUT', body: JSON.stringify({ session_id: state.session.session_id, user_ids }) });
      snapshot.access_user_ids = result.access_user_ids; panel.remove(); showToast('Snapshot access updated');
    } catch (error) { showToast(error.message); }
  });
  panel.append(save); card.append(panel);
}
async function copySnapshot(snapshot) {
  if (!await saveAllOpenFiles()) { showToast('Save your open files before copying a root.'); return; }
  await refreshTree();
  const needsBackup = state.tree.content.length > 0;
  const backupName = needsBackup ? prompt('Name a folder where your current files will be saved (letters and numbers only):') : '';
  if (needsBackup && !backupName?.trim()) return;
  if (!confirm(`Copy ${snapshot.owner_username}'s saved root into your workspace? Your current files will be kept${needsBackup ? ` in “${backupName.trim()}”` : ''}.`)) return;
  try {
    const result = await api(`/git/${encodeURIComponent(snapshot.snapshot_id)}/copy-root`, { method: 'POST', body: JSON.stringify({ backup_name: backupName?.trim() || '' }) });
    if (result.backup_name) {
      for (const tab of state.tabs) {
        const previousKey = tab.key; tab.path = [result.backup_name, ...tab.path]; tab.key = pathKey(tab.path);
        if (state.activeKey === previousKey) state.activeKey = tab.key;
      }
    }
    await refreshTree(); if (activeTab()) activateTab(state.activeKey); updateDirty();
    $('#git-library-modal').classList.add('hidden');
    showToast(`Copied into “${result.copied_folder}”`);
  } catch (error) { showToast(error.message); }
}
$('#open-git-button').addEventListener('click', openGitLibrary);
$('#push-git-button').addEventListener('click', async () => {
  if (!await saveAllOpenFiles()) { showToast('Save your open files before pushing.'); return; }
  try {
    const { snapshot } = await api('/git/push', { method: 'POST' });
    showToast('Workspace pushed to your private git'); await openGitLibrary();
    $('#git-snapshot-list').scrollTop = 0; void snapshot;
  } catch (error) { showToast(error.message); }
});

$('#logout').addEventListener('click', async () => {
  if (state.tabs.some((tab) => tab.content !== tab.savedContent) && !confirm('Sign out and discard unsaved changes?')) return;
  if (state.session) await leaveSession();
  sessionStorage.removeItem('gcode_token'); state.token = null; state.tabs = []; state.activeKey = null; state.tree = null; state.chatId = null;
  app.classList.add('hidden'); auth.classList.remove('hidden');
});
async function enterWorkspace() {
  auth.classList.add('hidden'); app.classList.remove('hidden'); await refreshTree();
  const savedSessionId = sessionStorage.getItem('gcode_session_id');
  if (savedSessionId) {
    try { activateSession(await api(`/session/${encodeURIComponent(savedSessionId)}`)); }
    catch { sessionStorage.removeItem('gcode_session_id'); updateSessionControls(); }
  } else updateSessionControls();
}
if (state.token) enterWorkspace().catch(() => { sessionStorage.removeItem('gcode_token'); state.token = null; auth.classList.remove('hidden'); app.classList.add('hidden'); });
