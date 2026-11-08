const $ = (id) => document.getElementById(id);
const token = window.location.pathname.split('/').filter(Boolean).at(-1);
const button = $('shareLocationBtn');
const statusBox = $('status');
let consentVersion = 'tracelab-v1';
let alreadyShared = false;

function setStatus(message, error = false) {
  statusBox.textContent = message;
  statusBox.classList.toggle('error', error);
}

function disableRequest(message) {
  button.disabled = true;
  setStatus(message, true);
}

async function loadSession() {
  if (!token || token.length < 20) throw new Error('This TraceLabs link is invalid.');

  const response = await fetch(`/api/sessions/${encodeURIComponent(token)}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'This link is unavailable.');

  $('shareTitle').textContent = data.title || 'Share your current location';
  if (data.imageUrl) {
    const image = $('sharedImage');
    image.src = data.imageUrl;
    image.hidden = false;
  }

  consentVersion = data.consentVersion || consentVersion;
  alreadyShared = Boolean(data.alreadyShared);

  if (alreadyShared) {
    disableRequest('A report has already been submitted for this link.');
    return;
  }

  button.disabled = false;
  setStatus('Ready. Nothing has been shared yet.');
}

button.addEventListener('click', () => {
  if (alreadyShared || button.disabled) return;

  if (!window.isSecureContext || !navigator.geolocation) {
    return setStatus('Location is unavailable in this browser. Open the link in a supported HTTPS browser.', true);
  }

  button.disabled = true;
  setStatus('Getting location…');

  navigator.geolocation.getCurrentPosition(async (position) => {
    try {
      setStatus('Submitting one-time report…');
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
      if (!response.ok) throw new Error(result.error || 'Location report could not be submitted.');

      alreadyShared = true;
      $('request').hidden = true;
      $('success').hidden = false;
    } catch (error) {
      button.disabled = false;
      setStatus(error.message, true);
    }
  }, (error) => {
    button.disabled = false;
    const messages = {
      1: 'Location permission was denied or blocked. No report was sent.',
      2: 'Your device could not determine a location.',
      3: 'Location request timed out. Please try again.'
    };
    setStatus(messages[error.code] || 'Location could not be obtained.', true);
  }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 10000 });
});

loadSession().catch((error) => disableRequest(error.message));
