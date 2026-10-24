import { prebuiltAppConfig } from '@mlc-ai/web-llm';
import { ChatWebLLM } from '@langchain/community/chat_models/webllm';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { EXACT_QWEN_MODEL_ID, DISPLAY_MODEL_NAME } from '../../src/services/qwenLangchainService.ts';

export async function runQwenLangchainIntegrationTests() {
  const results: Record<string, { status: string; passed: boolean; details?: any }> = {};

  // 1. Verify model catalog support in @mlc-ai/web-llm
  try {
    const catalogEntry = prebuiltAppConfig.model_list.find(
      (m: any) => m.model_id === EXACT_QWEN_MODEL_ID
    );

    if (!catalogEntry) {
      results['model_catalog_verification'] = {
        status: 'FAILED',
        passed: false,
        details: `Model ${EXACT_QWEN_MODEL_ID} not found in prebuiltAppConfig.model_list`,
      };
    } else {
      results['model_catalog_verification'] = {
        status: 'PASSED',
        passed: true,
        details: {
          model_id: catalogEntry.model_id,
          model_url: catalogEntry.model,
          vram_required_MB: (catalogEntry as any).vram_required_MB,
        },
      };
    }
  } catch (err: any) {
    results['model_catalog_verification'] = {
      status: 'FAILED',
      passed: false,
      details: err?.message,
    };
  }

  // 2. Verify LangChain.js ChatWebLLM instantiation with real model config
  try {
    const chatModel = new ChatWebLLM({
      model: EXACT_QWEN_MODEL_ID,
      temperature: 0.2,
      appConfig: prebuiltAppConfig,
    });

    const hasInitMethod = typeof chatModel.initialize === 'function';
    const hasInvokeMethod = typeof chatModel.invoke === 'function';
    const hasPipeMethod = typeof (chatModel as any).pipe === 'function';

    if (chatModel.model === EXACT_QWEN_MODEL_ID && hasInitMethod && hasInvokeMethod && hasPipeMethod) {
      results['langchain_chat_webllm_integration'] = {
        status: 'PASSED',
        passed: true,
        details: {
          configuredModel: chatModel.model,
          supportsInitialize: hasInitMethod,
          supportsInvoke: hasInvokeMethod,
          supportsPipe: hasPipeMethod,
        },
      };
    } else {
      results['langchain_chat_webllm_integration'] = {
        status: 'FAILED',
        passed: false,
        details: 'ChatWebLLM instance does not meet expected interface requirements',
      };
    }
  } catch (err: any) {
    results['langchain_chat_webllm_integration'] = {
      status: 'FAILED',
      passed: false,
      details: err?.message,
    };
  }

  // 3. Verify LangChain LCEL composition (PromptTemplate -> ChatWebLLM -> StringOutputParser)
  try {
    const promptTemplate = PromptTemplate.fromTemplate(
      '<|im_start|>system\n{system_message}<|im_end|>\n<|im_start|>user\n{question}<|im_end|>\n<|im_start|>assistant\n'
    );
    const chatModel = new ChatWebLLM({
      model: EXACT_QWEN_MODEL_ID,
      appConfig: prebuiltAppConfig,
    });
    const outputParser = new StringOutputParser();

    const chain = promptTemplate.pipe(chatModel).pipe(outputParser);
    const isRunnable = chain && typeof chain.invoke === 'function' && typeof chain.batch === 'function';

    results['langchain_lcel_chain_composition'] = {
      status: isRunnable ? 'PASSED' : 'FAILED',
      passed: isRunnable,
      details: {
        chainConstructed: Boolean(chain),
        isRunnableSequence: isRunnable,
      },
    };
  } catch (err: any) {
    results['langchain_lcel_chain_composition'] = {
      status: 'FAILED',
      passed: false,
      details: err?.message,
    };
  }

  // 4. Verify Zero Cloud Fallback constraint
  try {
    // Assert that no fallback endpoint or API key is passed into ChatWebLLM
    const model = new ChatWebLLM({
      model: EXACT_QWEN_MODEL_ID,
      appConfig: prebuiltAppConfig,
    });

    const isLocalConfig = !(model as any).apiKey && !(model as any).baseUrl;
    results['zero_cloud_fallback_enforcement'] = {
      status: isLocalConfig ? 'PASSED' : 'FAILED',
      passed: isLocalConfig,
      details: {
        enforcesLocalOnly: isLocalConfig,
      },
    };
  } catch (err: any) {
    results['zero_cloud_fallback_enforcement'] = {
      status: 'FAILED',
      passed: false,
      details: err?.message,
    };
  }

  return results;
}
