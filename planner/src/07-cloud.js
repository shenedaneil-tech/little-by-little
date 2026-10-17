// Startup and account sync: first render, saving to the cloud, recovery
document.querySelectorAll('nav button').forEach(
  b =>
    (b.onclick = () => {
      view = b.dataset.view;
      render();
      window.scrollTo({ top: 0, behavior: 'instant' });
    })
);
render();
bootCloud();

function cloudStatus(text) {
  $('#saved').textContent = text;
}
function queueCloud() {
  const payload = JSON.stringify(state);
  if (payload === lastQueued) {
    if (!cloudDirty && !cloudBusy) cloudStatus('Saved to your account ✓');
    return;
  }
  lastQueued = payload;
  cloudDirty = true;
  try {
    plannerStorage.setItem('lbl-cloud-pending', '1');
  } catch {}
  cloudStatus('Saving…');
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(pushCloud, 650);
}
async function pushCloud() {
  if (!cloudReady || cloudBusy || !cloudDirty || cloudBlocked) return;
  cloudBusy = true;
  cloudDirty = false;
  const payload = lastQueued;
  try {
    const r = await fetch('/api/planner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: JSON.parse(payload), revision: cloudRevision })
    });
    const data = await r.json();
    if (r.status === 409) {
      cloudBlocked = true;
      cloudDirty = true;
      cloudStatus('Changed elsewhere · click to resolve');
      toast('Another tab or device updated your planner. Click the save status to resolve.');
      return;
    }
    if (!r.ok) throw Error(data.error || 'Save failed');
    cloudRevision = data.revision;
    try {
      plannerStorage.setItem('lbl-cloud-revision', String(cloudRevision));
      if (!cloudDirty) plannerStorage.removeItem('lbl-cloud-pending');
    } catch {}
    cloudStatus(cloudDirty ? 'Saving…' : 'Saved to your account ✓');
  } catch (e) {
    cloudDirty = true;
    cloudStatus('Not synced · click to retry');
    toast('Couldn’t sync yet. Your device copy is safe.');
  } finally {
    cloudBusy = false;
    if (cloudDirty && !cloudBlocked && $('#saved').textContent === 'Saving…')
      setTimeout(pushCloud, 100);
  }
}
async function bootCloud() {
  cloudStatus('Loading your saved planner…');
  document.body.classList.add('sync-loading');
  try {
    const r = await fetch('/api/planner', { cache: 'no-store' });
    const data = await r.json();
    if (!r.ok) throw Error(data.error);
    cloudRevision = data.revision;
    cloudUser = data.userKey;
    const marker = 'lbl-migrated-' + cloudUser;
    const localPending = plannerStorage.getItem('lbl-cloud-pending') === '1',
      localRevision = Number(plannerStorage.getItem('lbl-cloud-revision') || 0);
    let needsSave = false;
    if (data.state) {
      if (localPending && localRevision === cloudRevision) {
        needsSave = true;
      } else {
        const old = state;
        state = { ...defaults, ...data.state };
        if (!plannerStorage.getItem(marker)) {
          for (const kind of ['tasks', 'events'])
            for (const item of old[kind])
              if (!state[kind].some(t => t.id === item.id)) {
                state[kind].push(item);
                needsSave = true;
              }
          if (old.dump && old.dump !== state.dump) {
            state.dump = [state.dump, old.dump].filter(Boolean).join('\n');
            needsSave = true;
          }
        } else if (localPending) {
          plannerStorage.setItem('lbl-recovery-copy', JSON.stringify(old));
          toast(
            'Loaded your latest account planner. An unsynced device copy is available in My rhythm.'
          );
        }
      }
    } else needsSave = true;
    plannerStorage.setItem(marker, '1');
    plannerStorage.setItem('lbl-cloud-revision', String(cloudRevision));
    cloudReady = true;
    lastQueued = needsSave ? '' : JSON.stringify(state);
    if (!needsSave) plannerStorage.removeItem('lbl-cloud-pending');
    render();
    if (needsSave) queueCloud();
    else cloudStatus('Saved to your account ✓');
  } catch (e) {
    cloudStatus('Offline copy · click to retry');
    toast(
      'Couldn’t load your account planner. Your device copy is available. Changes will stay here until you reconnect.'
    );
  } finally {
    document.body.classList.remove('sync-loading');
    if (cloudReady && plannerStorage.getItem('lbl-nearby-enabled') === '1') {
      nearbyEnabled = true;
      startNearbyWatch();
      render();
    }
  }
}
$('#saved').style.cursor = 'pointer';
$('#saved').setAttribute('role', 'button');
$('#saved').tabIndex = 0;
$('#saved').onclick = () => {
  if (cloudBlocked) {
    open(
      '<h2>Your planner changed elsewhere</h2><p class="help">To protect your saved tasks, this tab has stopped syncing. Download your current device copy, then load the latest account planner. Your current copy will also be kept in recovery.</p><div class="dialog-actions"><button onclick="backup()">Download this copy</button><button class="primary" onclick="resolveCloud()">Load latest saved planner</button></div>'
    );
  } else if (!cloudReady) bootCloud();
  else if (cloudDirty) pushCloud();
  else toast('Your planner is saved to your account.');
};
$('#saved').onkeydown = e => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    $('#saved').click();
  }
};
function resolveCloud() {
  try {
    plannerStorage.setItem('lbl-recovery-copy', JSON.stringify(state));
    plannerStorage.removeItem('lbl-cloud-pending');
  } catch {}
  cloudBlocked = false;
  cloudDirty = false;
  cloudReady = false;
  closeModal();
  bootCloud();
}
window.addEventListener('online', () => {
  if (cloudReady) pushCloud();
  else bootCloud();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') pushCloud();
});
window.addEventListener('beforeunload', e => {
  if (cloudDirty || cloudBusy) {
    e.preventDefault();
    e.returnValue = '';
  }
});
function recovery() {
  const copy = plannerStorage.getItem('lbl-recovery-copy');
  if (copy) download(copy, 'little-by-little-recovery.json', 'application/json');
  else toast('No recovery copy is needed right now.');
}
