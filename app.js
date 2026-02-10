import L from "https://esm.sh/leaflet@1.9.4";

/*
  Target coordinates:
  N 32° 42.568  => 32.70946666666667 (32 + 42.568/60)
  E 035° 06.469 => 35.10781666666667 (35 + 6.469/60)
*/
 // make TARGET mutable so setTarget can update it
let TARGET = { lat: 32 + 42.568 / 60, lng: 35 + 6.469 / 60 };
const FOUND_RADIUS_METERS = 20; // reveal coordinates if within this distance
const HOT_RADIUS_METERS = 1200;  // radius used to compute heat gradient (larger for smoother gradation)

/*
  start the map a bit offset from the target and much more zoomed out so the initial view
  shows roughly the whole country. Use a larger randomized offset so each load varies
  but still keeps the country visible.

  Latitude offset range: ±0.6 degrees (~±67 km)
  Longitude offset range: ±1.2 degrees (~±100-130 km depending on latitude)
*/
function randomOffset() {
  const randBetween = (min, max) => Math.random() * (max - min) + min;
  return {
    lat: randBetween(-0.6, 0.6),
    lng: randBetween(-1.2, 1.2),
  };
}
const START_OFFSET = randomOffset(); // randomized per-load offset from TARGET
const START_ZOOM = 7;

const map = L.map("map", {
  center: [TARGET.lat + START_OFFSET.lat, TARGET.lng + START_OFFSET.lng],
  zoom: START_ZOOM,
  zoomControl: false,
  attributionControl: false,
  tap: false,
  preferCanvas: true,
  dragging: true,
});

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
}).addTo(map);

// small floating zoom controls (touch friendly)
L.control.zoom({ position: "topright" }).addTo(map);

// helper: haversine distance in meters
function distanceMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDlat = Math.sin(dLat / 2);
  const sinDlon = Math.sin(dLon / 2);
  const aa = sinDlat * sinDlat + Math.cos(lat1) * Math.cos(lat2) * sinDlon * sinDlon;
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return R * c;
}

// interpolate color between cold and hot (#2c98f0 -> #e24b4b) based on t in [0,1]
function lerpColor(t) {
  const cold = { r: 0x2c, g: 0x98, b: 0xf0 };
  const hot = { r: 0xe2, g: 0x4b, b: 0x4b };
  const r = Math.round(cold.r + (hot.r - cold.r) * t);
  const g = Math.round(cold.g + (hot.g - cold.g) * t);
  const b = Math.round(cold.b + (hot.b - cold.b) * t);
  return `rgb(${r},${g},${b})`;
}

 // visual target circle (hidden) for reference if debugging - not added to map by default
let lastMarker = null;
let lastCircle = null;

// track previous click distance to give warmer/colder feedback
let prevDistance = null;

function onMapClick(e) {
  const clicked = { lat: e.latlng.lat, lng: e.latlng.lng };
  const d = distanceMeters(clicked, TARGET);

  // remove previous visuals
  if (lastMarker) map.removeLayer(lastMarker);
  if (lastCircle) map.removeLayer(lastCircle);

  // compute heat (1 near target, 0 far away within HOT_RADIUS_METERS)
  const raw = 1 - Math.min(d, HOT_RADIUS_METERS) / HOT_RADIUS_METERS;
  const heat = Math.max(0, Math.min(1, raw)); // clamp 0..1

  // choose label: FOUND! if within reveal radius; otherwise compare to previous click to say Hotter/Colder.
  let title = "";
  if (d <= FOUND_RADIUS_METERS) {
    title = "FOUND!";
  } else if (prevDistance === null) {
    // No previous click — give an initial absolute hint using heat tiers
    if (heat >= 0.72) {
      title = "Very Hot";
    } else if (heat >= 0.36) {
      title = "Warm";
    } else {
      title = "Cold";
    }
  } else {
    // Direct comparison to the previous click: closer -> Hotter, farther -> Colder, equal -> Same
    const EPS = 0.5; // meter tolerance to avoid flicker on near-equal clicks
    if (d < prevDistance - EPS) {
      title = "Warmer";
    } else if (d > prevDistance + EPS) {
      title = "Colder";
    } else {
      title = "Same";
    }
  }

  // color and marker scale respond to heat
  const color = lerpColor(heat);
  const markerRadius = 6 + Math.round(6 * heat); // 6..12
  const ringRadius = Math.min(Math.max(20, d), 300);

  // marker at click
  lastMarker = L.circleMarker(clicked, {
    radius: markerRadius,
    fillColor: color,
    color: "#fff",
    weight: 2,
    fillOpacity: 0.95,
  }).addTo(map);

  // small ring showing distance roughly (clamped)
  lastCircle = L.circle(clicked, {
    radius: ringRadius,
    color: color,
    weight: 1.4,
    opacity: 0.35 + 0.5 * heat,
    fill: false,
  }).addTo(map);

  // popup: only show label or FOUND with coordinates (no numeric distance)
  let body = "";
  if (d <= FOUND_RADIUS_METERS) {
    body = `Coordinates: N ${formatDeg(TARGET.lat)}  E ${formatDeg(TARGET.lng)}`;
  }

  const popup = L.popup({
    closeButton: true,
    autoClose: true,
    closeOnClick: true,
    className: "result-popup",
    maxWidth: 300,
  })
    .setLatLng(clicked)
    .setContent(body
      ? `<strong>${title}</strong><div style="margin-top:6px;white-space:pre-line">${body}</div>`
      : `<strong>${title}</strong>`)
    .openOn(map);

  // store this click distance for the next comparison
  prevDistance = d;
}

