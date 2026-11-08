const $ = (id) => document.getElementById(id);
const token = window.location.pathname.split('/').filter(Boolean).at(-1);
const statusBox = $('shareStatus');
let consentVersion = 'tracelab-v1';
let alreadyShared = false;

function status(message, type = '') {
  statusBox.textContent = message;
  statusBox.className = `status show ${type}`.trim();
}

function setUnavailable(message) {
  $('shareLocationBtn').disabled = true;
  status(message, 'error');
}

async function updatePermissionHint() {
  const hint = $('permissionHint');

  if (!navigator.permissions?.query) {
    hint.textContent = 'Your browser may ask for location permission when you tap the button.';
    return;
  }

  try {
    const permission = await navigator.permissions.query({ name: 'geolocation' });
    const describe = () => {
      if (permission.state === 'granted') {
        hint.textContent = 'Location permission is already enabled for this site. Nothing is sent until you tap the button.';
      } else if (permission.state === 'denied') {
        hint.textContent = 'Location access is blocked for this site in your browser settings.';
      } else {
        hint.textContent = 'Your browser will ask for location permission after you tap the button.';
      }
    };
    describe();
    permission.addEventListener?.('change', describe);
  } catch {
    hint.textContent = 'Your browser may ask for location permission when you tap the button.';
  }
}

async function loadSession() {
  if (!token || token.length < 20) throw new Error('This TraceLabs link is not valid.');

  const response = await fetch(`/api/sessions/${encodeURIComponent(token)}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'This link is unavailable.');

  $('shareTitle').textContent = data.title || 'TraceLabs location-sharing request';
  if (data.imageUrl) {
    $('sharedImage').src = data.imageUrl;
    $('sharedImage').classList.remove('hidden');
    $('noImage').classList.add('hidden');
  }

  consentVersion = data.consentVersion || consentVersion;
  alreadyShared = Boolean(data.alreadyShared);

  if (alreadyShared) {
    setUnavailable('A location has already been shared for this link. No additional report can be submitted.');
  } else {
    status(`Link expires ${new Date(data.expiresAt).toLocaleString()}. No location has been sent.`);
    await updatePermissionHint();
  }
}

$('shareLocationBtn').addEventListener('click', () => {
  if (alreadyShared) return;

  if (!window.isSecureContext || !navigator.geolocation) {
    return status('Location sharing needs a supported browser and a secure HTTPS connection.', 'error');
  }

  $('shareLocationBtn').disabled = true;
  status('Requesting your current location from the browser…');

  navigator.geolocation.getCurrentPosition(async (position) => {
    try {
      status('Sending the one-time location report…');
      const response = await fetch(`/api/sessions/${encodeURIComponent(token)}/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          consentAccepted: true,
          consentVersion
        })
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'The location report could not be sent.');

      alreadyShared = true;
      status('Your one-time location report was shared successfully. You can close this page.', 'success');
    } catch (error) {
      $('shareLocationBtn').disabled = false;
      status(error.message, 'error');
    }
  }, (error) => {
    $('shareLocationBtn').disabled = false;
    const messages = {
      1: 'Location permission was denied or blocked. No location was sent.',
      2: 'Your device could not determine a location. No report was sent.',
      3: 'The location request timed out. No report was sent.'
    };
    status(messages[error.code] || 'Location could not be obtained. No report was sent.', 'error');
    updatePermissionHint();
  }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
});

loadSession().catch((error) => setUnavailable(error.message));
