import { Response, Request } from 'express';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export function sendSuccess<T = any>(res: Response, statusCode: number, data: T): void {
  const response: ApiResponse<T> = {
    success: true,
    data,
  };
  res.status(statusCode).json(response);
}

export function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  req?: Request,
  errorInstance?: Error
): void {
  const timestamp = new Date().toISOString();
  const method = req ? req.method : 'UNKNOWN_METHOD';
  const url = req ? req.originalUrl || req.url : 'UNKNOWN_URL';

  // Centralized structured logging for backend operations
  console.error(
    `[${timestamp}] [Error] ${method} ${url} | Code: ${code} | Status: ${statusCode} | Message: ${message}`
  );

  if (errorInstance && process.env.NODE_ENV !== 'production') {
    console.error(`[Stack Trace]`, errorInstance.stack);
  }
  
  const response: ApiResponse = {
    success: false,
    error: {
      code,
      message,
    },
  };
  res.status(statusCode).json(response);
}
