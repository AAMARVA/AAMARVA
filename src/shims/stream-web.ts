// Browser shim for Node's stream/web using browser global Web Streams API
export const WritableStream = typeof globalThis !== 'undefined' ? globalThis.WritableStream : undefined;
export const ReadableStream = typeof globalThis !== 'undefined' ? globalThis.ReadableStream : undefined;
export const TransformStream = typeof globalThis !== 'undefined' ? globalThis.TransformStream : undefined;

export default {
  WritableStream,
  ReadableStream,
  TransformStream
};
