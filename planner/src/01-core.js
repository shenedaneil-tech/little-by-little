// Core: helpers, app state, saving, undo and toast messages
const $ = s => document.querySelector(s),
  esc = s =>
    String(s ?? '').replace(
      /[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = dayKey();
let date = today,
  view = 'today',
  history = [],
  running = null,
  elapsed = 0;
let livePosition = null,
  liveEtas = {},
  locationWatch = null,
  nearbyEnabled = false,
  routeBusy = false,
  lastRouteAt = 0,
  lastRoutePosition = null,
  routeGeneration = 0,
  nearbyMessage = '',
  replanQueued = false;
let motionEnabled = true,
  lastAnimatedView = null,
  lastStage = 0,
  lastEnergyPos = -1,
  lastCompleted = null;
try {
  motionEnabled =
    localStorage.getItem('lbl-motion') !== 'off' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
} catch {}
document.documentElement.dataset.motion = motionEnabled ? 'on' : 'off';
const defaults = {
  tasks: [],
  events: [],
  energy: 'medium',
  start: '09:00',
  end: '21:00',
  buffer: 10,
  dump: '',
  notify: false,
  startingAddress: '',
  startingCoords: null
};
let cloudReady = false,
  cloudRevision = 0,
  cloudTimer,
  cloudBusy = false,
  cloudDirty = false,
  cloudBlocked = false,
  lastQueued = '',
  cloudUser = '';
let state;
try {
  state = { ...defaults, ...JSON.parse(localStorage.getItem('lbl-v1') || '{}') };
} catch {
  state = { ...defaults };
}
let lastLocal = JSON.stringify(state);
const save = () => {
  try {
    const serialized = JSON.stringify(state);
    if (serialized !== lastLocal && !cloudReady) localStorage.setItem('lbl-cloud-pending', '1');
    lastLocal = serialized;
    localStorage.setItem('lbl-v1', serialized);
    $('#saved').textContent = cloudReady ? 'Saving…' : 'Loading saved planner…';
  } catch {
    $('#saved').textContent = 'Storage full — export a backup';
  }
  if (cloudReady) queueCloud();
};
const snapshot = () => {
  history.push(JSON.stringify(state));
  if (history.length > 30) history.shift();
};
function undo() {
  if (!history.length) return toast('No changes to undo yet.');
  state = JSON.parse(history.pop());
  save();
  render();
  toast('Last change undone.');
}
function toast(t) {
  const el = $('#toast');
  el.textContent = t;
  el.classList.add('hidden');
  void el.offsetWidth;
  el.classList.remove('hidden');
  clearTimeout(window.tt);
  window.tt = setTimeout(() => el.classList.add('hidden'), 4500);
}
const mins = t => Number(t.split(':')[0]) * 60 + Number(t.split(':')[1]),
  clock = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`,
  pretty = m =>
    new Date(2000, 0, 1, Math.floor(m / 60), m % 60).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit'
    });
