import type { Core } from '@strapi/strapi';

// Comma-separated so Railway can carry both the Vercel production URL and a
// preview URL in one variable. Defaults to the local Next dev server.
//
// Trailing slashes are stripped because a browser's Origin header never has one,
// so a pasted "https://app.vercel.app/" would match nothing and every request
// would fail CORS with no hint as to why.
const frontendOrigins = (process.env.FRONTEND_URL ?? 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const config: Core.Config.Middlewares = [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  {
    name: 'strapi::cors',
    config: {
      // The JWT travels in the Authorization header, not a cookie, so
      // credentials are deliberately not enabled here.
      origin: frontendOrigins,
      headers: ['Content-Type', 'Authorization', 'Origin', 'Accept'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
    },
  },
  'strapi::poweredBy',
  'strapi::query',
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];

export default config;
