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
  const PORT = process.env.PORT || 3000;

  // Trust reverse proxy for rate-limiting headers (X-Forwarded-For, etc.)
  app.set('trust proxy', 1);

  // Security and core middleware
  app.use(observabilityMiddleware);
  app.use(cors({ origin: true, credentials: true }));
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

