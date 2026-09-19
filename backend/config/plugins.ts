import type { Core } from '@strapi/strapi';

const allowedMediaTypes = [
  'image/*',
  'video/*',
  'audio/*',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.*',
  'text/plain',
  'text/csv',
];

const deniedTypes = [
  'image/svg+xml',
  'application/vnd.microsoft.portable-executable',
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-executable',
  'application/x-dosexec',
  'application/x-sh',
  'text/x-shellscript',
  'application/x-mach-binary',
];

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Plugin => ({
  'users-permissions': {
    config: {
      // 'refresh' issues a 10-minute access token plus an httpOnly refresh
      // cookie. That cookie defaults to sameSite: 'lax', which a cross-site
      // Vercel -> Railway request will not send, so the silent refresh fails in
      // production and users are logged out after 10 minutes. The frontend keeps
      // its token in localStorage and sends it in the Authorization header, so a
      // long-lived JWT is the mode that actually matches how it authenticates.
      jwtManagement: 'legacy-support',
      jwt: {
        expiresIn: '30d',
      },
    },
  },
  upload: {
    config: {
      security: {
        allowedTypes: allowedMediaTypes,
        deniedTypes,
      },
    },
  },
});

export default config;
