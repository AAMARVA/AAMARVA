import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { config, validateConfig } from './server/config'; 
import aamarvaRoutes from './server/routes/aamarvaRoutes';
import { checkDatabaseConnectivity } from './server/supabase';
import { initVerifiedUsersCache } from './server/authService';
import { ADK_SPECIFICATION } from './server/adk_spec';
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

  const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(s => s.trim())
    : [
        'https://aamarva.com',
        'https://www.aamarva.com'
      ];

  app.use(cors({
    origin: (origin, callback) => {
      // Allow non-browser requests (server-to-server, curl, mobile clients, ADK agents)
      if (!origin) return callback(null, true);

      // Check if it's in the hardcoded whitelist
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return callback(null, true);
      }

      // Dynamically allow any .run.app or .aistudio.google origin (AI Studio deployments)
      // and standard local development origins
      const isAllowedSubdomain = origin.endsWith('.run.app') || 
                               origin.endsWith('.aistudio.google') || 
                               origin.includes('.googleusercontent.com') ||
                               origin.includes('localhost') || 
                               origin.includes('127.0.0.1');

      if (isAllowedSubdomain) {
        return callback(null, true);
      }

      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-KEY', 'X-Requested-With', 'Accept'],
  }));
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));
  app.use(cookieParser());

  // Mount API endpoints strictly under /api prefix
  app.use('/api', aamarvaRoutes);

  // Serve public /adk endpoint directly at /adk
  app.get('/adk', (req, res) => {
    if (req.headers.accept && req.headers.accept.includes('text/plain')) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(ADK_SPECIFICATION);
    }
    res.json({ success: true, data: { adk: ADK_SPECIFICATION } });
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

