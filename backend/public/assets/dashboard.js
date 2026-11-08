const $ = (id) => document.getElementById(id);
let credentials = null;

function showStatus(element, message, type = '') {
  element.textContent = message;
  element.className = `status show ${type}`.trim();
}

function setConnectionState(connected) {
  $('authCard').classList.toggle('is-connected', connected);
  $('authFields').classList.toggle('hidden', connected);
  $('authActions').classList.toggle('hidden', connected);
  $('connectedNotice').classList.toggle('hidden', !connected);
  $('createBtn').disabled = !connected;
  $('refreshBtn').disabled = !connected;
}

function getAuthHeader() {
  if (!credentials) throw new Error('Connect to the dashboard first.');
  return `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`;
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', getAuthHeader());
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

$('connectBtn').addEventListener('click', async () => {
  const username = $('username').value.trim();
  const password = $('password').value;
  if (!username || !password) {
    $('authStatus').textContent = 'Enter both administrator credentials.';
    return;
  }
  credentials = { username, password };
  $('connectBtn').disabled = true;
  $('authStatus').textContent = 'Checking credentials…';
  try {
    await loadReports();
    $('password').value = '';
    $('authStatus').textContent = '';
    setConnectionState(true);
  } catch (error) {
    credentials = null;
    $('authStatus').textContent = error.message;
  } finally {
    $('connectBtn').disabled = false;
  }
});

$('disconnectBtn').addEventListener('click', () => {
  credentials = null;
  $('username').value = '';
  $('password').value = '';
  $('reportsList').replaceChildren();
  $('reportsState').textContent = 'Connect to the dashboard to view demonstration responses.';
  $('reportsState').classList.remove('hidden');
  $('authStatus').textContent = 'Disconnected';
  setConnectionState(false);
});

$('image').addEventListener('change', () => {
  const file = $('image').files?.[0];
  if (!file) return;
  $('uploadTitle').textContent = file.name;
  $('uploadHint').textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB selected`;
  const preview = $('preview');
  preview.src = URL.createObjectURL(file);
  preview.classList.remove('hidden');
  $('result').classList.add('hidden');
});

$('createForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!credentials) {
    showStatus($('createStatus'), 'Connect to the dashboard before creating a link.', 'error');
    return;
  }
  const file = $('image').files?.[0];
  if (!file) return showStatus($('createStatus'), 'Choose an image first.', 'error');
  if (file.size > 3 * 1024 * 1024) return showStatus($('createStatus'), 'Image must be 3 MB or smaller.', 'error');

  const form = new FormData();
  form.append('title', $('title').value.trim());
  form.append('expiryHours', $('expiry').value);
  form.append('image', file);
  $('createBtn').disabled = true;
  $('createStatus').className = 'status';
  try {
    const data = await api('/api/sessions', { method: 'POST', body: form });
    $('shareUrl').value = data.shareUrl;
    $('openLink').href = data.shareUrl;
    $('resultExpiry').textContent = `Expires ${new Date(data.expiresAt).toLocaleString()}`;
    $('result').classList.remove('hidden');
    showStatus($('createStatus'), 'Secure consent link created. Share it with your demonstration participant.', 'success');
    $('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    try {
      await loadReports();
    } catch (reportError) {
      showReportError(reportError);
    }
  } catch (error) {
    showStatus($('createStatus'), error.message, 'error');
  } finally {
    $('createBtn').disabled = false;
  }
});

async function copyShareLink() {
  const value = $('shareUrl').value;
  if (!value) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      $('shareUrl').select();
      if (!document.execCommand('copy')) throw new Error('Copy is unavailable in this browser.');
    }
    $('copyBtn').textContent = 'Copied';
    window.setTimeout(() => { $('copyBtn').textContent = 'Copy link'; }, 1600);
  } catch (error) {
    showStatus($('createStatus'), error.message || 'Could not copy the link. Select and copy it manually.', 'error');
  }
}

$('copyBtn').addEventListener('click', copyShareLink);

async function createSanitizedPhotoAttachment(file) {
  if (!file || typeof createImageBitmap !== 'function') {
    throw new Error('This browser cannot prepare a safe photo attachment.');
  }

  // Re-encode in the browser before sharing so original EXIF/GPS metadata
  // is not passed on to the messaging app.
  const bitmap = await createImageBitmap(file);
  try {
    const maxDimension = 1600;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare the photo attachment.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.84));
    if (!blob) throw new Error('Could not encode the photo attachment.');

    const baseName = file.name.replace(/\\.[^.]+$/, '') || 'tracelabs-photo';
    return new File([blob], `${baseName}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now()
    });
  } finally {
    bitmap.close?.();
  }
}

