import { Request, Response, NextFunction } from 'express';

export const securityMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Allow framing by AI Studio for the preview to work
  res.setHeader('X-Frame-Options', 'SAMEORIGIN'); 
  
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  // React/Vite production builds do not require unsafe-eval or unsafe-inline for scripts.
  const scriptSrc = isProd 
    ? "script-src 'self'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

  // motion/react uses inline styles (style="...") dynamically, so unsafe-inline is required for style-src.
  const styleSrc = isProd
    ? "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com"
    : "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com";

  // Production API and Supabase communication
  const connectSrc = isProd
    ? "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.run.app https://*.aistudio.google https://*.googleusercontent.com"
    : "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.run.app https://*.aistudio.google https://*.googleusercontent.com ws: wss:";

  const csp = [
    "default-src 'self'",
    scriptSrc,
    styleSrc,
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    connectSrc,
    "frame-ancestors 'self' https://*.aistudio.google.com https://aistudio.google.com",
    "object-src 'none'",
    "base-uri 'self'"
  ].join('; ');

  res.setHeader('Content-Security-Policy', csp);

  next();
};
