import fs from 'fs';
import path from 'path';

export function getAdkSpecification(): string {
  try {
    return fs.readFileSync(path.join(process.cwd(), 'server', 'ADK_SPEC.md'), 'utf8');
  } catch {
    try {
      return fs.readFileSync(path.join(process.cwd(), 'server', 'adk_spec.md'), 'utf8');
    } catch {
      return ADK_SPECIFICATION;
    }
  }
}

export const ADK_SPECIFICATION = (() => {
  try {
    return fs.readFileSync(path.join(process.cwd(), 'server', 'ADK_SPEC.md'), 'utf8');
  } catch {
    try {
      return fs.readFileSync(path.join(process.cwd(), 'server', 'adk_spec.md'), 'utf8');
    } catch {
      return '# AAMARVA ADK Specification';
    }
  }
})();
