import L from "https://esm.sh/leaflet@1.9.4";

let TARGET = {

  lat: 32 + 7006666666666667 / 1e16,
 
  lng: 35 + 15746666666666666 / 1e17,
};
const FOUND_RADIUS_METERS = 20; 
const HOT_RADIUS_METERS = 1200;  

function randomOffset() {
  const randBetween = (min, max) => Math.random() * (max - min) + min;
  return {
    lat: randBetween(-0.6, 0.6),
    lng: randBetween(-1.2, 1.2),
  };
}
const START_OFFSET = randomOffset();
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

function lerpColor(t) {
  const cold = { r: 0x2c, g: 0x98, b: 0xf0 };
  const hot = { r: 0xe2, g: 0x4b, b: 0x4b };
  const r = Math.round(cold.r + (hot.r - cold.r) * t);
  const g = Math.round(cold.g + (hot.g - cold.g) * t);
  const b = Math.round(cold.b + (hot.b - cold.b) * t);
  return `rgb(${r},${g},${b})`;
}

let lastMarker = null;
let lastCircle = null;

let prevDistance = null;

function onMapClick(e) {
  const clicked = { lat: e.latlng.lat, lng: e.latlng.lng };
  const d = distanceMeters(clicked, TARGET);

  if (lastMarker) map.removeLayer(lastMarker);
  if (lastCircle) map.removeLayer(lastCircle);

  const raw = 1 - Math.min(d, HOT_RADIUS_METERS) / HOT_RADIUS_METERS;
  const heat = Math.max(0, Math.min(1, raw)); // clamp 0..1

  let title = "";
  if (d <= FOUND_RADIUS_METERS) {
    title = "FOUND!";
  } else if (prevDistance === null) {
    if (heat >= 0.72) {
      title = "Very Hot";
    } else if (heat >= 0.36) {
      title = "Warm";
    } else {
      title = "Cold";
    }
  } else {
    const EPS = 0.5;
    if (d < prevDistance - EPS) {
      title = "Warmer";
    } else if (d > prevDistance + EPS) {
      title = "Colder";
    } else {
      title = "Same";
    }
  }

  const color = lerpColor(heat);
  const markerRadius = 6 + Math.round(6 * heat); // 6..12
  const ringRadius = Math.min(Math.max(20, d), 300);

  lastMarker = L.circleMarker(clicked, {
    radius: markerRadius,
    fillColor: color,
    color: "#fff",
    weight: 2,
    fillOpacity: 0.95,
  }).addTo(map);

  lastCircle = L.circle(clicked, {
    radius: ringRadius,
    color: color,
    weight: 1.4,
    opacity: 0.35 + 0.5 * heat,
    fill: false,
  }).addTo(map);

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

  prevDistance = d;
}

// format to D° MM.mmm
function formatDeg(latOrLng) {
  const negative = latOrLng < 0;
  const abs = Math.abs(latOrLng);
  const deg = Math.floor(abs);
  const minutes = (abs - deg) * 60;
  return `${deg}° ${minutes.toFixed(3)}'${negative ? "W/S" : ""}`;
}

map.on("click", onMapClick);

const container = map.getContainer();

// keyboard: Enter places a marker at center
container.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter") {
    const center = map.getCenter();
    onMapClick({ latlng: center });
  }
});

container.addEventListener("touchend", (ev) => {
  try {
    const t = ev.changedTouches && ev.changedTouches[0];
    if (!t) return;
    const containerPoint = map.mouseEventToContainerPoint(t);
    const latlng = map.containerPointToLatLng(containerPoint);
    onMapClick({ latlng });
  } catch (err) {
    console.warn("touchend conversion failed", err);
  }
}, { passive: true });

map.setView([TARGET.lat + START_OFFSET.lat, TARGET.lng + START_OFFSET.lng], START_ZOOM);

function setTarget(lat, lng, opts = {}) {
  if (typeof lat !== "number" || typeof lng !== "number") {
    console.warn("setTarget requires numeric lat and lng");
    return;
  }
  TARGET = { lat, lng };

  if (lastMarker) {
    map.removeLayer(lastMarker);
    lastMarker = null;
  }
  if (lastCircle) {
    map.removeLayer(lastCircle);
    lastCircle = null;
  }
  prevDistance = null;

  if (opts.recenter === true) {
    map.setView([lat + START_OFFSET.lat, lng + START_OFFSET.lng], opts.zoom || map.getZoom());
  } else if (opts.recenter === "center") {
    map.setView([lat, lng], opts.zoom || map.getZoom());
  }

  if (opts.debug) {
    L.marker([lat, lng]).addTo(map).bindPopup("Target set").openPopup();
  }
}

window.setTarget = setTarget;