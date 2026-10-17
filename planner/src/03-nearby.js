// Nearby: live location watching and nearby replanning
function updateNearbyStatus() {
  if ($('#nearby-status')) $('#nearby-status').textContent = nearbyMessage;
}
function distanceMeters(a, b) {
  const r = Math.PI / 180,
    x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) * r) / 2),
    y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6371000;
}
function toggleNearby() {
  nearbyEnabled = !nearbyEnabled;
  try {
    plannerStorage.setItem('lbl-nearby-enabled', nearbyEnabled ? '1' : '0');
  } catch {}
  if (nearbyEnabled) startNearbyWatch();
  else {
    stopNearbyWatch();
    nearbyMessage = 'Location updates paused. You can still refresh your route manually.';
  }
  render();
}
function stopNearbyWatch() {
  if (locationWatch != null) {
    navigator.geolocation?.clearWatch(locationWatch);
    locationWatch = null;
  }
}
function startNearbyWatch() {
  if (locationWatch != null || !nearbyEnabled || document.visibilityState === 'hidden') return;
  if (!navigator.geolocation) {
    nearbyMessage = 'Location isn’t available in this browser.';
    updateNearbyStatus();
    return;
  }
  nearbyMessage = 'Waiting for your location permission…';
  updateNearbyStatus();
  locationWatch = navigator.geolocation.watchPosition(
    p => {
      if (!nearbyEnabled) return;
      if (p.coords.accuracy > 1000) {
        nearbyMessage =
          'Your location is too approximate for nearby suggestions. Try on your phone.';
        updateNearbyStatus();
        return;
      }
      livePosition = {
        lat: p.coords.latitude,
        lon: p.coords.longitude,
        captured: Date.now(),
        accuracy: p.coords.accuracy
      };
      nearbyMessage = 'Location is up to date. Your plan adjusts as you move between stops.';
      updateNearbyStatus();
      if (
        cloudReady &&
        !cloudBlocked &&
        !routeBusy &&
        (!lastRoutePosition || distanceMeters(lastRoutePosition, livePosition) > 300) &&
        Date.now() - lastRouteAt > 90000
      )
        plan({ auto: true });
    },
    e => {
      nearbyMessage =
        e.code === 1
          ? 'Location access is blocked. Allow it in browser settings to use nearby planning.'
          : 'Location is temporarily unavailable. Your saved plan is unchanged.';
      updateNearbyStatus();
      if (e.code === 1) {
        livePosition = null;
        liveEtas = {};
        stopNearbyWatch();
      }
    },
    { enableHighAccuracy: true, maximumAge: 60000, timeout: 20000 }
  );
}

