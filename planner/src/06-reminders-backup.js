// Reminders, backup/restore and calendar (.ics) import/export
async function notifications() {
  if (!('Notification' in window)) return toast('This browser does not support notifications.');
  const p = await Notification.requestPermission();
  state.notify = p === 'granted';
  save();
  render();
  toast(
    p === 'granted'
      ? 'Reminders enabled while this page is open.'
      : 'You can allow notifications in your browser settings.'
  );
}
let nudged = new Set();
setInterval(() => {
  if (running) {
    elapsed++;
    if ($('#timer'))
      $('#timer').textContent =
        'Focus time: ' + Math.floor(elapsed / 60) + 'm ' + (elapsed % 60) + 's';
  }
  if (!state.notify) return;
  const now = new Date(),
    m = now.getHours() * 60 + now.getMinutes();
  for (const t of state.tasks.filter(t => !t.done && t.date === dayKey(now) && t.at === m)) {
    const key = t.id + t.date + t.at;
    if (nudged.has(key)) continue;
    nudged.add(key);
    toast('Time for: ' + t.title);
    if ('Notification' in window && Notification.permission === 'granted')
      new Notification('Your next little thing', {
        body: t.title + ' · ' + t.duration + ' minutes'
      });
  }
}, 1000);
function download(text, name, type) {
  const u = URL.createObjectURL(new Blob([text], { type })),
    a = document.createElement('a');
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
function backup() {
  download(JSON.stringify(state, null, 2), 'little-by-little-backup.json', 'application/json');
}
async function restore(file) {
  if (!file) return;
  try {
    const s = JSON.parse(await file.text());
    if (
      !Array.isArray(s.tasks) ||
      !Array.isArray(s.events) ||
      !/^\d\d:\d\d$/.test(s.start) ||
      !/^\d\d:\d\d$/.test(s.end) ||
      !Number.isFinite(s.buffer) ||
      s.tasks.some(
        t =>
          typeof t.title !== 'string' ||
          !Number.isFinite(t.duration) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(t.date)
      ) ||
      s.events.some(
        e => typeof e.title !== 'string' || !Number.isFinite(e.start) || !Number.isFinite(e.end)
      )
    )
      throw Error();
    open(
      '<h2>Restore your backup?</h2><p class="help">This replaces the planner on this device. You can undo the restore.</p><div class="dialog-actions"><button onclick="closeModal()">Cancel</button><button class="primary" id="restore-confirm">Restore</button></div>'
    );
    $('#restore-confirm').onclick = () => {
      snapshot();
      state = { ...defaults, ...s, notify: false };
      save();
      closeModal();
      render();
      toast('Your backup is restored.');
    };
  } catch {
    toast('That backup could not be read. Use a Little by Little JSON backup.');
  }
}
function exportIcs() {
  const rows = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Little by Little//Planner//EN'];
  let tasks = state.tasks.filter(t => !t.done && t.at != null);
  if (!tasks.length) return toast('Schedule a few tasks before exporting.');
  for (const t of tasks) {
    let stamp = m => t.date.replaceAll('-', '') + 'T' + clock(m).replace(':', '') + '00';
    rows.push(
      'BEGIN:VEVENT',
      'UID:' + t.id + '@littlebylittle',
      'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''),
      'DTSTART:' + stamp(t.at),
      'DTEND:' + stamp(t.at + t.duration),
      'SUMMARY:' +
        t.title
          .replace(/\\/g, '\\\\')
          .replace(/\n/g, '\\n')
          .replace(/,/g, '\\,')
          .replace(/;/g, '\\;'),
      'END:VEVENT'
    );
  }
  rows.push('END:VCALENDAR');
  download(rows.join('\r\n'), 'little-by-little-tasks.ics', 'text/calendar');
}
async function importIcs(file) {
  if (!file) return;
  try {
    const text = (await file.text()).replace(/\r?\n[ \t]/g, ''),
      parts = text.split('BEGIN:VEVENT').slice(1),
      events = [];
    let skipped = 0;
    for (const p of parts) {
      const get = k => p.match(new RegExp('(?:^|\\n)' + k + '(?:;[^:]*)?:([^\\r\\n]+)'))?.[1];
      let start = get('DTSTART'),
        end = get('DTEND');
      if (get('RRULE') || /DTSTART;TZID=/.test(p) || !start || !end) {
        skipped++;
        continue;
      }
      function parse(v) {
        if (/^\d{8}$/.test(v))
          return { date: v.slice(0, 4) + '-' + v.slice(4, 6) + '-' + v.slice(6, 8), m: 0 };
        if (!/^\d{8}T\d{6}Z?$/.test(v)) return null;
        let iso =
          v.slice(0, 4) +
          '-' +
          v.slice(4, 6) +
          '-' +
          v.slice(6, 8) +
          'T' +
          v.slice(9, 11) +
          ':' +
          v.slice(11, 13) +
          ':' +
          v.slice(13, 15) +
          (v.endsWith('Z') ? 'Z' : '');
        const d = new Date(iso);
        return { date: dayKey(d), m: d.getHours() * 60 + d.getMinutes() };
      }
      const a = parse(start),
        b = parse(end);
      if (!a || !b) {
        skipped++;
        continue;
      }
      if (start.length === 8) {
        events.push({
          id: get('UID') || crypto.randomUUID(),
          title: get('SUMMARY') || 'All-day commitment',
          date: a.date,
          start: 0,
          end: 1440
        });
        continue;
      }
      if (a.date !== b.date || b.m <= a.m) {
        skipped++;
        continue;
      }
      events.push({
        id: get('UID') || crypto.randomUUID(),
        title: (get('SUMMARY') || 'Calendar event')
          .replace(/\\n/g, ' ')
          .replace(/\\([,;\\])/g, '$1'),
        date: a.date,
        start: a.m,
        end: b.m
      });
    }
    snapshot();
    for (const e of events) {
      const i = state.events.findIndex(x => x.id === e.id);
      if (i >= 0) state.events[i] = e;
      else state.events.push(e);
    }
    save();
    render();
    toast(
      `${events.length} commitments imported. ${skipped} unsupported or recurring events skipped. Times use this device’s timezone; verify imported times.`
    );
  } catch {
    toast('Could not read this calendar file.');
  }
}
