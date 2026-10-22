// Rendering: modal dialogs, task rows, growing plant and the main render()
function open(html) {
  $('#modal').innerHTML =
    '<button type="button" class="dialog-close" onclick="closeModal()" aria-label="Close dialog">×</button>' +
    html;
  if (!$('#modal').open) $('#modal').showModal();
}
function closeModal() {
  $('#modal').close();
}
$('#modal').addEventListener('click', e => {
  if (e.target === $('#modal')) closeModal();
});
const checkIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
function taskRow(t) {
  return `<div data-task-id="${esc(t.id)}" class="task priority-${t.priority} ${t.done ? 'done' : ''} ${t.id === lastCompleted ? 'just-done' : ''}"><button class="check" aria-label="${t.done ? 'Reopen' : 'Complete'} ${esc(t.title)}" onclick="complete(${jsArg(t.id)})">${t.done ? checkIcon : ''}</button><div class="task-info"><strong>${esc(t.title)} ${t.main ? '<span class="pill">Main thing</span>' : ''}</strong><div class="meta"><span>◷ ${t.duration} min</span>${t.at != null ? `<span>${pretty(t.at)}${t.pinned ? ' · Fixed time' : ''}</span>` : ''}<span>${['', 'Essential', 'Important', 'Whenever'][t.priority]}</span>${t.location ? `<span>⌖ ${esc(t.location)}</span>` : ''}${t.deadline ? `<span>Due ${esc(t.deadline)}</span>` : ''}${liveEtas[t.id]?.minutes != null ? `<span>↗ ${liveEtas[t.id].minutes} min from you${Date.now() - liveEtas[t.id].at > 300000 ? ' · estimate may be stale' : ''}</span>` : t.routeVersion === 2 && t.travelBefore ? `<span>↗ ${t.travelBefore} min from previous stop</span>` : ''}${t.opens ? `<span>Opens ${pretty(mins(t.opens))}</span>` : ''}${t.closed ? '<span>Closed this day</span>' : ''}${t.location && !t.locationCoords ? '<span style="color:#96543c">Choose the matching place in Edit</span>' : ''}</div>${t.planIssue ? `<p class="help" style="margin:8px 0 0;color:#96543c">${esc(t.planIssue)}</p>` : ''}${t.note ? `<p class="help" style="margin:8px 0 0">↳ ${esc(t.note)}</p>` : ''}</div><button class="task-menu" aria-label="Edit ${esc(t.title)}" onclick="edit(${jsArg(t.id)})">Edit</button></div>`;
}
const stageOf = (done, total) =>
  !total || !done ? 0 : done >= total ? 4 : done / total >= 0.75 ? 3 : done / total >= 0.5 ? 2 : 1;
