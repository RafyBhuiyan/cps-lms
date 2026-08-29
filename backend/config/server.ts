import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Server => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),

  // The origin this instance is reachable at, e.g.
  // https://cps-lms-backend.up.railway.app. Empty locally, which keeps Strapi on
  // relative URLs; in production it is what the admin panel bundle calls back to.
  url: env('PUBLIC_URL', ''),

  app: {
    keys: env.array('APP_KEYS')!,
  },

  proxy: {
    // A platform like Railway terminates TLS at its edge and forwards plain
    // HTTP, so without this Strapi reads every request as insecure and credits
    // all of them to the proxy's own IP — which is the IP the users-permissions
    // login rate limiter counts against, so one user locking themselves out
    // would lock out everyone.
    //
    // `server.proxy.koa` is the key Koa actually reads
    // (services/server/index.js:23). A bare `proxy: true`, as the older Strapi
    // guides suggest, leaves `proxy.koa` undefined and does nothing.
    koa: env.bool('IS_PROXIED', false),
  },

  webhooks: {
    populateRelations: env.bool('WEBHOOKS_POPULATE_RELATIONS', false),
  },
});

export default config;