// format to D° MM.mmm
function formatDeg(latOrLng) {
  const negative = latOrLng < 0;
  const abs = Math.abs(latOrLng);
  const deg = Math.floor(abs);
  const minutes = (abs - deg) * 60;
  // keep 3 decimals for minutes like original
  return `${deg}° ${minutes.toFixed(3)}'${negative ? "W/S" : ""}`;
}

// Start listening for taps/clicks immediately
map.on("click", onMapClick);

// On mobile the first interaction might be pinch; allow keyboard Enter to place a marker at center,
// and also translate native touchend taps into map clicks so tapping coordinates triggers FOUND!
const container = map.getContainer();

// keyboard: Enter places a marker at center
container.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter") {
    const center = map.getCenter();
    onMapClick({ latlng: center });
  }
});

// touch: convert touchend point to map latlng and call onMapClick.
// This ensures tapping on mobile (touchend) uses the same logic as a mouse click and will show FOUND!
container.addEventListener("touchend", (ev) => {
  try {
    const t = ev.changedTouches && ev.changedTouches[0];
    if (!t) return;
    // Leaflet can convert a mouse/touch event to container point; use mouseEventToContainerPoint for consistency
    const containerPoint = map.mouseEventToContainerPoint(t);
    const latlng = map.containerPointToLatLng(containerPoint);
    onMapClick({ latlng });
  } catch (err) {
    // fallback: do nothing on error
    console.warn("touchend conversion failed", err);
  }
}, { passive: true });

// keep a bit of context around the target but don't center directly on it
map.setView([TARGET.lat + START_OFFSET.lat, TARGET.lng + START_OFFSET.lng], START_ZOOM);

// setTarget: update the TARGET coordinates programmatically.
// Usage: setTarget(32.7094666667, 35.1078166667) or setTarget(lat, lng, { recenter: true, zoom: 13 })
function setTarget(lat, lng, opts = {}) {
  if (typeof lat !== "number" || typeof lng !== "number") {
    console.warn("setTarget requires numeric lat and lng");
    return;
  }
  TARGET = { lat, lng };

  // clear visual state
  if (lastMarker) {
    map.removeLayer(lastMarker);
    lastMarker = null;
  }
  if (lastCircle) {
    map.removeLayer(lastCircle);
    lastCircle = null;
  }
  prevDistance = null;

  // optionally recenter the map around new target (respect START_OFFSET if recenter is 'offset')
  if (opts.recenter === true) {
    map.setView([lat + START_OFFSET.lat, lng + START_OFFSET.lng], opts.zoom || map.getZoom());
  } else if (opts.recenter === "center") {
    map.setView([lat, lng], opts.zoom || map.getZoom());
  }

  // small debug marker for the new target can be toggled via opts.debug
  if (opts.debug) {
    L.marker([lat, lng]).addTo(map).bindPopup("Target set").openPopup();
  }
}

// expose to global so you can call it from console or other scripts
window.setTarget = setTarget;
