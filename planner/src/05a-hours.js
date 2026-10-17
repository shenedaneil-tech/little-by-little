// Opening hours: the "Any time / Set hours / Closed today" control in the task form,
// plus remembering the hours you used for each place.
const HOURS_PRESETS = [
  { label: '9 – 5', opens: '09:00', closes: '17:00' },
  { label: '9 – 9', opens: '09:00', closes: '21:00' },
  { label: '10 – 8', opens: '10:00', closes: '20:00' },
  { label: '8 – 10', opens: '08:00', closes: '22:00' }
];
const MAX_REMEMBERED_PLACES = 200;
const validClock = v => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

// A place's name, lower-cased and tidied, so "Target " and "target" count as the same place.
function placeKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

// Which choice a task is on: closed wins over hours, hours win over "any time".
function hoursMode(t) {
  return t.closed ? 'closed' : t.opens || t.closes ? 'set' : 'any';
}

// Returns a message when the hours can't be saved, or '' when they're fine.
function validateHours(mode, opens, closes) {
  if (mode !== 'set') return '';
  if (!opens && !closes) return 'Pick the opening and closing times, or choose “Any time”.';
  if (opens && closes && mins(closes) <= mins(opens))
    return 'Closing time must follow opening time.';
  return '';
}

// Reads the hours choice out of the task form. Times only count when "Set hours" is chosen.
function hoursFromForm(f) {
  const mode = f.get('hoursMode') || 'any';
  const set = mode === 'set';
  return {
    mode,
    opens: set ? f.get('opens') || '' : '',
    closes: set ? f.get('closes') || '' : '',
    closed: mode === 'closed',
    noHours: mode === 'any'
  };
}

// Remembers (or, with no times, forgets) the hours for a place. The most recent places are kept.
function rememberHours(key, opens, closes) {
  if (!key) return;
  if (!state.placeHours || typeof state.placeHours !== 'object') state.placeHours = {};
  delete state.placeHours[key];
  if (validClock(opens) || validClock(closes))
    state.placeHours[key] = {
      opens: validClock(opens) ? opens : '',
      closes: validClock(closes) ? closes : ''
    };
  const keys = Object.keys(state.placeHours);
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_REMEMBERED_PLACES)))
    delete state.placeHours[old];
}

// The hours last used for a place, or null. Ignores anything that isn't a valid time.
function recallHours(key) {
  const saved = key && state.placeHours && state.placeHours[key];
  if (!saved || !(validClock(saved.opens) || validClock(saved.closes))) return null;
  return {
    opens: validClock(saved.opens) ? saved.opens : '',
    closes: validClock(saved.closes) ? saved.closes : ''
  };
}

function hoursBlockHtml(t) {
  const mode = hoursMode(t);
  const option = (value, label) =>
    `<label class="seg-opt"><input type="radio" name="hoursMode" value="${value}" ${mode === value ? 'checked' : ''}><span>${label}</span></label>`;
  return `<fieldset class="hours" id="hours-block" ${t.location || mode !== 'any' ? '' : 'hidden'}><legend>Opening hours</legend><p class="help">For this visit day. Hours aren’t looked up for you, so check the store.</p><div class="seg" role="radiogroup" aria-label="Opening hours">${option('any', 'Any time')}${option('set', 'Set hours')}${option('closed', 'Closed today')}</div><div id="hours-set" ${mode === 'set' ? '' : 'hidden'}><div class="chips">${HOURS_PRESETS.map((p, i) => `<button type="button" class="chip" data-preset="${i}">${p.label}</button>`).join('')}</div><div class="fields"><div><label>Opens</label><input type="time" name="opens" value="${esc(t.opens || '')}"></div><div><label>Closes</label><input type="time" name="closes" value="${esc(t.closes || '')}"></div></div></div><p id="hours-msg" class="help" role="status" aria-live="polite"></p></fieldset>`;
}

// Wires up the hours control inside the open task form.
function setupHours() {
  const form = $('#taskform'),
    block = $('#hours-block'),
    setBox = $('#hours-set'),
    msg = $('#hours-msg'),
    address = $('#address'),
    opens = form.elements.opens,
    closes = form.elements.closes;
  const mode = () => (form.querySelector('input[name=hoursMode]:checked') || {}).value || 'any';
  let touched = mode() !== 'any';

  // Shows the right fields, and a gentle message only once both times are filled in and clash.
  function refresh(note) {
    setBox.hidden = mode() !== 'set';
    const clash = opens.value && closes.value ? validateHours(mode(), opens.value, closes.value) : '';
    msg.textContent = clash || note || '';
    msg.classList.toggle('problem', !!clash);
  }
  // Used when saving: shows the message and puts the cursor where the fix is needed.
  setupHours.showProblem = text => {
    msg.textContent = text;
    msg.classList.add('problem');
    block.hidden = false;
    (mode() === 'set' ? (opens.value ? closes : opens) : block).scrollIntoView?.({
      block: 'center'
    });
    if (mode() === 'set') (opens.value ? closes : opens).focus();
  };

  form.querySelectorAll('input[name=hoursMode]').forEach(radio =>
    radio.addEventListener('change', () => {
      touched = true;
      refresh();
    })
  );
  [opens, closes].forEach(field =>
    field.addEventListener('input', () => {
      touched = true;
      refresh();
    })
  );
  form.querySelectorAll('[data-preset]').forEach(button =>
    button.addEventListener('click', () => {
      const preset = HOURS_PRESETS[Number(button.dataset.preset)];
      opens.value = preset.opens;
      closes.value = preset.closes;
      touched = true;
      refresh();
    })
  );
  // The hours section appears once there is a place to visit.
  address.addEventListener('input', () => {
    block.hidden = !address.value.trim() && mode() === 'any';
  });
  // Choosing a place you've been to before fills in the hours you used last time.
  address.addEventListener('place-selected', () => {
    block.hidden = false;
    const saved = recallHours(placeKey(address.dataset.name || address.value));
    if (!saved || touched) return;
    form.querySelector('input[name=hoursMode][value=set]').checked = true;
    opens.value = saved.opens;
    closes.value = saved.closes;
    refresh('Using the hours you set here last time. Change them if today is different.');
  });
  refresh();
}
