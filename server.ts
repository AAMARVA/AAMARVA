import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { config, validateConfig } from './server/config'; 
import aamarvaRoutes from './server/routes/aamarvaRoutes';
import clusterRoutes from './server/routes/clusterRoutes';
import { checkDatabaseConnectivity } from './server/supabase';
import { initVerifiedUsersCache } from './server/authService';
import { ADK_SPECIFICATION, getAdkSpecification } from './server/adk_spec';
import { observabilityMiddleware } from './server/middleware/observabilityMiddleware';
import { securityMiddleware } from './server/middleware/securityMiddleware';

dotenv.config();

export async function createApp() {
  const app = express();

  // Trust reverse proxy for rate-limiting headers (X-Forwarded-For, etc.)
  app.set('trust proxy', 1);

  // Security and core middleware
  app.use(observabilityMiddleware);
  app.use(securityMiddleware);

  const allowedOrigins = [
    'https://aamarva.com',
    'https://www.aamarva.com',
    'https://aamarva.vercel.app'
  ];

  if (process.env.FRONTEND_URL) {
    allowedOrigins.push(process.env.FRONTEND_URL.trim());
  }
  if (process.env.ADDITIONAL_ALLOWED_ORIGINS) {
    allowedOrigins.push(...process.env.ADDITIONAL_ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean));
  }

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      if (origin.endsWith('.vercel.app')) return callback(null, true);
      if (process.env.NODE_ENV !== 'production') {
        if (
          origin.includes('localhost') || 
          origin.includes('127.0.0.1') ||
          origin.endsWith('.run.app') ||
          origin.endsWith('.aistudio.google') ||
          origin.includes('.googleusercontent.com')
        ) {
          return callback(null, true);
        }
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-KEY', 'X-Requested-With', 'Accept', 'X-Request-ID'],
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // Mount API endpoints strictly under /api prefix
  app.use('/api', aamarvaRoutes);
  app.use('/api', clusterRoutes);

  // Serve public /adk endpoint directly at /adk
  app.get('/adk', (req: express.Request, res: express.Response) => {
    const host = req.get('host') || 'aamarva.com';
    const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
    const currentUrl = `${protocol}://${host}`;
    const rawSpec = getAdkSpecification();
    const dynamicSpec = rawSpec.replace(/https:\/\/aamarva\.com/g, currentUrl);

    if (req.headers.accept && req.headers.accept.includes('text/plain')) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(dynamicSpec);
    }
    res.json({ success: true, data: { adk: dynamicSpec } });
  });

  // Serve public static assets
  app.use(express.static(path.join(process.cwd(), 'public')));

  // Vite development middleware
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // SPA fallback for production (Frontend static assets served by Vercel)
    app.get('*', (req, res) => {
        res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  return app;
}

if (import.meta.url === new URL(process.argv[1], 'file://').href) {
    async function startServer() {
      validateConfig();
      await checkDatabaseConnectivity();
      await initVerifiedUsersCache();
      const app = await createApp();
      const PORT = config.port;
      app.listen(Number(PORT), '0.0.0.0', () => {
        console.log(`[Aamarva Backend MVP] Server running on port ${PORT}`);
      });
    }
    startServer().catch((err) => {
      console.error('Failed to start production server:', err);
      process.exit(1);
    });
}

