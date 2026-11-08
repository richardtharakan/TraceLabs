const $ = (id) => document.getElementById(id);
const token = window.location.pathname.split('/').filter(Boolean).at(-1);
const statusBox = $('shareStatus');
let consentVersion = 'tracelab-v1';
let alreadyShared = false;

function status(message, type = '') {
  statusBox.textContent = message;
  statusBox.className = `status show ${type}`.trim();
}
function setExpired(message) {
  $('shareLocationBtn').disabled = true;
  $('consent').disabled = true;
  status(message, 'error');
}

async function loadSession() {
  if (!token || token.length < 20) throw new Error('This TraceLab link is not valid.');
  const response = await fetch(`/api/sessions/${encodeURIComponent(token)}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'This link is unavailable.');
  $('shareTitle').textContent = data.title || 'TraceLab location-sharing request';
  if (data.imageUrl) {
    $('sharedImage').src = data.imageUrl;
    $('sharedImage').classList.remove('hidden');
    $('noImage').classList.add('hidden');
  }
  consentVersion = data.consentVersion || consentVersion;
  alreadyShared = Boolean(data.alreadyShared);
  if (alreadyShared) {
    setExpired('A location has already been shared for this link. No additional report can be submitted.');
  } else {
    status(`This link expires ${new Date(data.expiresAt).toLocaleString()}. Your location has not been requested.`, '');
  }
}

$('consent').addEventListener('change', () => {
  $('shareLocationBtn').disabled = !$('consent').checked || alreadyShared;
});
$('declineBtn').addEventListener('click', () => {
  $('consent').checked = false;
  $('shareLocationBtn').disabled = true;
  status('You declined. No location was requested or sent. You can close this page.');
});
$('shareLocationBtn').addEventListener('click', () => {
  if (!$('consent').checked || alreadyShared) return;
  if (!window.isSecureContext || !navigator.geolocation) {
    return status('Location sharing needs a supported browser and a secure HTTPS connection.', 'error');
  }
  $('shareLocationBtn').disabled = true;
  $('consent').disabled = true;
  status('Waiting for your browser location permission…');
  navigator.geolocation.getCurrentPosition(async (position) => {
    try {
      status('Sending the one-time report you approved…');
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
      $('consent').disabled = true;
      status('Thank you. Your one-time location report was shared successfully. You can close this page.', 'success');
    } catch (error) {
      $('shareLocationBtn').disabled = false;
      $('consent').disabled = false;
      status(error.message, 'error');
    }
  }, (error) => {
    $('shareLocationBtn').disabled = false;
    $('consent').disabled = false;
    const messages = {
      1: 'You denied the browser location request. No location was sent.',
      2: 'Your device could not determine a location. No report was sent.',
      3: 'The location request timed out. No report was sent.'
    };
    status(messages[error.code] || 'Location could not be obtained. No report was sent.', 'error');
  }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
});

loadSession().catch((error) => setExpired(error.message));
