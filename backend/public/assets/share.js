const $ = (id) => document.getElementById(id);
const token = window.location.pathname.split('/').filter(Boolean).at(-1);
const statusBox = $('status');
let consentVersion = 'tracelab-v1';
let requestStarted = false;

function setStatus(message, error = false) {
  statusBox.textContent = message;
  statusBox.classList.toggle('error', error);
}

function showFailure(message) {
  setStatus(message, true);
}

async function submitLocation() {
  if (requestStarted) return;
  requestStarted = true;

  if (!window.isSecureContext || !navigator.geolocation) {
    showFailure('This browser cannot provide location over this connection. Open the link in a supported HTTPS browser.');
    return;
  }

  setStatus('Requesting location from your browser…');
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

      $('request').hidden = true;
      $('success').hidden = false;
    } catch (error) {
      showFailure(error.message);
    }
  }, (error) => {
    const messages = {
      1: 'Location was not shared because browser permission was denied or blocked.',
      2: 'Your device could not determine a location. No report was submitted.',
      3: 'The location request timed out. No report was submitted.'
    };
    showFailure(messages[error.code] || 'Location could not be obtained. No report was submitted.');
  }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 10000 });
}

async function loadAndRun() {
  if (!token || token.length < 20) throw new Error('This TraceLabs link is invalid.');

  const response = await fetch(`/api/sessions/${encodeURIComponent(token)}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'This link is unavailable.');

  $('shareTitle').textContent = data.title || 'Location-sharing request';
  if (data.imageUrl) {
    const image = $('sharedImage');
    image.src = data.imageUrl;
    image.hidden = false;
  }

  consentVersion = data.consentVersion || consentVersion;

  if (data.alreadyShared) {
    $('request').hidden = true;
    $('success').hidden = false;
    $('success').querySelector('h1').textContent = 'A location report has already been submitted for this link.';
    $('success').querySelector('.note').textContent = 'This one-time link has already been used.';
    return;
  }

  // The companion message explicitly says that opening the link submits location.
  // Opening that clearly labelled link is the recipient's affirmative action.
  submitLocation();
}

loadAndRun().catch(showFailure);