$('shareBtn').addEventListener('click', async () => {
  const url = $('shareUrl').value;
  if (!url) return;

  const shareData = {
    title: 'TraceLabs consent-based location demo',
    text: 'This photo is being shared with a clearly labelled TraceLabs location-consent request. Open the accompanying request to review it. No location is shared unless you choose to consent and approve your browser permission.',
    url
  };

  try {
    if (!navigator.share) {
      await copyShareLink();
      showStatus($('createStatus'), 'Consent link copied. Share the selected photo separately and clearly identify the TraceLabs consent request.', 'success');
      return;
    }

    const selectedPhoto = $('image').files?.[0];
    if (selectedPhoto && typeof navigator.canShare === 'function') {
      try {
        const safePhoto = await createSanitizedPhotoAttachment(selectedPhoto);
        const photoPayload = { ...shareData, files: [safePhoto] };
        if (navigator.canShare({ files: [safePhoto] })) {
          await navigator.share(photoPayload);
          showStatus($('createStatus'), 'Photo attachment and clearly labelled consent request shared.', 'success');
          return;
        }
      } catch (photoError) {
        // If photo attachment sharing is unsupported, continue with the
        // clearly labelled consent link. Never share the unsanitized original.
      }
    }

    await navigator.share(shareData);
    showStatus($('createStatus'), 'Consent invitation shared. This browser did not support attaching the photo in the share sheet.', 'success');
  } catch (error) {
    if (error.name !== 'AbortError') {
      showStatus($('createStatus'), error.message || 'Could not open the share sheet.', 'error');
    }
  }
});

$('refreshBtn').addEventListener('click', () => loadReports().catch(showReportError));

function showReportError(error) {
  $('reportsState').textContent = error.message;
  $('reportsState').classList.remove('hidden');
}

async function loadReports() {
  const data = await api('/api/admin/sessions');
  const list = $('reportsList');
  list.replaceChildren();
  $('reportsState').classList.toggle('hidden', data.sessions.length > 0);
  if (!data.sessions.length) {
    $('reportsState').textContent = 'No responses yet. Create a link, then ask your participant to review and consent to the request.';
    return;
  }

  for (const session of data.sessions) {
    const hasLocation = session.latitude !== null && session.latitude !== undefined;
    const item = document.createElement('article');
    item.className = 'report-item';

    const left = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = session.title;
    const meta = document.createElement('div');
    meta.className = 'report-meta';
    meta.textContent = `Created ${new Date(session.created_at).toLocaleString()} · Expires ${new Date(session.expires_at).toLocaleString()}`;

    const state = document.createElement('span');
    state.className = `report-state ${hasLocation ? 'received' : 'pending'}`;
    state.textContent = hasLocation ? 'LOCATION RECEIVED' : 'AWAITING CONSENT';
    left.append(title, meta, state);

    if (hasLocation) {
      const coords = document.createElement('div');
      coords.className = 'report-coords';
      coords.textContent = `Consent received ${new Date(session.consented_at).toLocaleString()} · ${Number(session.accuracy_m).toFixed(0)} m accuracy · ${Number(session.latitude).toFixed(5)}, ${Number(session.longitude).toFixed(5)}`;
      left.append(coords);
    }

    const actions = document.createElement('div');
    actions.className = 'report-actions';
    if (hasLocation) {
      const map = document.createElement('a');
      map.className = 'btn btn-secondary';
      map.href = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(session.latitude)}&mlon=${encodeURIComponent(session.longitude)}#map=16/${encodeURIComponent(session.latitude)}/${encodeURIComponent(session.longitude)}`;
      map.target = '_blank';
      map.rel = 'noopener noreferrer';
      map.textContent = 'View map ↗';
      actions.append(map);
    }

    const remove = document.createElement('button');
    remove.className = 'delete-btn';
    remove.type = 'button';
    remove.textContent = 'Delete data';
    remove.addEventListener('click', async () => {
      if (!confirm('Delete this session and its location report permanently?')) return;
      try {
        await api(`/api/admin/sessions/${encodeURIComponent(session.id)}`, { method: 'DELETE' });
        await loadReports();
      } catch (error) {
        alert(error.message);
      }
    });
    actions.append(remove);
    item.append(left, actions);
    list.append(item);
  }
}


// Start locked; the administrator must authenticate before creating links or viewing reports.
setConnectionState(false);
