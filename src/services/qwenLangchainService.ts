import { ChatWebLLM } from '@langchain/community/chat_models/webllm';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { prebuiltAppConfig, type InitProgressReport } from '@mlc-ai/web-llm';

export const EXACT_QWEN_MODEL_ID = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
export const DISPLAY_MODEL_NAME = 'Qwen2.5-0.5B-Instruct';

export interface ModelRuntimeStatus {
  webGpuSupported: boolean;
  modelId: string;
  isLoaded: boolean;
  isLoading: boolean;
  isGenerating: boolean;
  progressText: string;
  progressPercent: number;
  lastResponse: string | null;
  lastLatencyMs: number | null;
  error: string | null;
}

export type StatusListener = (status: ModelRuntimeStatus) => void;

class QwenLangchainManager {
  private chatModel: ChatWebLLM | null = null;
  private listeners: Set<StatusListener> = new Set();
  private status: ModelRuntimeStatus = {
    webGpuSupported: typeof navigator !== 'undefined' && 'gpu' in navigator && Boolean((navigator as any).gpu),
    modelId: EXACT_QWEN_MODEL_ID,
    isLoaded: false,
    isLoading: false,
    isGenerating: false,
    progressText: 'Not loaded',
    progressPercent: 0,
    lastResponse: null,
    lastLatencyMs: null,
    error: null,
  };

  constructor() {
    this.refreshHardwareCheck();
  }

  public getStatus(): ModelRuntimeStatus {
    return { ...this.status };
  }

  public subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const current = this.getStatus();
    this.listeners.forEach((fn) => {
      try {
        fn(current);
      } catch (err) {
        console.error('Error notifying status listener:', err);
      }
    });
  }

  public refreshHardwareCheck(): boolean {
    const supported = typeof navigator !== 'undefined' && 'gpu' in navigator && Boolean((navigator as any).gpu);
    this.status.webGpuSupported = supported;
    this.notify();
    return supported;
  }

  /**
   * Validates that the target model is officially cataloged in prebuiltAppConfig.
   */
  public isModelSupportedInCatalog(): boolean {
    return prebuiltAppConfig.model_list.some((m) => m.model_id === EXACT_QWEN_MODEL_ID);
  }

  /**
   * Initializes local Qwen2.5-0.5B-Instruct via ChatWebLLM.
   * Real browser-local WebGPU execution only; no cloud fallbacks permitted.
   */
  public async loadModel(): Promise<void> {
    if (this.status.isLoading || this.status.isLoaded) {
      return;
    }

    this.refreshHardwareCheck();

    if (!this.status.webGpuSupported) {
      const errMsg = 'WebGPU is not supported or enabled in this browser. Qwen2.5-0.5B-Instruct runs strictly local on WebGPU without cloud fallback.';
      this.status.error = errMsg;
      this.status.progressText = 'WebGPU Unavailable';
      this.notify();
      throw new Error(errMsg);
    }

    if (!this.isModelSupportedInCatalog()) {
      const errMsg = `Model '${EXACT_QWEN_MODEL_ID}' is not cataloged in @mlc-ai/web-llm prebuiltAppConfig.`;
      this.status.error = errMsg;
      this.notify();
      throw new Error(errMsg);
    }

    this.status.isLoading = true;
    this.status.error = null;
    this.status.progressText = 'Starting engine initialization...';
    this.status.progressPercent = 0;
    this.notify();

    try {
      // Instantiate real ChatWebLLM from @langchain/community
      this.chatModel = new ChatWebLLM({
        model: EXACT_QWEN_MODEL_ID,
        temperature: 0.3,
        appConfig: prebuiltAppConfig,
      });

      // Initialize the engine locally with progress reports
      await this.chatModel.initialize((report: InitProgressReport) => {
        this.status.progressText = report.text;
        const progressFrac = typeof report.progress === 'number' ? report.progress : 0;
        this.status.progressPercent = Math.min(100, Math.round(progressFrac * 100));
        this.notify();
      });

      this.status.isLoaded = true;
      this.status.isLoading = false;
      this.status.progressText = 'Model loaded and operational in browser WebGPU';
      this.status.progressPercent = 100;
      this.notify();
    } catch (err: any) {
      this.status.isLoading = false;
      this.status.isLoaded = false;
      this.status.error = err?.message || 'Failed to initialize local model runtime';
      this.status.progressText = 'Initialization failed';
      this.notify();
      throw err;
    }
  }

  /**
   * Executes a prompt directly through the local Qwen model using ChatWebLLM.
   */
  public async executeDirect(prompt: string): Promise<string> {
    if (!this.status.isLoaded || !this.chatModel) {
      await this.loadModel();
    }

    this.status.isGenerating = true;
    this.status.error = null;
    this.notify();

    const start = performance.now();
    try {
      const response = await this.chatModel!.invoke(prompt);
      const text = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
      const latency = Math.round(performance.now() - start);

      this.status.lastResponse = text;
      this.status.lastLatencyMs = latency;
      this.status.isGenerating = false;
      this.notify();
      return text;
    } catch (err: any) {
      this.status.isGenerating = false;
      this.status.error = err?.message || 'Model inference failed';
      this.notify();
      throw err;
    }
  }

  /**
   * Executes a full LangChain.js LCEL chain using PromptTemplate + ChatWebLLM + StringOutputParser.
   * Real LangChain.js APIs, executing directly on the local browser Qwen model.
   */
  public async executeLangchainChain(systemRole: string, userInput: string): Promise<string> {
    if (!this.status.isLoaded || !this.chatModel) {
      await this.loadModel();
    }

    this.status.isGenerating = true;
    this.status.error = null;
    this.notify();

    const start = performance.now();
    try {
      // 1. Genuine LangChain PromptTemplate
      const promptTemplate = PromptTemplate.fromTemplate(
        '<|im_start|>system\n{system_message}<|im_end|>\n<|im_start|>user\n{question}<|im_end|>\n<|im_start|>assistant\n'
      );

      // 2. Genuine LangChain StringOutputParser
      const outputParser = new StringOutputParser();

      // 3. Genuine LangChain LCEL pipeline: PromptTemplate -> ChatWebLLM -> OutputParser
      const chain = promptTemplate.pipe(this.chatModel!).pipe(outputParser);

      // 4. Genuine execution of the chain
      const result = await chain.invoke({
        system_message: systemRole || 'You are an AAMARVA autonomous agent kernel operating on local browser hardware.',
        question: userInput,
      });

      const latency = Math.round(performance.now() - start);
      this.status.lastResponse = result;
      this.status.lastLatencyMs = latency;
      this.status.isGenerating = false;
      this.notify();
      return result;
    } catch (err: any) {
      this.status.isGenerating = false;
      this.status.error = err?.message || 'LangChain execution failed';
      this.notify();
      throw err;
    }
  }

  /**
   * Cleans up browser resources and releases WebGPU memory allocations.
   */
  public async unloadModel(): Promise<void> {
    if (this.chatModel) {
      try {
        const engine = (this.chatModel as any).engine;
        if (engine && typeof engine.unload === 'function') {
          await engine.unload();
        }
      } catch (err) {
        console.warn('Warning during model cleanup:', err);
      }
      this.chatModel = null;
    }

    this.status.isLoaded = false;
    this.status.isLoading = false;
    this.status.isGenerating = false;
    this.status.progressText = 'Model unloaded. WebGPU resources freed.';
    this.status.progressPercent = 0;
    this.notify();
  }
}

export const qwenLangchainService = new QwenLangchainManager();
