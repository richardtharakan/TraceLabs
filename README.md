# TraceLab

**TraceLab** is an open-source, consent-based location security-awareness demonstrator. The first MVP contains:

- A native Android application (Java + XML) for selecting a photo, creating a time-limited share session, and sharing its URL.
- A web recipient page that displays the selected image and explains the location request.
- A web dashboard for creating sessions and reviewing or deleting voluntarily submitted reports.
- An Express API backed by PostgreSQL.

The app is deliberately not a covert tracker. The recipient page does not request geolocation on page load. A recipient must tick an explicit consent checkbox and press **Share my location** before the browser geolocation permission prompt can appear. The server accepts one location report per link and does not store IP addresses, browser fingerprints, or background updates.

## Project layout

```text
TraceLab/
├── README.md
├── docker-compose.yml
├── backend/
│   ├── server.js             # Express app / local server
│   ├── index.js              # Vercel Express entry point
│   ├── package.json
│   ├── .env.example
│   ├── sql/schema.sql
│   ├── src/
│   │   ├── db.js
│   │   ├── init-db.js
│   │   └── storage.js
│   └── public/
│       ├── dashboard.html
│       ├── share.html
│       └── assets/
│           ├── styles.css
│           ├── dashboard.js
│           └── share.js
└── android/
    ├── settings.gradle
    ├── build.gradle
    ├── gradle.properties
    ├── gradlew / gradlew.bat
    └── app/src/main/
        ├── AndroidManifest.xml
        ├── java/com/tracelab/app/
        │   ├── MainActivity.java
        │   └── ApiClient.java
        └── res/
```

## 1. Run the web app and API locally

Prerequisites: Node.js 20+ (Node 22 recommended), npm, and Docker Desktop or a local PostgreSQL 14+ instance.

From the repository root:

```bash
cd backend
cp .env.example .env
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp` if needed. Edit `backend/.env` and replace `ADMIN_PASSWORD` with a long unique password. The example password is for local development only.

Start PostgreSQL from the repository root in another terminal:

```bash
docker compose up -d postgres
```

Then, in `backend/`:

```bash
npm install
npm run db:init
npm run dev
```

Open **http://localhost:3000/dashboard**. Enter the administrator username and password from `.env`, choose an image, and create a link. The recipient page is available at `/share/<token>`.

The dashboard requires HTTP Basic authentication at the API level. The username/password are entered into the browser dashboard and sent only to the same TraceLab server. The dashboard does not write them to local storage. The Android app also asks for these credentials when generating a link; they are not embedded in the APK or share URL.

## 2. Open the Android project

Open the `android/` folder in Android Studio. Use **JDK 17** (Android Studio's bundled JBR is a suitable choice) and install Android SDK Platform 36 when prompted. The project uses Android Gradle Plugin 8.10.1 and Gradle 8.11.1. The included `gradlew` / `gradlew.bat` bootstrap scripts download that pinned Gradle distribution on first use (internet access is required).

The app's default API URL is `http://10.0.2.2:3000`, which points an Android emulator to the host computer's localhost. To use a physical Android phone on the same Wi-Fi network:

1. Find the computer's LAN IPv4 address, for example `192.168.1.25`.
2. In `android/gradle.properties`, add:

   ```properties
   tracelabApiBaseUrl=http://192.168.1.25:3000
   ```

3. Allow inbound TCP port 3000 through the computer's development firewall, only on your trusted private network.
4. Re-sync the Gradle project and run the **debug** app.

The debug manifest permits cleartext HTTP for local development. The release manifest does not. For an internet-hosted deployment, configure the app with your HTTPS API URL and do not enable cleartext traffic in release builds.

### Android MVP flow

1. Enter the API base URL and the server administrator credentials.
2. Select a photograph using Android's system Photo Picker.
3. Choose a title and link expiry (1 hour, 24 hours, 3 days, or 7 days).
4. Tap **Generate consent link**.
5. Copy the URL or share it through Android's share sheet.

The Android app itself requests **no location permission**. It only uploads the selected image and creates a session. The recipient's browser controls the location permission flow.

## 3. Deploy the backend to Vercel

Vercel's current Express deployment support can run the exported Express app as a Function. Import this repository into Vercel and set the **Project Root Directory** to `backend/`.

Configure these environment variables in the Vercel project:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Neon or another hosted PostgreSQL provider) |
| `ADMIN_USERNAME` | Dashboard/API administrator username |
| `ADMIN_PASSWORD` | Long, unique administrator password |
| `PUBLIC_BASE_URL` | Public HTTPS origin, e.g. `https://your-tracelab-domain.vercel.app` |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token for persistent public image previews |

