'use strict';
// Public build configuration. This URL is not a credential.
// Changes require matching app.js allowlist + index.html connect-src updates.
Object.defineProperty(window, 'WASTE_VISION_CONFIG', {
  value: Object.freeze({
    apiOrigin: 'https://waste-vision-student-qr.icy-lamp-1597.chatgpt.site'
  }),
  writable: false,
  configurable: false
});
