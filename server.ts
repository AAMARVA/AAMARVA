import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import dotenv from 'dotenv';
import { config, validateConfig } from './server/config'; 
import aamarvaRoutes from './server/routes/aamarvaRoutes';
import authRoutes from './server/routes/authRoutes';
import clusterRoutes from './server/routes/clusterRoutes';
import floorRoutes from './server/routes/floorRoutes';
import { checkDatabaseConnectivity, isSupabaseConfigured } from './server/supabase';
import { seed } from './seed';
import { initVerifiedUsersCache } from './server/authService';
import { ADK_SPECIFICATION, getAdkSpecification, FLOOR_MCP_AGENT_ENDPOINTS, getAllAdkEndpoints } from './server/adk_spec';
import { observabilityMiddleware } from './server/middleware/observabilityMiddleware';
import { securityMiddleware } from './server/middleware/securityMiddleware';
import { slaveActivityMiddleware } from './server/middleware/slaveActivityMiddleware';

dotenv.config();

let configValidated = false;
export function ensureConfigValidated(): void {
  if (!configValidated) {
    validateConfig();
    configValidated = true;
  }
}

export async function createApp() {
  ensureConfigValidated();
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
      if (process.env.NODE_ENV !== 'production') return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      if (origin.endsWith('.vercel.app')) return callback(null, true);
      if (
        origin.includes('localhost') || 
        origin.includes('127.0.0.1') ||
        origin.endsWith('.run.app') ||
        origin.endsWith('.aistudio.google') ||
        origin.includes('.googleusercontent.com')
      ) {
        return callback(null, true);
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

  // Automatically record slave agent activities across any non-human-only endpoint
  app.use(slaveActivityMiddleware);

  // Mount API endpoints strictly under /api prefix and root prefix for flexible serverless rewrites
  app.use('/api', authRoutes);
  app.use('/api/floor', floorRoutes);
  app.use('/api', aamarvaRoutes);
  app.use('/api', clusterRoutes);
  app.use('/', authRoutes);
  app.use('/floor', floorRoutes);
  app.use('/', aamarvaRoutes);
  app.use('/', clusterRoutes);

  // Return JSON 404 for any unmatched /api requests (avoids falling through to SPA HTML fallback)
  app.use('/api', (req: express.Request, res: express.Response) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `API endpoint ${req.method} ${req.originalUrl} not found.`
      }
    });
  });

  // Serve public /adk endpoint directly at /adk (API clients get JSON/text; browser requests fall through to SPA router)
  app.get('/adk', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.headers.accept && req.headers.accept.includes('text/html') && !req.headers.accept.includes('application/json') && !req.headers.accept.includes('text/plain')) {
      return next();
    }
    const host = req.get('host') || 'aamarva.com';
    const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
    const currentUrl = `${protocol}://${host}`;
    const rawSpec = getAdkSpecification() || ADK_SPECIFICATION;
    const dynamicSpec = rawSpec ? rawSpec.replace(/https:\/\/aamarva\.com/g, currentUrl) : rawSpec;
    const allEndpoints = getAllAdkEndpoints();

    if (req.headers.accept && req.headers.accept.includes('text/plain')) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(dynamicSpec);
    }
    res.json({
      success: true,
      version: '2.0.0',
      data: {
        version: '2.0.0',
        adk: dynamicSpec,
        floorEndpoints: FLOOR_MCP_AGENT_ENDPOINTS,
        floor_endpoints: FLOOR_MCP_AGENT_ENDPOINTS,
        endpoints: allEndpoints
      },
      endpoints: allEndpoints,
      floorEndpoints: FLOOR_MCP_AGENT_ENDPOINTS,
      floor_endpoints: FLOOR_MCP_AGENT_ENDPOINTS
    });
  });

  // Serve public static assets with 1-day caching
  app.use(express.static(path.join(process.cwd(), 'public'), {
    maxAge: '1d',
  }));

  // Vite development middleware (only active in local development)
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true, allowedHosts: true, hmr: false },
        appType: 'spa',
      });
      app.use(vite.middlewares);

      // SPA client routing fallback in development mode
      app.use('*', async (req, res, next) => {
        if (req.originalUrl.startsWith('/api') || req.originalUrl === '/adk') {
          return next();
        }
        try {
          const indexHtmlPath = path.resolve(process.cwd(), 'index.html');
          const fs = await import('fs/promises');
          let template = await fs.readFile(indexHtmlPath, 'utf-8');
          template = await vite.transformIndexHtml(req.originalUrl, template);
          res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
        } catch (e: any) {
          next(e);
        }
      });
    } catch (viteErr) {
      console.warn('Vite dev server middleware not initialized:', viteErr);
    }
  } else if (!process.env.VERCEL) {
    // Serve static frontend assets with long-lived immutable caching for hashed assets
    app.use('/assets', express.static(path.join(process.cwd(), 'dist', 'assets'), {
      maxAge: '1y',
      immutable: true,
    }));
    app.use(express.static(path.join(process.cwd(), 'dist'), {
      maxAge: '1h',
    }));
    app.get('/{*splat}', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  return app;
}

// Global process error handlers to prevent unexpected process death
process.on('uncaughtException', (err: any) => {
  console.error('[Aamarva Backend MVP] Uncaught exception:', err?.message || err);
});

process.on('unhandledRejection', (reason: any) => {
  console.warn('[Aamarva Backend MVP] Unhandled promise rejection:', reason?.message || reason);
});

const isDirectEntry = 
  (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) ||
  (process.argv[1] && (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.cjs') || process.argv[1].endsWith('server.js')));

if (isDirectEntry) {
    async function startServer() {
      validateConfig();
      await checkDatabaseConnectivity();
      await initVerifiedUsersCache();
      if (!isSupabaseConfigured()) {
        try {
          await seed();
        } catch (e) {
          console.warn('Seed warning:', e);
        }
      }
      const app = await createApp();
      const PORT = config.port;
      const HOST = '0.0.0.0';
      const server = app.listen(Number(PORT), HOST, () => {
        console.log(`[Aamarva Backend MVP] Server running on port ${PORT}`);
      });

      server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          console.error(`[Aamarva Backend MVP] Port ${PORT} already in use. Retrying or waiting...`);
        } else {
          console.error('[Aamarva Backend MVP] Server runtime error:', err?.message || err);
        }
      });
    }
    startServer().catch((err) => {
      console.error('Failed to start server:', err);
    });
}


