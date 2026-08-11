import fs from 'fs';
import path from 'path';

export const ADK_SPECIFICATION = fs.readFileSync(path.join(process.cwd(), 'server', 'adk_spec.md'), 'utf8');
