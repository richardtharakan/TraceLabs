# Security Policy

TraceLab is an educational, consent-based location-sharing demonstrator. Do not use it to collect another person's location without their informed, voluntary agreement.

## Reporting a vulnerability

Please do not publish an exploitable issue containing real location data, tokens, passwords, or personal information. Open a private security advisory in the repository (or contact the maintainer through a private channel) with:

- affected version or commit;
- affected component and endpoint;
- minimal reproduction steps using test accounts and test locations;
- potential impact and a suggested mitigation, if known.

## Deployment checklist

- Use HTTPS for every internet-facing deployment.
- Set strong, unique `ADMIN_USERNAME` and `ADMIN_PASSWORD` values.
- Keep `.env`, database credentials, Blob tokens, and signing files out of source control.
- Use a managed PostgreSQL service with encrypted connections and access controls.
- Configure Vercel Blob for persistent image storage and treat image URLs as public.
- Delete test sessions/reports after demonstrations.
- Review the hosting provider's access-log retention and privacy terms.
- Do not expose the dashboard or API using default example credentials.

## Scope and limitations

The recipient web page implements an explicit consent prompt. The API checks a consent flag and version, but a caller who possesses the share token can bypass the browser UI and submit directly to the endpoint. This MVP therefore does not provide cryptographic evidence of a human's identity or intent. Do not rely on it for regulated, high-assurance, or production location-sharing workflows.