const plantArt = (from, to, done, total) => {
  const petals = [0, 1, 2, 3, 4, 5]
    .map(
      i =>
        `<ellipse cx="80" cy="40" rx="5.5" ry="9" transform="rotate(${i * 60} 80 52)" fill="${['#d9bdf0', '#f0c3d6', '#cdbdf3'][i % 3]}"/>`
    )
    .join('');
  return `<svg class="plant" data-stage="${from}" data-stage-to="${to}" viewBox="0 0 160 160" fill="none" role="img" aria-label="Your little plant: ${done} of ${total} tasks done"><g class="sun-float"><circle cx="126" cy="34" r="17" fill="#f6d3a0"/><g class="blink" fill="#8b6476"><circle cx="120.5" cy="33" r="1.6"/><circle cx="131.5" cy="33" r="1.6"/></g><path d="M122 39q4 3.5 8 0" stroke="#b08386" stroke-width="1.6" stroke-linecap="round"/></g><g class="plant-sway"><path class="stem" d="M80 120V56" stroke="#a9c895" stroke-width="4.5" stroke-linecap="round"/><path class="lf lf-a" d="M80 108C58 110 48 98 50 86c18-1 30 8 30 22Z" fill="#b8d3a4"/><path class="lf lf-b" d="M80 98c20 0 30-11 27-24-18 0-28 9-27 24Z" fill="#cfe0ae"/><path class="lf lf-c" d="M80 82C62 83 54 72 56 62c15 0 25 7 24 20Z" fill="#a3c690"/><path class="lf lf-d" d="M80 72c15 0 23-9 21-19-14 0-22 6-21 19Z" fill="#c2d9a4"/><circle class="bud" cx="80" cy="54" r="7" fill="#d9bdf0"/><g class="bloom">${petals}<circle cx="80" cy="52" r="7" fill="#f7d58b"/><circle cx="77.4" cy="51" r="1.1" fill="#8b6476"/><circle cx="82.6" cy="51" r="1.1" fill="#8b6476"/><path d="M77.6 54.4q2.4 2 4.8 0" stroke="#b08386" stroke-width="1.2" stroke-linecap="round"/></g></g><path class="spark" d="M30 66v10m-5-5h10M138 92v8m-4-4h8" stroke="#f3dfae" stroke-width="2" stroke-linecap="round"/><g class="pot"><path d="M54 122h52l-5.5 29a6 6 0 0 1-6 5H65.5a6 6 0 0 1-6-5L54 122Z" fill="#f2cfae"/><rect x="49" y="114" width="62" height="12" rx="6" fill="#ecbf98"/><g class="blink" fill="#7a5468"><circle cx="70" cy="138" r="2.3"/><circle cx="90" cy="138" r="2.3"/></g><ellipse cx="63" cy="145" rx="5" ry="3" fill="#f3a39b" opacity=".55"/><ellipse cx="97" cy="145" rx="5" ry="3" fill="#f3a39b" opacity=".55"/><path d="M75.5 144q4.5 4.5 9 0" stroke="#7a5468" stroke-width="1.8" stroke-linecap="round"/></g></svg>`;
};
function render() {
  save();
  $('#dateline').textContent = new Date(date + 'T12:00').toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  document
    .querySelectorAll('nav button')
    .forEach(b => b.classList.toggle('active', b.dataset.view === view));
  let html = '';
  if (view === 'today') {
    const active = pending().find(t => t.id === running) || pending().sort((a, b) => (a.at ?? 9999) - (b.at ?? 9999))[0],
      dayTasks = state.tasks.filter(t => t.date === date),
      total = dayTasks.length,
      done = dayTasks.filter(t => t.done).length,
      stage = stageOf(done, total),
      ePos = ['low', 'medium', 'high'].indexOf(state.energy),
      planned = dayTasks.filter(t => t.at != null && !t.done).reduce((n, t) => n + t.duration, 0),
      note = total
        ? `${done} of ${total} done · your little plant is ${['just waking up', 'sprouting', 'growing nicely', 'budding', 'in full bloom'][stage]}.`
        : 'Your little plant is ready for its first task.';
    if (lastEnergyPos < 0) lastEnergyPos = ePos;
    const hero = active
      ? `<span class="tag">Your next little thing</span><h2>${esc(active.title)}</h2><p>${active.duration} minutes · ${active.at != null ? pretty(active.at) : 'Not scheduled yet'}${active.location ? ' · ' + esc(active.location) : ''}</p><div class="row actions"><button class="primary" onclick="startFocus(${jsArg(active.id)})">${running === active.id ? 'Pause' : 'Let’s start'}</button><button onclick="complete(${jsArg(active.id)})">Done</button><button onclick="more(${jsArg(active.id)})">+10 min</button><button onclick="helpStart(${jsArg(active.id)})">Help me start</button></div><div id="timer" class="help" style="margin-top:12px">${running === active.id ? 'Focus time: ' + Math.floor(elapsed / 60) + ' min' : ''}</div>`
      : total
        ? `<span class="tag">All done</span><h2>That’s everything for today.</h2><p>Rest, or add one more little thing.</p><button class="primary" style="margin-top:22px" onclick="edit()">+ Add a task</button>`
        : `<span class="tag">Room for a fresh start</span><h2>What matters to you today?</h2><p>Put it down here. We’ll find a little room for it.</p><button class="primary" style="margin-top:22px" onclick="edit()">+ Add my first task</button>`;
    const icons = {
        list: '<path d="M5 7h14M5 12h14M5 17h9"/>',
        clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 1.5"/>',
        spark: '<path d="M12 4l1.8 5.2L19 11l-5.2 1.8L12 18l-1.8-5.2L5 11l5.2-1.8Z"/>'
      },
      ico = k =>
        `<i aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${icons[k]}</svg></i>`,
      unscheduled = pending().filter(t => t.at == null).length;
    html = `<div class="intro"><div><h1>Your day, at your pace.</h1><p>You don’t have to do it all. Just the next little thing.</p></div><div><div class="help" style="margin-bottom:8px">How’s your energy?</div><div class="energy" data-pos="${lastEnergyPos}" data-pos-to="${ePos}">${['low', 'medium', 'high'].map((e, i) => `<button class="${state.energy === e ? 'selected' : ''}" onclick="energy('${e}')">${['Low', 'Steady', 'High'][i]}</button>`).join('')}</div></div></div><div class="day-stats" aria-label="Day at a glance"><span class="stat">${ico('list')}<b>${total}</b><span><span class="lil">little </span>${total === 1 ? 'task' : 'tasks'}</span></span><span class="stat">${ico('clock')}<b>${planned}</b><span>min scheduled</span></span><span class="stat">${ico('spark')}<b>${done}</b><span><span class="lil">little </span>${done === 1 ? 'win' : 'wins'}</span></span></div><div class="grid day-grid"><section><div class="card focus"><div class="focus-art">${plantArt(lastStage, stage, done, total)}</div>${hero}<p class="grow-note">${note}</p></div><div class="card tasks-card"><div class="head"><h2>The little things</h2><button class="soft" onclick="edit()">+ Add task</button></div><div class="row"><button class="outline" onclick="plan()">Plan my day</button><button class="outline" onclick="plan()">I’m behind</button><button class="outline" onclick="lighter()">Too much today</button></div>${dayTasks.map(taskRow).join('') || '<div class="empty">A clear page, a little possibility.<br>Add a task or empty your mind on the right.</div>'}</div></section><aside><div class="card overview-card"><div class="head"><h2>Your day unfolds</h2><input aria-label="Choose day" type="date" value="${date}" style="width:150px" onchange="date=this.value||today;render()"></div><div class="weekbar">${Array.from(
      { length: 7 },
      (_, i) => {
        let d = new Date(date + 'T12:00');
        d.setDate(d.getDate() - d.getDay() + i);
        return `<button class="day ${dayKey(d) === date ? 'current' : ''}" onclick="date='${dayKey(d)}';render()">${d.toLocaleDateString([], { weekday: 'short' })}<span>${d.getDate()}</span></button>`;
      }
    ).join('')}</div>${
      blocks()
        .map(
          b =>
            `<div class="timeline-item"><span class="time">${pretty(b.start)}</span><div class="block ${b.fixed ? 'fixed' : b.travel ? 'travel' : ''}"><strong>${esc(b.title)}</strong><small>${pretty(b.start)} – ${pretty(b.end)} · ${b.travel ? 'Travel · no live traffic' : b.fixed ? 'Fixed commitment' : b.pinned ? 'Fixed task time' : b.duration + ' min'}</small>${b.travel ? `<p class="help">${esc(b.detail)}</p>` : ''}</div></div>`
        )
        .join('') ||
      '<div class="empty">Your timeline is open.<br>Add tasks, then plan your day.</div>'
    }${unscheduled ? `<p class="help">${unscheduled} task(s) waiting for a time.</p>` : ''}<button class="outline" style="width:100%;margin-top:10px" onclick="eventForm()">+ Fixed commitment</button></div><div class="card dump"><div class="head"><h2>On your mind?</h2></div><p>A thought, a to-do, all the tabs in your head.<br>One task per line. We’ll hold them here.</p><textarea id="dump" aria-label="Brain dump" placeholder="Book that appointment…&#10;Pick up a few groceries…" oninput="state.dump=this.value;save()">${esc(state.dump)}</textarea><button class="primary" onclick="fromDump()">Turn into little tasks</button></div>${nearbyPanel()}</aside></div>`;
  } else if (view === 'tasks') {
    html = `<div class="intro"><div><h1>Everything, in one place.</h1><p>Your head doesn’t have to hold it all.</p></div><button class="primary" onclick="edit()">+ Add task</button></div><div class="card"><input id="search" placeholder="Find a little task…" aria-label="Search tasks" oninput="filterTasks(this.value)"><div id="alltasks">${state.tasks.map(taskRow).join('') || '<div class="empty">No tasks yet. Let’s add something small.</div>'}</div></div>`;
  } else if (view === 'calendar') {
    html = `<h1>Make room for real life.</h1><p class="muted">Fixed commitments stay put. Your tasks fit around them.</p><div class="grid"><div class="card"><div class="head"><h2>Your commitments</h2><button class="soft" onclick="eventForm()">+ Add</button></div>${
      state.events
        .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)
        .map(
          e =>
            `<div class="task"><div class="task-info"><strong>${esc(e.title)}</strong><small>${esc(e.date)} · ${pretty(e.start)} – ${pretty(e.end)}</small></div><button class="task-menu" onclick="deleteEvent(${jsArg(e.id)})" aria-label="Delete commitment">×</button></div>`
        )
        .join('') || '<p class="empty">Add appointments here, or import a calendar file.</p>'
    }</div><div><div class="card"><h2>Google Calendar</h2><p class="help">Live Google Calendar connection is not available in this version. No account is connected, and changes here do not automatically update Google.</p><div class="note">You can import an .ics calendar export to protect your appointments, and export scheduled tasks to add to your calendar.</div><label for="ics">Import calendar (.ics)</label><input id="ics" type="file" accept=".ics,text/calendar" onchange="importIcs(this.files[0])"><button class="primary" style="margin-top:16px" onclick="exportIcs()">Export scheduled tasks ↗</button><p class="help" style="margin-top:14px">Import reads individual dated events. Recurring events and named-timezone events are skipped; add those commitments manually. Exporting again may create duplicates in Google.</p></div></div></div>`;
  } else {
    html = `<h1>Find your rhythm.</h1><p class="muted">A few gentle boundaries make room for a better day.</p><div class="grid"><form class="card" id="rhythm"><h2>Your planning day</h2><div class="fields"><div><label>Start planning at</label><input type="time" name="start" value="${state.start}" required></div><div><label>Finish by</label><input type="time" name="end" value="${state.end}" required></div></div><label>Your usual starting address</label><input id="home-address" name="startingAddress" autocomplete="off" value="${esc(state.startingAddress || '')}" placeholder="Type an address, then choose a suggestion"><div id="home-results"></div><p id="home-status" class="help">Save Home here so you can select it as a task location. Trips otherwise continue from the previous stop.</p><label>Breathing room between tasks (minutes)</label><input name="buffer" type="number" min="0" max="120" value="${state.buffer}" required><p class="help">Use this for short breaks. Add longer meals, breaks, and journeys as fixed commitments.</p><button class="primary">Save my rhythm</button></form><div><div class="card"><h2>A gentle nudge</h2><p class="help">Task reminders work while this page is open. Browser notifications depend on your device and permission. Background and closed-page reminders are not supported yet.</p><button class="soft" onclick="notifications()">Enable browser reminders</button><p class="help" id="permission">${'Notification' in window ? 'Permission: ' + Notification.permission : 'Browser notifications unavailable on this device.'}</p></div><div class="card"><h2>Your little safety net</h2><p class="help">Your planner saves to your private account database. A device copy is also kept for recovery. Download a backup anytime.</p><div class="row"><button class="outline" onclick="backup()">Download backup</button><button class="outline" onclick="recovery()">Recovery copy</button><label class="outline" style="margin:0;padding:11px;border-radius:10px;cursor:pointer">Restore backup<input type="file" accept=".json" style="display:none" onchange="restore(this.files[0])"></label></div></div></div></div>`;
  }
  $('#view').dataset.energy = state.energy;
  $('#view').innerHTML = html;
  if ($('#rhythm')) {
    writeCoords($('#home-address'), state.startingCoords);
    setupAddressSearch('home-address', 'home-results', 'home-status');
  }
  if ($('#rhythm'))
    $('#rhythm').onsubmit = e => {
      e.preventDefault();
      const f = new FormData(e.target);
      if (mins(f.get('end')) <= mins(f.get('start')))
        return toast('Choose an end time after your start time.');
      snapshot();
      state.start = f.get('start');
      state.end = f.get('end');
      state.buffer = Number(f.get('buffer'));
      state.startingAddress = f.get('startingAddress').trim();
      state.startingCoords = readCoords($('#home-address'));
      save();
      toast('Your rhythm is saved.');
    };
  animateScene();
}