Redeploy after setting the variables. The schema is initialized automatically on the first API request. Vercel's function filesystem is ephemeral, so configure Blob storage for uploaded images; the local `uploads/` fallback is intended only for development. Images are publicly readable by design because they are displayed on the share page. Do not upload sensitive/private photographs.

For local development with Vercel Blob, set `BLOB_READ_WRITE_TOKEN` in `backend/.env`; otherwise images are saved into `backend/uploads/`.

The Android app's API base URL must be changed to the deployed HTTPS URL. For a physical-device recipient test while the backend runs locally, set `PUBLIC_BASE_URL` to a secure HTTPS tunnel URL (for example, a tunnel you control) and set the Android API URL to a reachable backend URL; a plain LAN HTTP URL cannot provide browser geolocation on the recipient phone. You can do this by adding the following line to `android/gradle.properties`:

```properties
tracelabApiBaseUrl=https://your-tracelab-domain.vercel.app
```

## 4. Data model and API

### API endpoints

| Method | Endpoint | Authentication | Purpose |
|---|---|---|---|
| `POST` | `/api/sessions` | Admin Basic Auth | Create a session and optionally upload its image |
| `GET` | `/api/sessions/:token` | Share token | Get recipient-facing session details |
| `POST` | `/api/sessions/:token/location` | Explicit consent + share token | Submit one location report |
| `GET` | `/api/admin/sessions` | Admin Basic Auth | List sessions and submitted reports |
| `DELETE` | `/api/admin/sessions/:id` | Admin Basic Auth | Delete a session and its report/image |
| `GET` | `/health` | None | Health check |

### Stored location data

The report table stores latitude, longitude, accuracy in metres, consent version, consent time, and server receipt time. One report is allowed per session. The API does not store the submitter's IP address, user agent, device ID, or a location history.

A server or hosting provider may independently retain network request metadata in its infrastructure logs. Review the hosting provider's logging and retention controls before using TraceLab with real people.

## 5. Security and privacy notes

- The browser's Geolocation API requires a secure context (HTTPS, or localhost during development) and browser permission. A recipient opening a LAN address such as `http://192.168.1.25:3000` on a phone will not have a secure context; use the deployed HTTPS URL or an HTTPS tunnel for phone-recipient tests. For local testing on the development computer itself, `http://localhost:3000` is accepted as a secure context.
- The location call is only made after a user click and checked consent box. Declining or denying browser permission sends no coordinates.
- Android requests no background or foreground location permission. The recipient's browser is responsible for the one-time request.
- The API stores only one report for each expiring token. The default expiry is 24 hours and the maximum is 7 days. The consent checkbox and click are enforced by the supplied recipient UI; as with any public HTTP API, a technically capable caller who possesses the bearer link can bypass the page and call the endpoint directly. Do not treat this MVP as cryptographic proof of a person's identity or consent.
- The image is decoded and re-encoded as JPEG on the server, which removes source EXIF metadata such as embedded GPS coordinates. The Android client also normalizes the image before upload.
- Vercel Blob images use public access so the share page can render them. Treat the returned image URL as public. Use non-sensitive images and get permission from people shown in them.
- Dashboard/API credentials must be unique and strong. Use HTTPS for any internet-facing deployment. Do not commit `.env`, credentials, database URLs, Blob tokens, or signing keys.
- This MVP is intended for controlled demonstrations and small self-hosted pilots. Before opening a public multi-user service, add real user accounts, per-user ownership, CSRF/origin protections, a documented deletion/retention policy, monitoring, and abuse controls.

## 6. Known MVP limitations

- The dashboard uses HTTP Basic credentials and is a single-admin console, not a multi-user product.
- Session expiry blocks new access but does not yet perform scheduled cleanup of expired database rows and image objects. Delete demonstration data in the dashboard after use.
- The Android app shares the recipient URL through the system share sheet. It does not turn a raw JPG into an executable/clickable file; the link opens the transparent web recipient page that displays the image.
- Location accuracy depends on the recipient's device, browser, permission choice, and available location sources. The report records the browser-reported accuracy value.
- Automated tests, Play Store signing, release hardening, and production monitoring are not part of this first scaffold.

## License

This starter is intended to be released under the MIT License after the project owner reviews and accepts the license. Add a `LICENSE` file before publishing the repository.
