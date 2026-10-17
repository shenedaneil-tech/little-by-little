// Places: address search, coordinates and current position
let addressSequence = 0,
  addressTimeout,
  addressAbort;
function setupAddressSearch(
  inputId = 'address',
  resultId = 'address-results',
  statusId = 'address-status'
) {
  const input = $('#' + inputId),
    results = $('#' + resultId),
    status = $('#' + statusId);
  if (!input) return;
  input.oninput = () => {
    input.dataset.coords = '';
    input.dataset.name = '';
    input.dispatchEvent(new Event('place-editing'));
    clearTimeout(addressTimeout);
    addressAbort?.abort();
    const seq = ++addressSequence,
      q = input.value.trim();
    results.replaceChildren();
    if (q.length < 3) {
      status.textContent = 'Type 3+ characters for suggestions, or use your own location label.';
      return;
    }
    status.textContent = 'Looking for addresses…';
    addressTimeout = setTimeout(async () => {
      addressAbort = new AbortController();
      try {
        const r = await fetch(
          '/api/addresses?q=' +
            encodeURIComponent(q) +
            (livePosition ? '&lat=' + livePosition.lat + '&lon=' + livePosition.lon : ''),
          { signal: addressAbort.signal }
        );
        const data = await r.json();
        if (seq !== addressSequence || !input.isConnected) return;
        if (!r.ok) throw Error(data.error);
        status.textContent = data.results.length
          ? 'Choose a suggestion · © OpenStreetMap contributors / Photon'
          : 'No matches. Add a town or ZIP code, or keep your typed address.';
        results.replaceChildren();
        for (const item of data.results) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'address-option';
          button.textContent = item.label;
          button.onclick = () => {
            input.value = item.label;
            input.dataset.name = item.name || item.label;
            writeCoords(input, { lat: item.lat, lon: item.lon });
            results.replaceChildren();
            status.textContent = 'Address selected. Save the task to keep it.';
            input.dispatchEvent(new Event('place-selected'));
          };
          results.appendChild(button);
        }
      } catch (e) {
        if (e.name !== 'AbortError' && seq === addressSequence)
          status.textContent =
            'Address search is unavailable. You can still save your typed address.';
      }
    }, 700);
  };
}

function readCoords(input) {
  try {
    const p = JSON.parse(input.dataset.coords || 'null');
    return p && Number.isFinite(p.lat) && Number.isFinite(p.lon) ? p : null;
  } catch {
    return null;
  }
}
function writeCoords(input, p) {
  if (input) input.dataset.coords = p ? JSON.stringify(p) : '';
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(
        new Error(
          'Location is unavailable in this browser. Choose a custom starting address instead.'
        )
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position =>
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: new Date(position.timestamp).toISOString()
        }),
      error =>
        reject(
          new Error(
            error.code === 1
              ? 'Location access was blocked. Allow it in browser settings, or choose a custom starting address.'
              : error.code === 3
                ? 'Finding your location timed out. Try again, or choose a custom starting address.'
                : 'Couldn’t find your location. Try again, or choose a custom starting address.'
          )
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  });
}
function setupSimplePlace(t) {
  const input = $('#address'),
    status = $('#place-eta'),
    refresh = $('#update-location'),
    form = $('#taskform');
  let version = 0,
    controller;
  function invalidate() {
    version++;
    controller?.abort();
    status.dataset.minutes = '';
    status.textContent = 'Choose the matching store or address to calculate your drive.';
  }
  async function estimate(force = false) {
    const coords = readCoords(input);
    if (!coords) {
      status.textContent = 'Choose the right place from the search suggestions first.';
      return;
    }
    const v = ++version;
    controller?.abort();
    controller = new AbortController();
    refresh.disabled = true;
    status.dataset.minutes = '';
    status.textContent = 'Finding your location and drive time…';
    try {
      if (force || !livePosition || Date.now() - livePosition.captured > 120000) {
        const p = await getCurrentPosition();
        if (v !== version || !form.isConnected) return;
        if (p.accuracy > 1000) throw Error('Your location is too approximate. Try on your phone.');
        livePosition = { lat: p.lat, lon: p.lon, captured: Date.now(), accuracy: p.accuracy };
      }
      const r = await fetch('/api/journey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: [{ lat: livePosition.lat, lon: livePosition.lon }, coords]
        }),
        signal: controller.signal
      });
      const data = await r.json();
      if (v !== version || !form.isConnected) return;
      if (!r.ok) throw Error(data.error);
      const minutes = data.minutes[0]?.[1];
      if (minutes == null) throw Error('No driving route found for this location.');
      status.dataset.minutes = String(minutes);
      status.textContent =
        '↗ About ' +
        minutes +
        ' min drive from where you are now. Your day will connect this stop to the others. No live traffic.';
    } catch (e) {
      if (force) livePosition = null;
      if (v === version && e.name !== 'AbortError')
        status.textContent =
          e.message || 'Couldn’t estimate the drive. Your task can still be saved.';
    } finally {
      if (v === version) refresh.disabled = false;
    }
  }
  input.addEventListener('place-editing', () => {
    invalidate();
    refresh.disabled = false;
  });
  input.addEventListener('place-selected', () => estimate());
  refresh.onclick = () => estimate(true);
  if ($('#pick-home'))
    $('#pick-home').onclick = () => {
      invalidate();
      input.value = state.startingAddress || 'Home';
      input.dataset.name = 'Home';
      writeCoords(input, state.startingCoords);
      estimate();
    };
  if (t.locationCoords) estimate();
  else if (!livePosition) {
    status.textContent =
      'Allow location access for nearby store suggestions and automatic drive times.';
    getCurrentPosition()
      .then(p => {
        if (!form.isConnected || p.accuracy > 1000) return;
        livePosition = { lat: p.lat, lon: p.lon, captured: Date.now(), accuracy: p.accuracy };
        if (readCoords(input)) return;
        status.textContent = 'Location ready. Choose a store to see the drive.';
        if (input.value.trim().length >= 3) input.dispatchEvent(new Event('input'));
      })
      .catch(() => {
        if (form.isConnected)
          status.textContent = 'Choose a store, then allow location access to calculate the drive.';
      });
  }
}
