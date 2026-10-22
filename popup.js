const MODE_SPEEDS = {
  sleep: 0.003,
  focus: 0.008,
  normal: 0.015
};

const DEFAULT_CUSTOM = { x: 0, y: 0.75 }; // normalized: x [-1..1] right, y [-1..1] front
const custom = { ...DEFAULT_CUSTOM };

const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';

const el = (name, attrs, parent) => {
  const n = document.createElementNS(NS, name);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  parent.appendChild(n);
  return n;
};

// ---------- Coordinate Grid & Radar Ticks ----------
const gridEl = $('grid');
for (let v = -96; v <= 96; v += 16) {
  if (v === 0) continue;
  el('line', { class: 'grid-line', x1: v, y1: -96, x2: v, y2: 96 }, gridEl);
  el('line', { class: 'grid-line', x1: -96, y1: v, x2: 96, y2: v }, gridEl);
}

const ticksEl = $('ticks');
for (let a = 0; a < 360; a += 15) {
  const major = a % 90 === 0;
  const mid = a % 45 === 0;
  const len = major ? 8 : mid ? 6 : 3.5;
  const r = (a * Math.PI) / 180;
  const s = Math.sin(r);
  const c = -Math.cos(r);
  el(
    'line',
    {
      class: major || mid ? 'tick-lg' : 'tick',
      x1: (96 - len) * s,
      y1: (96 - len) * c,
      x2: 96 * s,
      y2: 96 * c
    },
    ticksEl
  );
}

// Motion trail echo elements
const TRAIL = 20;
const trailEls = [];
const history = [];
const trailContainer = $('trail');
for (let i = 0; i < TRAIL; i++) {
  trailEls.push(el('circle', { class: 'trail', r: 1, cx: 0, cy: 0, opacity: 0 }, trailContainer));
}

// ---------- DOM Elements ----------
const enabled = $('enabled');
const speed = $('speed');
const speedOut = $('speedOut');
const motion = $('motion');
const map = $('map');
const resetBtn = $('reset');
const modeRadios = document.querySelectorAll('input[name=mode]');
const pulseDot = $('pulseDot');
const audioEngineStatus = $('audioEngineStatus');

// 3-Column Readout Elements: Azimuth (left), Position (center), Coordinates (right)
const rAz = $('rAz');
const rPos = $('rPos');
const rX = $('rX');
const rY = $('rY');

// Real-time audio spectrum meters
const meterBass = $('meterBass');
const meterVocal = $('meterVocal');
const meterTreble = $('meterTreble');
const valBass = $('valBass');
const valVocal = $('valVocal');
const valTreble = $('valTreble');
const halo = $('halo');
const dot = $('dot');
const bearing = $('bearing');

const isCustom = () => motion.value === 'custom';

// Real-time engine telemetry state
let engineState = {
  connected: false,
  isPlaying: false,
  enabled: true,
  currentX: 0,
  currentY: 0,
  currentZ: -1,
  bass: 0,
  vocal: 0,
  treble: 0,
  energy: 0,
  spatialMaterial: false
};

// Interpolated display position
let displayPos = { x: 0, y: -72 };

// ---------- Storage & Broadcast ----------
function saveAndBroadcast(settings) {
  chrome.storage.local.set(settings);
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (typeof tab.id !== 'number' || !/^https?:\/\//i.test(tab.url || '')) {
        return;
      }
      chrome.tabs.sendMessage(tab.id, { type: 'UPDATE_SETTINGS', settings }, () => {
        void chrome.runtime.lastError;
      });
    });
  });
}

let lastDragBroadcast = 0;
function broadcastCustomDrag(x, y) {
  const now = performance.now();
  if (now - lastDragBroadcast > 35) {
    lastDragBroadcast = now;
    saveAndBroadcast({ customPos: { x, y } });
  }
}

// ---------- Render UI State ----------
function render() {
  const isEffectEnabled = enabled.checked;
  document.body.classList.toggle('off', !isEffectEnabled);
  document.body.classList.toggle('is-custom', isCustom());
  map.classList.toggle('custom', isCustom());
  map.tabIndex = isCustom() ? 0 : -1;

  const currentSpeed = Number(speed.value);
  speedOut.textContent = currentSpeed.toFixed(3);
  const percent = ((currentSpeed - speed.min) / (speed.max - speed.min)) * 100;
  speed.style.setProperty('--fill', percent + '%');

  // Match active mode radio button
  modeRadios.forEach((radio) => {
    const preset = MODE_SPEEDS[radio.value];
    if (preset && Math.abs(preset - currentSpeed) < 0.0005) {
      radio.checked = true;
    }
  });

  updateStatusUI();
}

