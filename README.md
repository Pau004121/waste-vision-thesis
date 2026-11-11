# Waste Vision — student thesis website

An academic prototype for student waste sorting and recycling rewards, prepared for a thesis project associated with FEU Pampanga. This repository does not claim to be an official university service or imply institutional endorsement. The supplied FEU Pampanga seal is retained as a project reference; its ownership remains with its respective rights holder.

The responsive website includes student sign-in and activation, a short-lived student QR, WV Points balances, a reward catalog with point prices and stock, reward pickup receipts, reviewed point transfers, and separate bottle, paper and other-plastic leaderboards.

## Repository scope

This repository contains the public static frontend, the supplied logo and the locally hosted QR renderer with its MIT license. It contains no student database, real student records, passwords, activation codes, API secrets, QR signing keys, Python kiosk source, ESP32 source, Android APK or backend deployment identity.

GitHub Pages serves these static files. Authentication, balances, inventory, transfers, QR signing and receipts remain on the separately hosted HTTPS API. The frontend cannot create points or inventory while offline.

## GitHub Pages

1. After choosing its visibility, publish this repository to your own GitHub account.
2. Open the repository's **Settings → Pages**.
3. Choose **Deploy from a branch**, the **main** branch, and **/ (root)**, then save.
4. The intended project address is `https://pau004121.github.io/waste-vision-thesis/`, once that repository and Pages deployment are enabled. Project paths work because styles, scripts, the logo and QR assets use relative paths. The root `.nojekyll` file keeps this a plain static website.
5. The backend's CORS allowlist must include the exact origin `https://pau004121.github.io`. A repository path is not part of an origin. Publishing the backend CORS change is a separate step; until it is enabled, the page can render while cross-origin login and account requests fail safely.

GitHub Pages publishes repository files. Keep all school records and credentials outside this repository. There is no need to upload a database or configure a GitHub secret for this frontend.

## Public API configuration

`config.js` pins the public backend origin:

```text
https://waste-vision-student-qr.icy-lamp-1597.chatgpt.site
```

This public URL is not an API credential. The client only accepts that exact HTTPS origin through its code allowlist in `app.js`. To intentionally replace the backend, update all three together: `config.js`, `allowedApiOrigins` in `app.js`, and the `connect-src` directive in `index.html`. Add the actual Pages origin to the replacement backend's CORS allowlist. Runtime query strings and browser storage cannot change the API destination.

The backend must answer CORS preflights for JSON and `Authorization` headers and return the exact allowed Pages origin on success and error responses. Student endpoints are under `/api/mobile`; the browser never calls privileged kiosk endpoints. Requests omit cookies, reject redirects and use a Bearer token held only in page memory.

## Student flow

School staff verify the student and issue a one-use activation code. The student activates an account with their ID, code and a password of 12–128 characters, then signs in. My QR displays the server-issued signed token. At the scanner, the student confirms their name and completes a deposit before points are credited.

Rewards show current stock and WV Point prices. A confirmed redemption creates a receipt for counter pickup. A transfer shows the exact recipient's name and ID before confirmation. Material leaderboards count completed deposits, so spending points does not reduce the waste item count.

The page never saves passwords or session tokens. Reloading the page requires sign-in again. Interrupted, confirmed transactions keep their immutable request ID and payload in browser storage, scoped to this Pages project, backend, student ID and account version. **Retrieve receipt** retries the same request instead of creating a new debit. A damaged journal blocks new transactions until the project team reconciles the saved receipt. Sign out before another student uses a shared device.

## Local checks

Node.js 22 or later is sufficient; no dependency installation or frontend build is required.

```text
node --check app.js
node --test *.test.mjs
```

Tests use isolated synthetic fixtures and never contact a real account or cloud service. They cover late account callbacks, immutable retries, receipt identity binding, damaged storage, QR failures, HTTPS origin pinning, cross-origin request options, project-subdirectory asset resolution and repository contents.

For a visual preview, serve this folder through a local static server and open `index.html` through that server. The retained API still requires the preview origin to be allowed explicitly; a local preview does not create a demo login.

## Security boundaries and third-party software

The page has an early CSP meta policy allowing local scripts/styles/assets and the one retained backend connection. GitHub Pages does not provide this project with configurable response headers; a CSP meta policy cannot enforce `frame-ancestors`. Hosts supporting custom headers can additionally set `frame-ancestors 'none'`. Avoid embedding the account page inside another site.

QR rendering uses **qrcode-generator 2.0.4** by Kazuhiko Arase, self-hosted as `qrcode.js` with its original MIT license in `qrcode-LICENSE.txt`. It renders only the exact signed text returned by the API; no third-party QR service receives student credentials or QR tokens.

References: [GitHub Pages setup](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site), [Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site), [CSP guidance](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP), [QR library](https://github.com/kazuhikoarase/qrcode-generator).
