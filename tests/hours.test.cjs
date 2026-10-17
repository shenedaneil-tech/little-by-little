// Tests the opening-hours rules: which choice a task is on, validation, and remembering hours per place.
const vm = require('vm'),
  assert = require('node:assert/strict');
const source = require('../scripts/planner-source.cjs').plannerSource();
const section = source.slice(source.indexOf('// Opening hours:'), source.indexOf('// Reminders'));
assert.ok(section.includes('function hoursMode'), 'hours section was found');

const state = { placeHours: {} };
const mins = t => Number(t.split(':')[0]) * 60 + Number(t.split(':')[1]);
const api = vm.runInNewContext(
  section +
    ';({placeKey,hoursMode,validateHours,hoursFromForm,rememberHours,recallHours,hoursBlockHtml,HOURS_PRESETS,MAX_REMEMBERED_PLACES})',
  { state, mins, esc: s => String(s ?? '').replace(/[&<>"']/g, '_') }
);

// Place names match no matter the spacing or capitalisation.
assert.equal(api.placeKey('  Target   Southlake '), 'target southlake');
assert.equal(api.placeKey(null), '');

// Closed wins over hours; hours win over "any time"; legacy flags still read correctly.
assert.equal(api.hoursMode({}), 'any');
assert.equal(api.hoursMode({ noHours: true }), 'any');
assert.equal(api.hoursMode({ opens: '09:00' }), 'set');
assert.equal(api.hoursMode({ closes: '17:00' }), 'set');
assert.equal(api.hoursMode({ closed: true, opens: '09:00', closes: '17:00' }), 'closed');

// Validation: only "Set hours" is checked, and a one-sided range is allowed.
assert.equal(api.validateHours('any', '', ''), '');
assert.equal(api.validateHours('closed', '', ''), '');
assert.match(api.validateHours('set', '', ''), /Pick the opening and closing/);
assert.equal(api.validateHours('set', '09:00', ''), '');
assert.equal(api.validateHours('set', '', '17:00'), '');
assert.equal(api.validateHours('set', '09:00', '17:00'), '');
assert.match(api.validateHours('set', '17:00', '09:00'), /Closing time must follow/);
assert.match(api.validateHours('set', '09:00', '09:00'), /Closing time must follow/);

// Reading the form: times are dropped unless "Set hours" is chosen, and the flags match the choice.
const form = o => ({ get: k => (k in o ? o[k] : null) });
assert.deepEqual(
  { ...api.hoursFromForm(form({ hoursMode: 'set', opens: '09:00', closes: '21:00' })) },
  { mode: 'set', opens: '09:00', closes: '21:00', closed: false, noHours: false }
);
assert.deepEqual(
  { ...api.hoursFromForm(form({ hoursMode: 'closed', opens: '09:00', closes: '21:00' })) },
  { mode: 'closed', opens: '', closes: '', closed: true, noHours: false }
);
assert.deepEqual(
  { ...api.hoursFromForm(form({ opens: '09:00', closes: '21:00' })) },
  { mode: 'any', opens: '', closes: '', closed: false, noHours: true }
);

// Remembering: saved per place, replaced on change, forgotten when set to "any time".
api.rememberHours('target', '09:00', '22:00');
assert.deepEqual({ ...api.recallHours('target') }, { opens: '09:00', closes: '22:00' });
api.rememberHours('target', '08:00', '23:00');
assert.deepEqual({ ...api.recallHours('target') }, { opens: '08:00', closes: '23:00' });
api.rememberHours('target', '', '');
assert.equal(api.recallHours('target'), null);
assert.equal(api.recallHours('never been'), null);
api.rememberHours('', '09:00', '17:00');
assert.deepEqual(Object.keys(state.placeHours), [], 'a place with no name is not remembered');

// Bad data (from an old backup or a synced copy) is ignored instead of filling the form with junk.
state.placeHours.weird = { opens: '<script>', closes: '99:99' };
assert.equal(api.recallHours('weird'), null);
state.placeHours = 'not an object';
api.rememberHours('fresh', '10:00', '18:00');
assert.deepEqual({ ...api.recallHours('fresh') }, { opens: '10:00', closes: '18:00' });

// Only the most recent places are kept.
state.placeHours = {};
for (let i = 0; i < api.MAX_REMEMBERED_PLACES + 25; i++) api.rememberHours('place ' + i, '09:00', '17:00');
assert.equal(Object.keys(state.placeHours).length, api.MAX_REMEMBERED_PLACES);
assert.equal(api.recallHours('place 0'), null);
assert.ok(api.recallHours('place ' + (api.MAX_REMEMBERED_PLACES + 24)));

// The form block: hidden with no place, shown with one, and reflects the task's current choice.
assert.match(api.hoursBlockHtml({ location: '' }), /id="hours-block" hidden/);
assert.doesNotMatch(api.hoursBlockHtml({ location: 'Target' }), /id="hours-block" hidden/);
assert.match(api.hoursBlockHtml({ location: 'Target', closed: true }), /value="closed" checked/);
assert.match(api.hoursBlockHtml({ opens: '09:00', closes: '17:00' }), /value="set" checked/);
assert.match(api.hoursBlockHtml({ opens: '09:00' }), /name="opens" value="09:00"/);

console.log('PASS: hours choice, validation, form reading, remembering per place, bad-data safety, 200-place cap, form block');
