import { createApp } from '../dist/server.cjs';

let cachedAppPromise: Promise<any> | null = null;

async function getApp() {
  if (!cachedAppPromise) {
    cachedAppPromise = createApp().catch((err: any) => {
      cachedAppPromise = null;
      throw err;
    });
  }
  return cachedAppPromise;
}

export default async function handler(req: any, res: any) {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (error: any) {
    console.error('Vercel API Handler Error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_INITIALIZATION_ERROR',
          message: error?.message || 'Internal server error'
        }
      });
    }
  }
}
