// Tasks and events: add/edit forms, completing, focus, brain dump and events
function filterTasks(q) {
  $('#alltasks').innerHTML =
    state.tasks
      .filter(t => (t.title + ' ' + t.location).toLowerCase().includes(q.toLowerCase()))
      .map(taskRow)
      .join('') || '<p class="empty">No matching tasks.</p>';
}
function edit(id) {
  const t = state.tasks.find(t => t.id === id) || {
    title: '',
    duration: 25,
    priority: 2,
    date,
    location: '',
    note: '',
    main: false
  };
  open(
    `<form id="taskform"><h2>${id ? 'A little adjustment' : 'One little task'}</h2><label>What would you like to do?</label><input name="title" required maxlength="180" value="${esc(t.title)}" placeholder="Pick up my shirt transfers…"><label>Store, place, or address</label><div class="row"><input id="address" name="location" style="flex:1;min-width:150px" autocomplete="off" value="${esc(t.location)}" placeholder="Try Target, Michaels, DTF Jersey…" aria-describedby="address-status">${state.startingCoords ? '<button type="button" class="soft" id="pick-home">Home</button>' : ''}</div><div id="address-results"></div><p id="address-status" class="help">Type a store name and choose the right branch. Search uses OpenStreetMap listings.</p><div class="note" id="place-eta">${t.locationCoords ? 'Choose “Update from my location” for a fresh driving estimate.' : 'Choose a place to see the drive from your current location.'}</div><button type="button" class="soft" id="update-location" style="margin-top:8px">⌖ Update from my location</button><p class="help">Location is used with your permission. Nearby planning can rearrange flexible stops while this page is visible.</p><div class="fields"><div><label>Time needed at the task</label><input name="duration" type="number" min="5" max="720" value="${t.duration}" required></div><div><label>Importance</label><select name="priority">${[1, 2, 3].map(n => `<option value="${n}" ${t.priority == n ? 'selected' : ''}>${['', 'Essential', 'Important', 'Whenever'][n]}</option>`).join('')}</select></div><div><label>Day</label><input type="date" name="date" value="${t.date}" required></div><div><label>Specific time (optional)</label><input type="time" name="time" value="${t.pinned && t.at != null ? clock(t.at) : ''}"></div></div><label><input type="checkbox" name="main" style="width:auto" ${t.main ? 'checked' : ''}> My main priority</label>${hoursBlockHtml(t)}<details><summary>Deadline &amp; notes</summary><label>Deadline</label><input type="date" name="deadline" value="${t.deadline || ''}"><label>Next step / stopping point</label><textarea class="field" rows="2" name="note">${esc(t.note)}</textarea></details><div class="dialog-actions">${id ? '<button type="button" id="delete-task">Delete</button>' : ''}<button type="button" onclick="closeModal()">Cancel</button><button class="primary">Save task</button></div></form>`
  );
  const input = $('#address');
  writeCoords(input, t.locationCoords);
  input.dataset.name = t.placeName || '';
  setupAddressSearch();
  setupSimplePlace(t);
  setupHours();
  $('#taskform').onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.target),
      coords = readCoords(input),
      hrs = hoursFromForm(f);
    let x = {
      ...t,
      id: id || crypto.randomUUID(),
      title: f.get('title').trim(),
      duration: Number(f.get('duration')),
      priority: Number(f.get('priority')),
      date: f.get('date'),
      deadline: f.get('deadline'),
      location: f.get('location').trim(),
      locationCoords: coords,
      placeName: input.dataset.name || f.get('location').trim(),
      note: f.get('note').trim(),
      main: f.has('main'),
      pinned: !!f.get('time'),
      at: f.get('time') ? mins(f.get('time')) : null,
      needsTravel: !!coords,
      opens: hrs.opens,
      closes: hrs.closes,
      closed: hrs.closed,
      noHours: hrs.noHours,
      routeVersion: 2,
      travelBefore: Number($('#place-eta').dataset.minutes) || 0,
      travelAfter: 0,
      routeFrom: 'Your current location',
      travelSource: 'OSRM'
    };
    if (!x.title) return;
    const hoursProblem = validateHours(hrs.mode, hrs.opens, hrs.closes);
    if (hoursProblem) {
      setupHours.showProblem(hoursProblem);
      return toast(hoursProblem);
    }
    if (x.at != null) {
      if (x.at + x.duration > 1440) return toast('This task extends past midnight.');
      const hours = hoursIssue(x, x.at);
      if (hours) return toast(hours + '. Adjust the chosen time or hours.');
      const clash = [
        ...state.events.filter(v => v.date === x.date),
        ...state.tasks
          .filter(v => v.id !== id && v.date === x.date && !v.done && v.pinned && v.at != null)
          .map(v => ({ title: v.title, start: v.at, end: v.at + v.duration }))
      ].find(v => x.at < v.end && x.at + x.duration > v.start);
      if (clash) return toast('This overlaps with ' + clash.title + '.');
    }
    snapshot();
    if (x.location && hrs.mode !== 'closed')
      rememberHours(placeKey(x.placeName || x.location), hrs.opens, hrs.closes);
    if (x.main) state.tasks.filter(v => v.date === x.date).forEach(v => (v.main = false));
    if (id) state.tasks[state.tasks.findIndex(v => v.id === id)] = x;
    else state.tasks.push(x);
    if (x.locationCoords && $('#place-eta').dataset.minutes)
      liveEtas[x.id] = { minutes: Number($('#place-eta').dataset.minutes), at: Date.now() };
    save();
    closeModal();
    render();
    toast('Saved. Finding a route that fits your day…');
    if (x.date === date) plan({ auto: true });
  };
  if (id)
    $('#delete-task').onclick = () => {
      snapshot();
      state.tasks = state.tasks.filter(x => x.id !== id);
      save();
      closeModal();
      render();
      toast('Task removed. Undo is available.');
      if (nearbyEnabled) plan({ auto: true });
    };
}

