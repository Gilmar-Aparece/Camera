/* ============================================================
   PhoneLens — app.js
   Handles: camera enumeration, stream, snapshot, gallery, UI
   ============================================================ */

'use strict';

// ── DOM refs ──────────────────────────────────────────────────
const videoEl       = document.getElementById('videoFeed');
const canvasEl      = document.getElementById('snapCanvas');
const placeholder   = document.getElementById('videoPlaceholder');
const liveBadge     = document.getElementById('liveBadge');
const snapFlash     = document.getElementById('snapFlash');

const cameraSelect  = document.getElementById('cameraSelect');
const facingSelect  = document.getElementById('facingSelect');
const resSelect     = document.getElementById('resSelect');

const scanBtn       = document.getElementById('scanBtn');
const startBtn      = document.getElementById('startBtn');
const stopBtn       = document.getElementById('stopBtn');
const snapBtn       = document.getElementById('snapBtn');
const flipBtn       = document.getElementById('flipBtn');
const fsBtn         = document.getElementById('fsBtn');

const statusText    = document.getElementById('statusText');
const resInfo       = document.getElementById('resInfo');
const gallerySection= document.getElementById('gallerySection');
const galleryEl     = document.getElementById('gallery');

// Step indicators
const step1         = document.getElementById('step1');
const step2         = document.getElementById('step2');
const step3         = document.getElementById('step3');

// ── State ─────────────────────────────────────────────────────
let currentStream   = null;
let mirrored        = false;
let snapCount       = 0;
const snapshots     = [];   // { id, dataUrl, filename }

// ── Helpers ───────────────────────────────────────────────────
function setStatus(msg, type = 'info') {
  statusText.textContent = msg;
  statusText.style.color =
    type === 'error'   ? 'var(--danger)'  :
    type === 'success' ? 'var(--success)' :
                         'var(--text-muted)';
}

function activateStep(n) {
  [step1, step2, step3].forEach((s, i) =>
    s.classList.toggle('active', i < n)
  );
}

function parseResolution(val) {
  const [w, h] = val.split('x').map(Number);
  return { width: w, height: h };
}

// ── Scan cameras ──────────────────────────────────────────────
async function scanCameras() {
  setStatus('Scanning for cameras…');
  scanBtn.disabled = true;

  try {
    // Need a short permission grant to get device labels
    const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
    tempStream.getTracks().forEach(t => t.stop());

    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams    = devices.filter(d => d.kind === 'videoinput');

    cameraSelect.innerHTML = '';

    if (cams.length === 0) {
      cameraSelect.innerHTML = '<option value="">No cameras found</option>';
      setStatus('No cameras detected. Check connection.', 'error');
      return;
    }

    cams.forEach((cam, i) => {
      const opt   = document.createElement('option');
      opt.value   = cam.deviceId;
      opt.text    = cam.label || `Camera ${i + 1}`;
      cameraSelect.appendChild(opt);
    });

    setStatus(`Found ${cams.length} camera(s). Select one and press Start.`, 'success');
    activateStep(2);

  } catch (err) {
    if (err.name === 'NotAllowedError') {
      setStatus('Camera permission denied. Allow access in your browser settings.', 'error');
    } else {
      setStatus(`Scan failed: ${err.message}`, 'error');
    }
  } finally {
    scanBtn.disabled = false;
  }
}

// ── Start camera ──────────────────────────────────────────────
async function startCamera() {
  if (currentStream) stopCamera();

  startBtn.disabled = true;
  setStatus('Starting camera…');

  const { width, height } = parseResolution(resSelect.value);
  const deviceId          = cameraSelect.value;
  const facingMode        = facingSelect.value;

  // Build constraints — prefer deviceId if user selected one
  const videoConstraints = deviceId
    ? { deviceId: { exact: deviceId }, width: { ideal: width }, height: { ideal: height } }
    : { facingMode, width: { ideal: width }, height: { ideal: height } };

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: false,
    });

    currentStream      = stream;
    videoEl.srcObject  = stream;

    videoEl.onloadedmetadata = () => {
      const tw = videoEl.videoWidth;
      const th = videoEl.videoHeight;
      resInfo.textContent = `${tw} × ${th}`;
      setStatus('Camera running.', 'success');
    };

    // UI updates
    placeholder.classList.add('hidden');
    liveBadge.style.display   = 'flex';
    stopBtn.disabled           = false;
    snapBtn.disabled           = false;
    startBtn.disabled          = false;
    activateStep(3);

  } catch (err) {
    startBtn.disabled = false;
    if (err.name === 'NotAllowedError') {
      setStatus('Permission denied — allow camera access.', 'error');
    } else if (err.name === 'NotFoundError') {
      setStatus('Camera not found. Make sure it\'s connected.', 'error');
    } else if (err.name === 'OverconstrainedError') {
      setStatus('Resolution not supported — try a lower resolution.', 'error');
    } else {
      setStatus(`Error: ${err.message}`, 'error');
    }
  }
}