function updateStatusUI() {
  if (!enabled.checked) {
    pulseDot.className = 'pulse-dot disabled';
    audioEngineStatus.textContent = '16D Disabled';
    return;
  }

  if (!engineState.connected) {
    pulseDot.className = 'pulse-dot standby';
    audioEngineStatus.textContent = 'No Video Detected';
  } else if (!engineState.isPlaying) {
    pulseDot.className = 'pulse-dot paused';
    audioEngineStatus.textContent = 'Audio Paused';
  } else {
    pulseDot.className = 'pulse-dot active';
    audioEngineStatus.textContent = engineState.spatialMaterial ? '16D Wide 360°' : '16D Active';
  }
}

function handleSettingsChange() {
  render();
  saveAndBroadcast({
    enabled: enabled.checked,
    movementMode: motion.value,
    speed: Number(speed.value),
    customPos: isCustom() ? { x: custom.x, y: custom.y } : undefined
  });
}

// ---------- Custom Placement (Manual Drag & Keys) ----------
function limitCustom() {
  const d = Math.hypot(custom.x, custom.y);
  if (d > 1) {
    custom.x /= d;
    custom.y /= d;
  }
}

function placeFromPointer(e) {
  if (!isCustom()) return;
  const pt = map.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const m = pt.matrixTransform(map.getScreenCTM().inverse());
  custom.x = Math.max(-1, Math.min(1, m.x / 96));
  custom.y = Math.max(-1, Math.min(1, -m.y / 96));
  limitCustom();
  broadcastCustomDrag(custom.x, custom.y);
}

let dragging = false;
map.addEventListener('pointerdown', (e) => {
  // Drag is ONLY permitted when motion pattern is explicitly set to Custom!
  if (!isCustom()) return;
  dragging = true;
  map.setPointerCapture(e.pointerId);
  placeFromPointer(e);
});

map.addEventListener('pointermove', (e) => {
  if (dragging && isCustom()) {
    placeFromPointer(e);
  }
});

const endDrag = () => {
  if (dragging) {
    dragging = false;
    if (isCustom()) {
      saveAndBroadcast({ customPos: { x: custom.x, y: custom.y } });
    }
  }
};
map.addEventListener('pointerup', endDrag);
map.addEventListener('pointercancel', endDrag);

map.addEventListener('keydown', (e) => {
  if (!isCustom()) return;
  const step = e.shiftKey ? 0.05 : 0.01;
  const d = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, step],
    ArrowDown: [0, -step]
  }[e.key];

  if (!d) return;
  e.preventDefault();
  custom.x += d[0];
  custom.y += d[1];
  limitCustom();
  saveAndBroadcast({ customPos: { x: custom.x, y: custom.y } });
});

resetBtn.addEventListener('click', () => {
  if (!isCustom()) return;
  Object.assign(custom, DEFAULT_CUSTOM);
  saveAndBroadcast({ customPos: { x: custom.x, y: custom.y } });
});

// ---------- Control Event Listeners ----------
enabled.addEventListener('change', handleSettingsChange);

speed.addEventListener('input', () => {
  render();
  saveAndBroadcast({ speed: Number(speed.value) });
});

motion.addEventListener('change', () => {
  history.length = 0;
  handleSettingsChange();
});

modeRadios.forEach((radio) => {
  radio.addEventListener('change', () => {
    if (radio.checked) {
      const newSpeed = MODE_SPEEDS[radio.value];
      if (typeof newSpeed === 'number') {
        speed.value = newSpeed;
        render();
        saveAndBroadcast({ speed: newSpeed });
      }
    }
  });
});

// ---------- Compass & Coordinate Formatting ----------
const COMPASS_NAMES = [
  'Front',
  'Front Right',
  'Right',
  'Back Right',
  'Back',
  'Back Left',
  'Left',
  'Front Left'
];

const formatCoord = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2);

