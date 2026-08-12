import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import './server/config.js'; 
import aamarvaRoutes from './server/routes/aamarvaRoutes';
import { checkDatabaseConnectivity } from './server/supabase';
import { ADK_SPECIFICATION } from './server/adk_spec';
import { observabilityMiddleware } from './server/middleware/observabilityMiddleware';

dotenv.config();

async function startServer() {
  // Execute database connectivity check
  await checkDatabaseConnectivity();

  const app = express();
  const PORT = 3000;

  // Trust reverse proxy for rate-limiting headers (X-Forwarded-For, etc.)
  app.set('trust proxy', 1);

  // Security and core middleware
  app.use(observabilityMiddleware);

  const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(s => s.trim())
    : [
        'https://ais-dev-sy4lhzb3bv4g4mm7spkr5c-89865814157.asia-southeast1.run.app',
        'https://ais-pre-sy4lhzb3bv4g4mm7spkr5c-89865814157.asia-southeast1.run.app',
        'https://aamarva.com',
        'https://www.aamarva.com'
      ];

  app.use(cors({
    origin: (origin, callback) => {
      // Allow non-browser requests (server-to-server, curl, mobile clients, ADK agents)
      if (!origin) return callback(null, true);

      // In production, strictly enforce explicit allowed origins
      if (process.env.NODE_ENV === 'production') {
        if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
          return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
      }

      // In development / non-production, allow configured origins, Cloud Run preview URLs, and localhost
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*') || origin.endsWith('.run.app') || origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return callback(null, true);
      }

      callback(new Error('Not allowed by CORS'));
    },
    credentials: true
  }));
  app.use(express.json());
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
    app.get(/.*/, (req, res) => {
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

