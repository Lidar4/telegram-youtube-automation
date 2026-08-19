import './style.css';

const app = document.querySelector('#app');
const roomCode = Math.floor(100000 + Math.random() * 900000).toString();

app.innerHTML = `
  <main class="shell">
    <header class="topbar">
      <div>
        <h1>Free Messenger</h1>
        <p>No login • Room based • Internet chat</p>
      </div>
      <button id="newRoom">New Room</button>
    </header>

    <section class="room-card">
      <span>Your room</span>
      <strong id="roomCode">${roomCode}</strong>
      <button id="copyRoom">Copy code</button>
    </section>

    <section class="chat" aria-label="Chat">
      <div id="messages" class="messages">
        <div class="empty">Room code share করে একজনকে যুক্ত করুন।</div>
      </div>
      <form id="composer" class="composer">
        <input id="messageInput" autocomplete="off" placeholder="Message লিখুন..." />
        <button type="submit">Send</button>
      </form>
    </section>

    <p id="status" class="status">Offline prototype — realtime backend connection পরের ধাপে যোগ হবে।</p>
  </main>
`;

const messages = document.querySelector('#messages');
const input = document.querySelector('#messageInput');

function addMessage(text, mine = true) {
  const empty = messages.querySelector('.empty');
  if (empty) empty.remove();
  const item = document.createElement('div');
  item.className = `message ${mine ? 'mine' : 'theirs'}`;
  item.textContent = text;
  messages.appendChild(item);
  messages.scrollTop = messages.scrollHeight;
}

document.querySelector('#composer').addEventListener('submit', (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  addMessage(text);
  input.value = '';
});

document.querySelector('#copyRoom').addEventListener('click', async () => {
  await navigator.clipboard?.writeText(roomCode);
  document.querySelector('#status').textContent = `Room ${roomCode} copied.`;
});

document.querySelector('#newRoom').addEventListener('click', () => location.reload());
