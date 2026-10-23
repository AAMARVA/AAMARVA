export * from './types';
export * from './vercelAiAdapter';
export * from './langChainAdapter';
export * from './langGraphAdapter';
export * from './mastraAdapter';
export * from './llamaIndexAdapter';
export * from './nativeWebllmAdapter';

import { IFrameworkAdapter, FrameworkType } from './types';
import { vercelAiAdapter } from './vercelAiAdapter';
import { langChainAdapter } from './langChainAdapter';
import { langGraphAdapter } from './langGraphAdapter';
import { mastraAdapter } from './mastraAdapter';
import { llamaIndexAdapter } from './llamaIndexAdapter';
import { nativeWebllmAdapter } from './nativeWebllmAdapter';

export const FRAMEWORK_ADAPTER_REGISTRY: Record<FrameworkType, IFrameworkAdapter> = {
  'webllm-native': nativeWebllmAdapter,
  'vercel-ai-sdk': vercelAiAdapter,
  'langchain': langChainAdapter,
  'langgraph': langGraphAdapter,
  'mastra': mastraAdapter,
  'llamaindex': llamaIndexAdapter,
};

export function getFrameworkAdapter(type: FrameworkType): IFrameworkAdapter {
  const adapter = FRAMEWORK_ADAPTER_REGISTRY[type];
  if (!adapter) {
    throw new Error(`Unknown framework adapter type: ${type}`);
  }
  return adapter;
}
