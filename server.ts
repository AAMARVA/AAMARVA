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

async function startServer() {
  // Validate required configuration secrets before accepting traffic
  validateConfig();

  // Execute database connectivity check
  await checkDatabaseConnectivity();

  // Initialize verified accounts cache from Supabase Auth app_metadata
  await initVerifiedUsersCache();

  const app = express();
  const PORT = config.port;

  // Trust reverse proxy for rate-limiting headers (X-Forwarded-For, etc.)
  app.set('trust proxy', 1);

  // Security and core middleware
  app.use(observabilityMiddleware);
  app.use(securityMiddleware);

  const allowedOrigins = [
    'https://aamarva.com',
    'https://www.aamarva.com'
  ];

  app.use(cors({
    origin: (origin, callback) => {
      // Allow non-browser requests (server-to-server, curl, mobile clients, ADK agents)
      if (!origin) return callback(null, true);

      // Check if it's in the configured whitelist
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Allow localhost/127.0.0.1 and AI Studio/Cloud Run subdomains ONLY in non-production environments
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
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));
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

  // Vite development middleware or production static server
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`[Aamarva Backend MVP] Server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start production server:', err);
  process.exit(1);
});