function complete(id) {
  const el = [...document.querySelectorAll('[data-task-id]')].find(e => e.dataset.taskId === id),
    box = el?.getBoundingClientRect();
  snapshot();
  const t = state.tasks.find(t => t.id === id);
  t.done = !t.done;
  lastCompleted = t.done ? id : null;
  if (running === id) running = null;
  save();
  render();
  toast(t.done ? 'One little thing, done. ✨' : 'Task reopened.');
  if (t.done)
    celebrate(box ? { x: Math.min(window.innerWidth - 25, box.left + 28), y: box.top + 30 } : null);
  if (t.done && nearbyEnabled) setTimeout(() => plan({ auto: true }), 0);
}

function more(id) {
  const task = state.tasks.find(t => t.id === id);
  if (task.duration + 10 > 720) return toast('Try splitting this into smaller tasks.');
  if (task.pinned) {
    const clash = [
      ...state.events.filter(e => e.date === task.date),
      ...state.tasks
        .filter(t => t.id !== id && !t.done && t.date === task.date && t.at != null)
        .map(t => ({ title: t.title, start: t.at, end: t.at + t.duration }))
    ].find(e => task.at < e.end && task.at + task.duration + 10 > e.start);
    if (clash || task.at + task.duration + 10 > 1440)
      return toast(
        'More time would overlap another commitment or midnight. Edit the task to move it.'
      );
  }
  snapshot();
  task.duration += 10;
  save();
  plan();
}
function energy(e) {
  snapshot();
  state.energy = e;
  save();
  render();
  toast(
    e === 'low'
      ? 'A lighter day is okay. Try “Too much today” to choose what stays.'
      : e === 'high'
        ? 'A little extra energy. Keep some room to breathe.'
        : 'Steady is a lovely place to start.'
  );
}
function lighter() {
  let list = pending().filter(t => !t.main && t.priority !== 1);
  open(
    `<h2>Let’s make today lighter.</h2><p class="help">Your essential tasks and main priority stay. Choose what can move to tomorrow.</p><form id="light">${list.map(t => `<label><input style="width:auto" type="checkbox" name="move" value="${t.id}" checked> ${esc(t.title)}</label>`).join('') || '<p>No flexible tasks to move. You can edit any task individually.</p>'}<div class="dialog-actions"><button type="button" onclick="closeModal()">Cancel</button><button class="primary">Move selected</button></div></form>`
  );
  $('#light').onsubmit = e => {
    e.preventDefault();
    snapshot();
    let d = new Date(date + 'T12:00');
    d.setDate(d.getDate() + 1);
    for (const id of new FormData(e.target).getAll('move'))
      Object.assign(
        state.tasks.find(t => t.id === id),
        { date: dayKey(d), at: null, pinned: false }
      );
    save();
    closeModal();
    render();
    toast('A little less on your plate.');
  };
}
function helpStart(id) {
  const t = state.tasks.find(t => t.id === id);
  open(
    `<h2>Just the first five minutes.</h2><p class="help">You don’t have to finish “${esc(t.title)}” right now. Choose one visible first step: open the file, gather supplies, or write the first sentence.</p><label>My tiny first step / stopping point</label><textarea id="step" class="field" rows="3">${esc(t.note)}</textarea><div class="dialog-actions"><button onclick="closeModal()">Close</button><button class="primary" id="save-step">Save my starting point</button></div>`
  );
  $('#save-step').onclick = () => {
    snapshot();
    t.note = $('#step').value;
    save();
    closeModal();
    render();
  };
}
function startFocus(id) {
  if (running === id) {
    running = null;
    toast('Paused. Take a breath.');
  } else {
    running = id;
    elapsed = 0;
    toast('One thing at a time. You’ve got room to start.');
  }
  render();
}
function fromDump() {
  let lines = state.dump
    .split('\n')
    .map(x => x.trim())
    .filter(Boolean);
  if (!lines.length) return toast('Write a thought or a task first.');
  snapshot();
  for (const title of lines)
    state.tasks.push({
      id: crypto.randomUUID(),
      title,
      duration: 25,
      priority: 2,
      date,
      at: null,
      main: false,
      done: false,
      location: '',
      note: ''
    });
  state.dump = '';
  save();
  render();
  toast('Your thoughts have a home. Adjust estimates, then plan your day.');
}
function eventForm() {
  open(
    `<form id="eventform"><h2>Something fixed in your day</h2><label>Commitment</label><input name="title" placeholder="Appointment, lunch, travel…" required maxlength="180"><label>Place (optional)</label><input id="event-address" name="location" autocomplete="off" placeholder="Store, address, or leave blank for online"><div id="event-results"></div><p id="event-status" class="help">Choose a result for an in-person commitment. Leave empty if you can do it wherever you are.</p><label>Date</label><input type="date" name="date" value="${date}" required><div class="fields"><div><label>Starts</label><input type="time" name="start" value="12:00" required></div><div><label>Ends</label><input type="time" name="end" value="13:00" required></div></div><div class="dialog-actions"><button type="button" onclick="closeModal()">Cancel</button><button class="primary">Save commitment</button></div></form>`
  );
  setupAddressSearch('event-address', 'event-results', 'event-status');
  $('#eventform').onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.target),
      start = mins(f.get('start')),
      end = mins(f.get('end'));
    if (end <= start) return toast('Choose an end time after the start.');
    snapshot();
    state.events.push({
      id: crypto.randomUUID(),
      title: f.get('title'),
      date: f.get('date'),
      start,
      end,
      location: f.get('location').trim(),
      locationCoords: readCoords($('#event-address'))
    });
    save();
    closeModal();
    render();
    toast('Commitment saved. Review your plan to adjust tasks around it.');
  };
}
function deleteEvent(id) {
  snapshot();
  state.events = state.events.filter(e => e.id !== id);
  save();
  render();
  toast('Commitment removed. Undo is available.');
}
