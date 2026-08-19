const app = document.querySelector('#app');

const KEY = 'nibhir-messenger-v2';
const randomCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const defaultState = {
  profile: { name: 'Guest' },
  rooms: [{ id: 'welcome', name: 'Welcome Room', code: 'WELCOME', messages: [] }],
  activeRoom: 'welcome',
  theme: 'dark'
};

function load() {
  try { return { ...defaultState, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return structuredClone(defaultState); }
}
let state = load();

function save() { localStorage.setItem(KEY, JSON.stringify(state)); }
function room() { return state.rooms.find(r => r.id === state.activeRoom) || state.rooms[0]; }
function esc(v='') { return v.replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function time(ts) { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }

function render() {
  const r = room();
  document.documentElement.dataset.theme = state.theme;
  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <button class="menu" data-action="rooms">☰</button>
        <div class="brand"><span class="logo">N</span><div><b>Nibhir</b><small>Private room chat</small></div></div>
        <div class="top-actions"><span class="status"><i></i> Ready</span><button class="icon" data-action="theme" title="Toggle theme">☾</button></div>
      </header>
      <div class="layout">
        <aside id="sidebar" class="sidebar">
          <div class="side-head"><div><small>ROOMS</small><h2>Your chats</h2></div><button class="icon" data-action="new-room">＋</button></div>
          <label class="search">⌕ <input id="roomSearch" placeholder="Search rooms" /></label>
          <div class="rooms" id="rooms">${state.rooms.map(x => `<button class="room ${x.id===r.id?'active':''}" data-room="${x.id}"><span>${esc(x.name.slice(0,1).toUpperCase())}</span><div><b>${esc(x.name)}</b><small>${x.messages.length ? esc(x.messages.at(-1).text || 'Attachment') : 'No messages yet'}</small></div></button>`).join('')}</div>
          <div class="tip"><b>No login required</b><p>Create a room and share its code. Realtime internet chat will be connected in the next backend step.</p></div>
        </aside>
        <main class="chat">
          <div class="chat-head"><div class="avatar">${esc(r.name.slice(0,1).toUpperCase())}</div><div class="room-title"><b>${esc(r.name)}</b><small>Room code: <strong>${esc(r.code)}</strong></small></div><button class="code" data-action="copy">Copy code</button></div>
          <div class="notice">🔒 <span>This is a login-free room. Keep your room code private if you want the conversation to stay limited to invited people.</span></div>
          <section class="messages" id="messages">
            ${r.messages.length ? r.messages.map(m => `<article class="msg ${m.mine?'mine':''}" data-id="${m.id}"><div class="bubble"><div class="meta"><b>${esc(m.name)}</b><span>${time(m.ts)}</span></div><div class="text">${esc(m.text)}</div><div class="actions"><button data-msg="edit">Edit</button><button data-msg="copy">Copy</button><button data-msg="delete">Delete</button></div></div></article>`).join('') : `<div class="empty"><div>✦</div><h3>Start a conversation</h3><p>Send a message or share this room code with someone you trust.</p></div>`}
          </section>
          <form class="composer" id="composer"><button type="button" class="attach" title="Attachment">＋</button><input id="message" autocomplete="off" placeholder="Write a message…" maxlength="4000" /><button class="send" title="Send">↑</button></form>
          <div class="composer-foot"><span>Enter to send · Shift+Enter for a new line</span><button type="button" data-action="profile">Name: ${esc(state.profile.name)}</button></div>
        </main>
      </div>
      <div class="modal hidden" id="modal"><div class="card"><button class="close" data-action="close">×</button><small>NEW ROOM</small><h2>Create or join</h2><p>Use a short room code instead of an account.</p><form id="roomForm"><label>Room name<input name="name" maxlength="32" required placeholder="Friends"></label><button class="primary">Create room</button></form><div class="or">or join an existing room</div><form id="joinForm"><label>Room code<input name="code" maxlength="8" required placeholder="ABC123"></label><button class="secondary">Join room</button></form><p id="error" class="error"></p></div></div>
    </div>`;
}

function openModal() { document.querySelector('#modal')?.classList.remove('hidden'); }
function closeModal() { document.querySelector('#modal')?.classList.add('hidden'); }

app.addEventListener('click', async e => {
  const roomBtn = e.target.closest('[data-room]');
  if (roomBtn) { state.activeRoom = roomBtn.dataset.room; save(); render(); return; }
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'new-room') openModal();
  if (action === 'close') closeModal();
  if (action === 'rooms') document.querySelector('#sidebar')?.classList.toggle('open');
  if (action === 'theme') { state.theme = state.theme === 'dark' ? 'light' : 'dark'; save(); render(); }
  if (action === 'copy') { await navigator.clipboard?.writeText(room().code); e.target.textContent='Copied'; setTimeout(()=>render(),900); }
  if (action === 'profile') {
    const name = prompt('Display name (not a login):', state.profile.name);
    if (name?.trim()) { state.profile.name = name.trim().slice(0,32); save(); render(); }
  }
  const msgAction = e.target.closest('[data-msg]')?.dataset.msg;
  const msgEl = e.target.closest('[data-id]');
  if (msgAction && msgEl) {
    const m = room().messages.find(x => x.id === msgEl.dataset.id); if (!m) return;
    if (msgAction === 'delete') room().messages = room().messages.filter(x => x.id !== m.id);
    if (msgAction === 'copy') await navigator.clipboard?.writeText(m.text);
    if (msgAction === 'edit') { const next = prompt('Edit message:', m.text); if (next !== null) m.text = next.trim().slice(0,4000); }
    save(); render();
  }
});

app.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.id === 'composer') {
    const input = document.querySelector('#message'); const text = input.value.trim(); if (!text) return;
    room().messages.push({ id: uid(), name: state.profile.name, text, ts: Date.now(), mine: true }); save(); render(); setTimeout(()=>document.querySelector('#message')?.focus(),0); return;
  }
  if (e.target.id === 'roomForm') {
    const name = new FormData(e.target).get('name').trim(); const r = { id: uid(), name, code: randomCode(), messages: [] }; state.rooms.unshift(r); state.activeRoom = r.id; save(); closeModal(); render(); return;
  }
  if (e.target.id === 'joinForm') {
    const code = String(new FormData(e.target).get('code')).trim().toUpperCase(); const r = state.rooms.find(x => x.code === code);
    if (!r) { document.querySelector('#error').textContent = 'This room is not stored on this device yet. Internet room sync will be added in the realtime step.'; return; }
    state.activeRoom = r.id; save(); closeModal(); render();
  }
});

render();