// ---------- Main Render Loop (Synchronized with Audio Engine) ----------
function draw() {
  let targetX = 0;
  let targetY = -72;

  if (isCustom()) {
    // In Custom mode, use user's coordinates directly
    targetX = custom.x * 96;
    targetY = -custom.y * 96;
    displayPos.x = targetX;
    displayPos.y = targetY;
  } else {
    // In Automatic modes: read actual coordinates generated by content.js engine
    if (engineState.connected) {
      const mode = motion.value;
      if (mode === 'sweep') {
        targetX = (engineState.currentX / 0.9) * 72;
        targetY = -34;
      } else if (mode === 'cinema') {
        targetX = (engineState.currentX / 1.8) * 70;
        targetY = (engineState.currentZ / 1.8) * 56;
      } else {
        // orbit (360)
        targetX = (engineState.currentX / 2.6) * 72;
        targetY = (engineState.currentZ / 2.6) * 72;
      }

      // Smooth interpolation to real engine position
      const smoothing = engineState.isPlaying ? 0.35 : 1.0;
      displayPos.x += (targetX - displayPos.x) * smoothing;
      displayPos.y += (targetY - displayPos.y) * smoothing;
    }
  }

  // Constrain position within radar rim (radius 96)
  const dist = Math.hypot(displayPos.x, displayPos.y);
  if (dist > 94) {
    displayPos.x = (displayPos.x / dist) * 94;
    displayPos.y = (displayPos.y / dist) * 94;
  }

  // Update dot & halo positions
  dot.setAttribute('cx', displayPos.x);
  dot.setAttribute('cy', displayPos.y);
  halo.setAttribute('cx', displayPos.x);
  halo.setAttribute('cy', displayPos.y);

  // Halo pulse reflects real audio energy
  const baseHaloRadius = isCustom() ? 13 : 11;
  const pulseRadius = baseHaloRadius + (engineState.isPlaying && enabled.checked ? engineState.energy * 14 : 0);
  halo.setAttribute('r', pulseRadius);

  // Update bearing line
  bearing.setAttribute('x2', displayPos.x);
  bearing.setAttribute('y2', displayPos.y);

  // Update motion trail echoes (clear trail when paused or in custom mode)
  if (isCustom() || !engineState.isPlaying || !enabled.checked) {
    history.length = 0;
  } else {
    history.push({ x: displayPos.x, y: displayPos.y });
    if (history.length > TRAIL) history.shift();
  }

  trailEls.forEach((circle, i) => {
    const h = history[history.length - 1 - i];
    if (!h || i === 0) {
      circle.setAttribute('opacity', 0);
      return;
    }
    circle.setAttribute('cx', h.x);
    circle.setAttribute('cy', h.y);
    circle.setAttribute('r', Math.max(1, 4 - i * 0.16));
    circle.setAttribute('opacity', (1 - i / TRAIL) * 0.4);
  });

  // Update 3-Column Readout: Azimuth, Position, Coordinates
  const az = (Math.atan2(displayPos.x, -displayPos.y) * 180 / Math.PI + 360) % 360;
  rAz.textContent = (isCustom() ? az.toFixed(1) : Math.round(az)) + '°';
  rPos.textContent = COMPASS_NAMES[Math.round(az / 45) % 8];
  rX.textContent = formatCoord(displayPos.x / 96);
  rY.textContent = formatCoord(-displayPos.y / 96);

  requestAnimationFrame(draw);
}

// ---------- Real-time Audio Spectrum Telemetry ----------
function queryAudioStatus() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0] || typeof tabs[0].id !== 'number') {
      engineState.connected = false;
      engineState.isPlaying = false;
      resetMeters();
      updateStatusUI();
      return;
    }

    chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_AUDIO_STATUS' }, (res) => {
      if (chrome.runtime.lastError || !res) {
        engineState.connected = false;
        engineState.isPlaying = false;
        resetMeters();
        updateStatusUI();
        return;
      }

      engineState = { ...res };
      updateStatusUI();

      if (res.isPlaying && enabled.checked) {
        // Precise percentage display from engine frequency telemetry
        const bPct = Math.min(100, Math.round((res.bass || 0) * 100));
        const vPct = Math.min(100, Math.round((res.vocal || 0) * 100));
        const tPct = Math.min(100, Math.round((res.treble || 0) * 100));

        meterBass.style.width = Math.max(3, bPct) + '%';
        meterVocal.style.width = Math.max(3, vPct) + '%';
        meterTreble.style.width = Math.max(3, tPct) + '%';

        valBass.textContent = bPct + '%';
        valVocal.textContent = vPct + '%';
        valTreble.textContent = tPct + '%';
      } else {
        resetMeters();
      }
    });
  });
}

function resetMeters() {
  meterBass.style.width = '0%';
  meterVocal.style.width = '0%';
  meterTreble.style.width = '0%';
  valBass.textContent = '0%';
  valVocal.textContent = '0%';
  valTreble.textContent = '0%';
}

setInterval(queryAudioStatus, 100);

// ---------- Load Initial Settings ----------
chrome.storage.local.get(['speed', 'enabled', 'movementMode', 'customPos'], (data) => {
  const currentSpeed = typeof data.speed === 'number' ? data.speed : MODE_SPEEDS.focus;
  speed.value = currentSpeed;
  enabled.checked = data.enabled !== false;

  const validModes = ['orbit', 'sweep', 'cinema', 'custom'];
  motion.value = validModes.includes(data.movementMode) ? data.movementMode : 'orbit';

  if (data.customPos && typeof data.customPos.x === 'number' && typeof data.customPos.y === 'number') {
    custom.x = Math.max(-1, Math.min(1, data.customPos.x));
    custom.y = Math.max(-1, Math.min(1, data.customPos.y));
    limitCustom();
  }

  render();
  draw();
  queryAudioStatus();
});
