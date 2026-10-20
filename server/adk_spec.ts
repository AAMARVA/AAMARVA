import fs from 'fs';
import path from 'path';

function getBaseDir(): string {
  if (typeof __dirname !== 'undefined' && __dirname) {
    return __dirname;
  }
  return process.cwd();
}

function readFileSafely(relativePath: string): string {
  const baseDir = getBaseDir();
  const possiblePaths = [
    path.resolve(baseDir, relativePath),
    path.resolve(baseDir, '..', relativePath),
    path.resolve(baseDir, '..', 'server', relativePath),
    path.resolve(baseDir, 'server', relativePath),
    path.resolve(process.cwd(), relativePath),
    path.resolve(process.cwd(), 'server', relativePath),
    path.resolve(process.cwd(), '..', relativePath),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        return fs.readFileSync(p, 'utf8');
      } catch (err) {
        console.error('Error reading ' + p + ':', err);
      }
    }
  }
  return '';
}

export function getAdkSpecification(): string {
  const platform = readFileSafely('ADK_SPEC.md/platform-spec.md');
  const endpoints = readFileSafely('ADK_SPEC.md/endpoint-spec.md');
  const frameworks = readFileSafely('ADK_SPEC.md/framework-integration.md');
  return [platform, endpoints, frameworks].filter(Boolean).join(String.fromCharCode(10) + String.fromCharCode(10));
}

export const ADK_SPECIFICATION = getAdkSpecification();