// ── Stop camera ───────────────────────────────────────────────
function stopCamera() {
  if (!currentStream) return;

  currentStream.getTracks().forEach(t => t.stop());
  currentStream         = null;
  videoEl.srcObject     = null;
  resInfo.textContent   = '';

  placeholder.classList.remove('hidden');
  liveBadge.style.display = 'none';
  stopBtn.disabled        = true;
  snapBtn.disabled        = true;

  setStatus('Camera stopped.');
  activateStep(1);
}

// ── Snapshot ──────────────────────────────────────────────────
function takeSnapshot() {
  if (!currentStream) return;

  const w = videoEl.videoWidth;
  const h = videoEl.videoHeight;

  canvasEl.width  = w;
  canvasEl.height = h;

  const ctx = canvasEl.getContext('2d');
  if (mirrored) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(videoEl, 0, 0, w, h);

  const dataUrl  = canvasEl.toDataURL('image/png');
  const filename = `phonelens-${++snapCount}-${Date.now()}.png`;

  snapshots.unshift({ id: snapCount, dataUrl, filename });
  renderGallery();

  // Flash effect
  snapFlash.classList.add('flash');
  setTimeout(() => snapFlash.classList.remove('flash'), 200);

  setStatus(`Snapshot saved: ${filename}`, 'success');
}

// ── Gallery ───────────────────────────────────────────────────
function renderGallery() {
  if (snapshots.length === 0) {
    gallerySection.style.display = 'none';
    return;
  }

  gallerySection.style.display = 'flex';
  galleryEl.innerHTML = '';

  snapshots.forEach(snap => {
    const item = document.createElement('div');
    item.className = 'gallery-item';
    item.innerHTML = `
      <img src="${snap.dataUrl}" alt="Snapshot ${snap.id}" />
      <div class="gallery-item-actions">
        <a href="${snap.dataUrl}" download="${snap.filename}">⬇ Save</a>
        <button data-id="${snap.id}">🗑 Delete</button>
      </div>
    `;
    galleryEl.appendChild(item);
  });

  // Delete handlers
  galleryEl.querySelectorAll('button[data-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id  = Number(btn.dataset.id);
      const idx = snapshots.findIndex(s => s.id === id);
      if (idx !== -1) snapshots.splice(idx, 1);
      renderGallery();
    });
  });
}

// ── Mirror / flip ─────────────────────────────────────────────
function toggleMirror() {
  mirrored = !mirrored;
  videoEl.classList.toggle('mirrored', mirrored);
  setStatus(mirrored ? 'Mirror on.' : 'Mirror off.');
}

// ── Fullscreen ────────────────────────────────────────────────
function toggleFullscreen() {
  const wrapper = document.getElementById('videoWrapper');
  if (!document.fullscreenElement) {
    wrapper.requestFullscreen().catch(() =>
      setStatus('Fullscreen not supported in this browser.', 'error')
    );
  } else {
    document.exitFullscreen();
  }
}

// ── Device change listener ────────────────────────────────────
navigator.mediaDevices.addEventListener('devicechange', () => {
  setStatus('Device list changed — rescan cameras.');
});

// ── Event bindings ────────────────────────────────────────────
scanBtn.addEventListener('click',  scanCameras);
startBtn.addEventListener('click', startCamera);
stopBtn.addEventListener('click',  stopCamera);
snapBtn.addEventListener('click',  takeSnapshot);
flipBtn.addEventListener('click',  toggleMirror);
fsBtn.addEventListener('click',    toggleFullscreen);

// Keyboard shortcut: Space = snapshot when camera is live
document.addEventListener('keydown', e => {
  if (e.code === 'Space' && currentStream && e.target === document.body) {
    e.preventDefault();
    takeSnapshot();
  }
});

// ── Init ──────────────────────────────────────────────────────
(function init() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus('Your browser does not support camera access. Try Chrome or Firefox.', 'error');
    scanBtn.disabled  = true;
    startBtn.disabled = true;
    return;
  }
  setStatus('Ready. Click "Scan Cameras" to detect available cameras.');
  activateStep(1);
})();
