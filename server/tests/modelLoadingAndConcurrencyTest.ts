import * as webllm from '@mlc-ai/web-llm';
import { BrowserAgentRuntimeEngine, MODEL_EVALUATIONS } from '../../src/services/browserAgentRuntime';

export async function runModelLoadingAndConcurrencyTest() {
  console.log('=== VERIFYING MODEL LOADING & CONCURRENCY LIFECYCLE ===');

  const results: Record<string, boolean> = {};

  // 1. Verify all 5 models can be initialized and unloaded through the runtime lifecycle
  console.log('--- Testing Sequential Loading & Unloading Across All 5 Models ---');
  const engine = new BrowserAgentRuntimeEngine();
  
  let createdCount = 0;
  let unloadedCount = 0;
  const loadedModels: string[] = [];

  engine.setEngineCreator(async (modelId: string) => {
    createdCount++;
    loadedModels.push(modelId);
    return {
      modelId,
      unload: async () => {
        unloadedCount++;
      },
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { content: `Response from ${modelId}` } }]
          })
        }
      }
    };
  });

  const modelIds = [
    'SmolLM2-360M-Instruct-q4f16_1-MLC',
    'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    'gemma3-1b-it-q4f16_1-MLC'
  ];

  let sequentialPassed = true;
  for (const mId of modelIds) {
    const e = await engine.initializeModel(mId);
    if (!e || engine.getModelId() !== mId || !engine.isReady()) {
      console.error(`[FAIL] Sequential load failed for ${mId}`);
      sequentialPassed = false;
      break;
    }
    const res = await engine.executeAgentTurn(
      [{ role: 'user', content: 'Ping' }],
      mId
    );
    if (!res.includes(mId)) {
      console.error(`[FAIL] Turn execution output did not match model for ${mId}: ${res}`);
      sequentialPassed = false;
      break;
    }
  }

  // When switching 5 models sequentially, prior engines should have been unloaded 4 times
  if (sequentialPassed && unloadedCount === 4 && createdCount === 5) {
    console.log(`[PASS] All 5 models sequentially loaded, verified, and previous engines safely unloaded (created: ${createdCount}, unloaded: ${unloadedCount})`);
    results['all_5_models_sequential_lifecycle'] = true;
  } else {
    console.error(`[FAIL] Model sequential lifecycle issue: created=${createdCount}, unloaded=${unloadedCount}`);
    results['all_5_models_sequential_lifecycle'] = false;
  }

  // Explicit unload of final model
  await engine.unloadCurrentEngine();
  const fullyUnloaded = engine.getModelId() === '' && !engine.isReady() && unloadedCount === 5;
  if (fullyUnloaded) {
    console.log('[PASS] Explicit unloadCurrentEngine cleanly released final model from memory');
    results['explicit_unload_cleans_state'] = true;
  } else {
    console.error(`[FAIL] Explicit unload failed to reset state: ${engine.getModelId()}`);
    results['explicit_unload_cleans_state'] = false;
  }

  // 2. Test Different-Model Concurrency (Simultaneous Request for Model A and Model B)
  console.log('--- Testing Concurrent Initialization with Different Models ---');
  const concurrentEngine = new BrowserAgentRuntimeEngine();
  
  let concurrentCreatedCount = 0;
  let concurrentUnloadCount = 0;
  const creationLog: string[] = [];

  concurrentEngine.setEngineCreator(async (modelId: string) => {
    concurrentCreatedCount++;
    creationLog.push(`create_start_${modelId}`);
    // Simulate async download delay
    await new Promise(r => setTimeout(r, 60));
    creationLog.push(`create_done_${modelId}`);
    return {
      modelId,
      unload: async () => {
        concurrentUnloadCount++;
        creationLog.push(`unload_${modelId}`);
      },
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { content: `Result from ${modelId}` } }]
          })
        }
      }
    };
  });

  const modelA = 'SmolLM2-360M-Instruct-q4f16_1-MLC';
  const modelB = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';

  // Trigger Model A, and immediately without waiting trigger Model B
  const promiseA = concurrentEngine.initializeModel(modelA);
  // Short micro-tick to ensure promiseA has registered as in-flight
  await new Promise(r => setTimeout(r, 5));
  const promiseB = concurrentEngine.initializeModel(modelB);

  const [resA, resB] = await Promise.all([promiseA, promiseB]);

  // Model A completed its initial request, but then when Model B request ran,
  // Model A was unloaded and Model B was created and remains the active engine
  const activeModelId = concurrentEngine.getModelId();
  const finalEngineMatchesB = activeModelId === modelB;
  const modelAWasUnloaded = concurrentUnloadCount >= 1;
  const noDeadlock = !!resA && !!resB;

  if (finalEngineMatchesB && modelAWasUnloaded && noDeadlock) {
    console.log(`[PASS] Concurrent different-model initialization serialized properly: Model A was initialized and subsequently safely unloaded (${concurrentUnloadCount} unload), settling on Model B (${activeModelId})`);
    results['concurrent_different_models_serialized'] = true;
  } else {
    console.error(`[FAIL] Concurrent different-model collision: active=${activeModelId}, unloads=${concurrentUnloadCount}`);
    results['concurrent_different_models_serialized'] = false;
  }

  // 3. Test Rapid Successive Model Requests (Queue of 3 Different Models)
  console.log('--- Testing Rapid Successive Requests for 3 Distinct Models ---');
  const queueEngine = new BrowserAgentRuntimeEngine();
  let queueCreated = 0;
  let queueUnloaded = 0;

  queueEngine.setEngineCreator(async (mId: string) => {
    queueCreated++;
    await new Promise(r => setTimeout(r, 30));
    return {
      modelId: mId,
      unload: async () => {
        queueUnloaded++;
      },
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { content: `Output ${mId}` } }]
          })
        }
      }
    };
  });

  const q1 = queueEngine.initializeModel('SmolLM2-360M-Instruct-q4f16_1-MLC');
  const q2 = queueEngine.initializeModel('Llama-3.2-1B-Instruct-q4f16_1-MLC');
  const q3 = queueEngine.initializeModel('gemma3-1b-it-q4f16_1-MLC');

  await Promise.all([q1, q2, q3]);

  const settledOnLast = queueEngine.getModelId() === 'gemma3-1b-it-q4f16_1-MLC';
  const properUnloads = queueUnloaded === 2; // q1 and q2 unmounted

  if (settledOnLast && properUnloads) {
    console.log(`[PASS] Rapid 3-model queue serialized cleanly: settled on final model 'gemma3-1b-it-q4f16_1-MLC' with 2 prior unloads`);
    results['rapid_multi_model_queue_serialized'] = true;
  } else {
    console.error(`[FAIL] Multi-model queue issue: settled=${queueEngine.getModelId()}, unloads=${queueUnloaded}`);
    results['rapid_multi_model_queue_serialized'] = false;
  }

  // 4. Test Authorized FLOOR Tool Execution vs Unauthorized Rejection
  console.log('--- Testing Authorized vs Unauthorized Tool Execution Guarantees ---');
  const toolEngine = new BrowserAgentRuntimeEngine();

  // Register an authorized FLOOR tool
  (toolEngine as any).tools.set('authorized_cluster_telemetry', {
    name: 'authorized_cluster_telemetry',
    description: 'Authorized FLOOR telemetry query',
    parameters: { type: 'object', properties: {} },
    source: 'FLOOR_MCP',
    execute: async () => ({ status: 'SUCCESS', clusterSize: 8, encrypted: true })
  });

  // Test authorized invocation
  const authRes = await toolEngine.testInvokeRegisteredTool('authorized_cluster_telemetry', {});
  const authPassed = authRes?.status === 'SUCCESS' && authRes?.clusterSize === 8;

  // Test unauthorized invocation
  const unauthRes = await toolEngine.testInvokeRegisteredTool('unauthorized_eval_exec', {});
  const unauthBlocked = typeof unauthRes?.error === 'string' && unauthRes.error.includes('not registered or authorized');

  if (authPassed && unauthBlocked) {
    console.log('[PASS] Authorized FLOOR tool executed successfully; unauthorized tool strictly rejected');
    results['authorized_tool_execution_enforced'] = true;
  } else {
    console.error('[FAIL] Tool authorization guarantee failed', { authRes, unauthRes });
    results['authorized_tool_execution_enforced'] = false;
  }

  return results;
}
