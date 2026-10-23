// Browser shims for Node builtins required when bundling server-centric agent libraries like Mastra

export const mkdtemp = async () => '/tmp/mastra_browser';
export const rm = async () => {};
export const writeFile = async () => {};
export const readFile = async () => '';

export const join = (...args: string[]) => args.filter(Boolean).join('/');
export const resolve = (...args: string[]) => args.filter(Boolean).join('/');
export const dirname = (p: string) => p.split('/').slice(0, -1).join('/') || '/';
export const basename = (p: string) => p.split('/').pop() || '';

export const pathToFileURL = (p: string) => new URL(`file://${p.startsWith('/') ? '' : '/'}${p}`);
export const fileURLToPath = (u: any) => String(u).replace(/^file:\/\//, '');

export const lookup = (_hostname: string, cb?: any) => {
  if (typeof cb === 'function') cb(null, '127.0.0.1', 4);
};

export const tmpdir = () => '/tmp';
export const platform = () => 'browser';
export const arch = () => 'x64';
export const cpus = () => [{ model: 'Browser WebGPU Virtual CPU', speed: 3000 }];

export default {
  mkdtemp,
  rm,
  writeFile,
  readFile,
  join,
  resolve,
  dirname,
  basename,
  pathToFileURL,
  fileURLToPath,
  lookup,
  tmpdir,
  platform,
  arch,
  cpus
};
