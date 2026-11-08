const $ = (id) => document.getElementById(id);
let credentials = null;

function showStatus(element, message, type = '') {
  element.textContent = message;
  element.className = `status show ${type}`.trim();
}
function getAuthHeader() {
  if (!credentials) throw new Error('Connect to your TraceLab server first.');
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
  $('authStatus').textContent = 'Checking credentials…';
  try {
    await loadReports();
    $('authStatus').textContent = 'Connected securely for this browser session.';
  } catch (error) {
    credentials = null;
    $('authStatus').textContent = error.message;
  }
});

$('image').addEventListener('change', () => {
  const file = $('image').files?.[0];
  if (!file) return;
  $('uploadTitle').textContent = file.name;
  $('uploadHint').textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB selected`;
  const preview = $('preview');
  preview.src = URL.createObjectURL(file);
  preview.classList.remove('hidden');
});

$('createForm').addEventListener('submit', async (event) => {
  event.preventDefault();
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
    showStatus($('createStatus'), 'Image metadata was removed and the consent link is ready.', 'success');
    await loadReports();
  } catch (error) {
    showStatus($('createStatus'), error.message, 'error');
  } finally {
    $('createBtn').disabled = false;
  }
});

$('copyBtn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('shareUrl').value);
    $('copyBtn').textContent = 'Copied';
    setTimeout(() => { $('copyBtn').textContent = 'Copy'; }, 1500);
  } catch {
    $('shareUrl').select();
    document.execCommand('copy');
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
  list.innerHTML = '';
  $('reportsState').classList.toggle('hidden', data.sessions.length > 0);
  if (!data.sessions.length) {
    $('reportsState').textContent = 'No demonstration sessions yet. Create a link to get started.';
    return;
  }
  for (const session of data.sessions) {
    const item = document.createElement('article');
    item.className = 'report-item';
    const left = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = session.title;
    const meta = document.createElement('div');
    meta.className = 'report-meta';
    meta.textContent = `Created ${new Date(session.created_at).toLocaleString()} · Expires ${new Date(session.expires_at).toLocaleString()}`;
    left.append(title, meta);
    if (session.latitude !== null && session.latitude !== undefined) {
      const coords = document.createElement('div');
      coords.className = 'report-coords';
      coords.textContent = `Consent received ${new Date(session.consented_at).toLocaleString()} · ${Number(session.accuracy_m).toFixed(0)} m accuracy · ${Number(session.latitude).toFixed(5)}, ${Number(session.longitude).toFixed(5)}`;
      left.append(coords);
    } else {
      const pending = document.createElement('div');
      pending.className = 'report-meta';
      pending.textContent = 'No location shared';
      left.append(pending);
    }
    const actions = document.createElement('div');
    actions.className = 'report-actions';
    if (session.latitude !== null && session.latitude !== undefined) {
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
      try { await api(`/api/admin/sessions/${encodeURIComponent(session.id)}`, { method: 'DELETE' }); await loadReports(); }
      catch (error) { alert(error.message); }
    });
    actions.append(remove);
    item.append(left, actions);
    list.append(item);
  }
}
