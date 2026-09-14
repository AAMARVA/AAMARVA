/**
 * Recursive redaction of sensitive fields in objects.
 */
export function redactSensitiveData(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(redactSensitiveData);
  }

  const SENSITIVE_KEYS = [
    'password',
    'passwordHash',
    'apiKey',
    'apiKeyHash',
    'accessToken',
    'refreshToken',
    'token',
    'authorization',
    'cookie',
    'secret',
    'secretValue',
    'ciphertext', // Do not log encrypted payloads in security events if possible
    'privateKey'
  ];

  const redacted: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = SENSITIVE_KEYS.some(sk => 
        lowerKey.includes(sk.toLowerCase())
      );

      if (isSensitive) {
        redacted[key] = '***';
      } else if (typeof obj[key] === 'object') {
        redacted[key] = redactSensitiveData(obj[key]);
      } else {
        redacted[key] = obj[key];
      }
    }
  }

  return redacted;
}
