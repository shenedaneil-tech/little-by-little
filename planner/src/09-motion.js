// Motion: animation toggle, plant growth, scene animation and celebrations
document.addEventListener('visibilitychange', () => {
  document.documentElement?.toggleAttribute?.('data-paused', document.visibilityState === 'hidden');
  if (document.visibilityState === 'hidden') stopNearbyWatch();
  else if (nearbyEnabled) startNearbyWatch();
});

function syncMotionButtons() {
  document.querySelectorAll('.motion-toggle').forEach(b => {
    b.textContent = motionEnabled ? 'Pause animations' : 'Turn animations on';
    b.setAttribute('aria-pressed', String(motionEnabled));
  });
}
function toggleMotion() {
  if (!motionEnabled && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    toast('Your device’s Reduce Motion setting is on. Animations will stay paused.');
    return;
  }
  motionEnabled = !motionEnabled;
  try {
    localStorage.setItem('lbl-motion', motionEnabled ? 'on' : 'off');
  } catch {}
  document.documentElement.dataset.motion = motionEnabled ? 'on' : 'off';
  syncMotionButtons();
  if (!motionEnabled) document.querySelectorAll('.celebration').forEach(e => e.remove());
}
function settleGrowth() {
  const go = (el, key) => {
      if (!el) return;
      const to = el.dataset[key + 'To'];
      if (el.dataset[key] === to) return;
      if (!motionEnabled) {
        el.dataset[key] = to;
        return;
      }
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (el.isConnected) el.dataset[key] = to;
        })
      );
    },
    plant = $('.plant'),
    seg = $('.energy');
  go(plant, 'stage');
  go(seg, 'pos');
  if (plant) lastStage = Number(plant.dataset.stageTo);
  if (seg) lastEnergyPos = Number(seg.dataset.posTo);
  if (lastCompleted)
    setTimeout(() => {
      lastCompleted = null;
    }, 50);
}
function animateScene() {
  syncMotionButtons();
  settleGrowth();
  if (!motionEnabled) return;
  const root = $('#view');
  if (lastAnimatedView !== view) {
    root.classList.remove('enter-scene');
    requestAnimationFrame(() => root.classList.add('enter-scene'));
    lastAnimatedView = view;
    clearTimeout(window.sceneTimer);
    window.sceneTimer = setTimeout(() => root.classList.remove('enter-scene'), 1100);
  }
}
function celebrate(point) {
  if (!motionEnabled || document.visibilityState === 'hidden') return;
  const layer = document.createElement('div');
  layer.className = 'celebration';
  layer.setAttribute('aria-hidden', 'true');
  const x = point?.x ?? window.innerWidth / 2,
    y = Math.max(30, Math.min(window.innerHeight - 100, point?.y ?? window.innerHeight * 0.4));
  for (let i = 0; i < 18; i++) {
    const petal = document.createElement('span');
    petal.className = 'celebration-petal';
    const angle = (i / 18) * Math.PI * 2,
      distance = 55 + Math.random() * 55;
    petal.style.cssText =
      'left:' +
      x +
      'px;top:' +
      y +
      'px;--dx:' +
      Math.cos(angle) * distance +
      'px;--dy:' +
      (Math.sin(angle) * distance + 25) +
      'px;--rot:' +
      (Math.random() * 380 - 190) +
      'deg;--delay:' +
      Math.random() * 65 +
      'ms;background:' +
      ['#b99bd7', '#e7b28d', '#aec49b', '#edd29d', '#d6b6df'][i % 5];
    layer.appendChild(petal);
  }
  document.body.appendChild(layer);
  document.documentElement.classList.add('is-celebrating');
  clearTimeout(window.flourishTimer);
  window.flourishTimer = setTimeout(
    () => document.documentElement.classList.remove('is-celebrating'),
    1100
  );
  setTimeout(() => layer.remove(), 1400);
}
syncMotionButtons();
