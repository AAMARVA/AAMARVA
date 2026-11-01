import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export interface ObservableRequest extends Request {
  requestId?: string;
  startTime?: number;
}

export function observabilityMiddleware(req: ObservableRequest, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) || `req_${crypto.randomUUID()}`;
  req.requestId = requestId;
  req.startTime = Date.now();

  res.setHeader('X-Request-ID', requestId);

  res.on('finish', () => {
    const duration = req.startTime ? Date.now() - req.startTime : 0;
    const statusCode = res.statusCode;
    const method = req.method;
    const url = req.originalUrl || req.url;

    // Structured JSON log for production observability systems
    const logEntry = {
      timestamp: new Date().toISOString(),
      requestId,
      method,
      url,
      statusCode,
      durationMs: duration,
      userAgent: req.headers['user-agent'] || 'unknown',
      ip: req.ip || req.socket.remoteAddress || 'unknown',
    };

    if (statusCode >= 500) {
      console.error(`[HTTP 5XX] ${JSON.stringify(logEntry)}`);
    } else if (statusCode >= 400) {
      console.warn(`[HTTP 4XX] ${JSON.stringify(logEntry)}`);
    } else {
      console.log(`[HTTP 2XX/3XX] ${JSON.stringify(logEntry)}`);
    }
  });

  next();
}
