// Planning: task filters, opening hours, day timeline and route planning
const pending = () => state.tasks.filter(t => !t.done && t.date === date);
const tripBefore = t => Number(t.travelBefore) || 0,
  tripAfter = t => (t.routeVersion === 2 ? 0 : Number(t.travelAfter) || 0);
function hoursIssue(t, at) {
  return t.closed
    ? 'Place is closed on this day'
    : t.opens && at < mins(t.opens)
      ? 'Before opening time'
      : t.closes && at + t.duration > mins(t.closes)
        ? 'Task would finish after closing'
        : '';
}
function blocks() {
  return [
    ...state.events.filter(e => e.date === date).map(e => ({ ...e, fixed: true })),
    ...(state.eventTrips || [])
      .filter(e => e.date === date)
      .map(e => ({ ...e, travel: true, detail: 'From ' + e.from })),
    ...pending()
      .filter(t => t.at != null)
      .flatMap(t => [
        ...(tripBefore(t)
          ? [
              {
                id: t.id + '-out',
                title: 'Drive to ' + (t.placeName || t.title),
                start: t.at - tripBefore(t),
                end: t.at,
                travel: true,
                detail:
                  'From ' +
                  (t.routeVersion === 2 ? t.routeFrom : t.originAddress || 'your starting point')
              }
            ]
          : []),
        { ...t, start: t.at, end: t.at + t.duration }
      ])
  ].sort((a, b) => a.start - b.start);
}
function nearbyPanel() {
  return `<div class="card nearby"><h2>${nearbyEnabled ? 'Following your day' : 'Let’s connect the stops.'}</h2><p class="help" id="nearby-status">${esc(nearbyMessage || 'Choose stores by name. I’ll estimate each drive and group your stops without sending you home between errands.')}</p><p class="help">Location updates work while this page is visible. Driving estimates exclude live traffic.</p><div class="row"><button class="${nearbyEnabled ? 'outline' : 'primary'}" onclick="toggleNearby()">${nearbyEnabled ? 'Pause location updates' : 'Enable nearby planning'}</button><button class="outline" onclick="plan()">Refresh my route</button></div></div>`;
}
async function routingInputs(tasks, events) {
  const points = [],
    add = p => {
      const key = p.lat.toFixed(5) + ',' + p.lon.toFixed(5);
      let i = points.findIndex(q => q.key === key);
      if (i < 0) {
        i = points.length;
        points.push({ ...p, key });
      }
      return i;
    };
  const located = [...tasks, ...events].some(t => t.locationCoords);
  if (located) {
    if (!livePosition || Date.now() - livePosition.captured > 120000) {
      const p = await getCurrentPosition();
      if (p.accuracy > 1000)
        throw Error('Your location is too approximate. Try location access on your phone.');
      livePosition = { lat: p.lat, lon: p.lon, captured: Date.now(), accuracy: p.accuracy };
    }
    add(livePosition);
  } else add({ lat: 0, lon: 0 });
  const mapTask = t => ({
    ...t,
    routeIndex: t.locationCoords ? add(t.locationCoords) : null,
    opens: t.opens ? mins(t.opens) : null,
    closes: t.closes ? mins(t.closes) : null
  });
  const inputTasks = tasks.map(mapTask),
    inputEvents = events.map(mapTask);
  let matrix = [[0]];
  if (points.length > 1) {
    const r = await fetch('/api/journey', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points: points.map(({ lat, lon }) => ({ lat, lon })) })
    });
    const data = await r.json();
    if (!r.ok) throw Error(data.error);
    matrix = data.minutes;
  }
  for (const t of inputTasks)
    if (t.routeIndex != null)
      liveEtas[t.id] = { minutes: matrix[0]?.[t.routeIndex] ?? null, at: Date.now() };
  return { inputTasks, inputEvents, matrix };
}
async function plan(options = {}) {
  if (routeBusy) {
    if (options.auto) replanQueued = true;
    return;
  }
  if (options.auto && ($('#modal').open || running || date !== today)) return;
  const tasks = pending(),
    events = state.events.filter(e => e.date === date),
    planningDate = date,
    generation = ++routeGeneration,
    sourceStamp = JSON.stringify({
      tasks,
      events,
      energy: state.energy,
      start: state.start,
      end: state.end,
      buffer: state.buffer
    });
  if (!tasks.length) {
    if (!options.auto) toast('Add a little task first.');
    return;
  }
  routeBusy = true;
  lastRouteAt = Date.now();
  if (!options.auto) toast('Finding a sensible route between your stops…');
  try {
    const { inputTasks, inputEvents, matrix } = await routingInputs(tasks, events);
    if (
      generation !== routeGeneration ||
      planningDate !== date ||
      sourceStamp !==
        JSON.stringify({
          tasks: pending(),
          events: state.events.filter(e => e.date === date),
          energy: state.energy,
          start: state.start,
          end: state.end,
          buffer: state.buffer
        })
    )
      return;
    const result = DayPlanner.buildDayPlan({
      tasks: inputTasks,
      events: inputEvents,
      matrix,
      start: mins(state.start),
      end: mins(state.end),
      now: date === today ? new Date().getHours() * 60 + new Date().getMinutes() : 0,
      buffer: Number(state.buffer),
      energy: state.energy
    });
    const invalid =
      result.tasks.some(
        t => t.pinned && t.issue && !t.issue.startsWith('Chosen time has passed')
      ) || result.warnings.length > 0;
    lastRouteAt = Date.now();
    lastRoutePosition = livePosition ? { ...livePosition } : null;
    function apply(auto) {
      if (invalid) return;
      const changed =
        JSON.stringify((state.eventTrips || []).filter(e => e.date === date)) !==
          JSON.stringify(result.eventTrips) ||
        result.tasks.some(t => {
          const old = state.tasks.find(x => x.id === t.id);
          return (
            old.at !== t.at ||
            old.travelBefore !== t.travelBefore ||
            old.routeFrom !== t.routeFrom ||
            old.routeVersion !== 2 ||
            old.planIssue !== t.issue
          );
        });
      if (changed || !auto) {
        snapshot();
        for (const t of result.tasks) {
          const original = state.tasks.find(x => x.id === t.id);
          Object.assign(original, {
            at: t.at,
            travelBefore: t.travelBefore,
            travelAfter: 0,
            routeFrom: t.routeFrom,
            routeVersion: 2,
            planIssue: t.issue,
            travelSource: 'OSRM'
          });
        }
        state.eventTrips = [
          ...(state.eventTrips || []).filter(e => e.date !== date),
          ...result.eventTrips
        ];
        save();
      }
      const next = result.tasks.find(
        t => t.at != null && t.at >= new Date().getHours() * 60 + new Date().getMinutes()
      );
      nearbyMessage = next
        ? `Next: ${next.placeName || next.title}${next.travelBefore ? ' · ' + next.travelBefore + ' min drive from ' + next.routeFrom : ''}. Stops continue from each other.`
        : 'Your remaining day is arranged around your commitments.';
      if (!auto) closeModal();
      render();
      if (changed)
        toast(
          auto
            ? 'Plan updated for where you are. Undo is available.'
            : 'Plan applied. Your visits now form one route.'
        );
    }
    if (options.auto) {
      if (!invalid) apply(true);
      else {
        nearbyMessage = 'A fixed-time conflict needs your attention. Open Plan my day to review.';
        updateNearbyStatus();
      }
      return;
    }
    open(
      `<h2>Your day, connected.</h2><p class="help">Each drive starts at your current location or the previous stop. Fixed times stay protected; nearby flexible errands can move earlier. We use the opening hours you’ve entered. Hours not supplied remain unverified.</p>${result.tasks.map(t => `<div class="task"><div class="task-info"><strong>${esc(t.title)}</strong><small>${t.at == null ? 'Not scheduled' : pretty(t.at) + ' – ' + pretty(t.at + t.duration)}${t.pinned ? ' · Fixed' : ''}</small>${t.at != null && t.travelBefore ? `<p class="help" style="margin:5px 0">Leave ${pretty(t.at - t.travelBefore)} · ${t.travelBefore} min from ${esc(t.routeFrom)}</p>` : ''}${t.issue ? `<p class="help" style="color:#96543c">${esc(t.issue)}</p>` : ''}${t.location && !t.closes && !t.noHours ? '<p class="help">Store hours aren’t verified. Add hours in Edit to constrain this visit.</p>' : ''}</div></div>`).join('')}${result.warnings.map(w => `<p class="note">${esc(w)}</p>`).join('')}<p class="help">Basic driving estimates · no live traffic. No return home is inserted unless you add a task there. Commitments without a location are treated as things you can do wherever you are.</p><div class="dialog-actions"><button onclick="closeModal()">Keep current plan</button><button class="primary" id="apply-plan" ${invalid ? 'disabled' : ''}>Use this plan</button></div>`
    );
    $('#apply-plan').onclick = () => apply(false);
  } catch (e) {
    nearbyMessage = e.message || 'Couldn’t update your route. Your saved plan is unchanged.';
    updateNearbyStatus();
    if (!options.auto) toast(nearbyMessage);
  } finally {
    routeBusy = false;
    if (replanQueued) {
      replanQueued = false;
      setTimeout(() => plan({ auto: true }), 0);
    }
  }
}
