import { BrowserAgentRuntimeEngine, BrowserAgentMessage, BrowserAgentTool } from '../../src/services/browserAgentRuntime';
import { 
  getFrameworkAdapter, 
  FRAMEWORK_ADAPTER_REGISTRY, 
  FrameworkType,
  FrameworkExecutionResult 
} from '../../src/services/frameworkAdapters';

export async function runFrameworkAdaptersTest() {
  console.log('=== VERIFYING BROWSER AGENT FRAMEWORK ADAPTERS (5 FRAMEWORKS + NATIVE) ===');

  const frameworks: FrameworkType[] = [
    'webllm-native',
    'vercel-ai-sdk',
    'langchain',
    'langgraph',
    'mastra',
    'llamaindex'
  ];

  const results: Record<string, boolean> = {};

  // Mock tools for framework execution verification
  const mockTools: BrowserAgentTool[] = [
    {
      name: 'get_telemetry_activity',
      description: 'Get telemetry metrics',
      parameters: { type: 'object', properties: {} },
      source: 'SYSTEM_VERIFIED',
      execute: async () => ({
        success: true,
        metrics: { activeNodes: 4, clusterHealth: 'OPTIMAL' }
      })
    },
    {
      name: 'echo_query',
      description: 'Echo back a query string',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query']
      },
      source: 'FLOOR_MCP',
      execute: async (args: { query: string }) => ({
        echoed: args.query,
        timestamp: 123456789
      })
    },
    {
      name: 'failing_tool',
      description: 'A tool that fails',
      parameters: { type: 'object', properties: {} },
      source: 'FLOOR_MCP',
      execute: async () => {
        throw new Error('Connection refused to backend FLOOR endpoint');
      }
    }
  ];

  // Helper to create a predictable mock engine
  const createMockEngine = (options?: { simulateToolCall?: boolean; infiniteToolLoop?: boolean }) => {
    let callCount = 0;
    return {
      unload: async () => {},
      chat: {
        completions: {
          create: async (req: any) => {
            callCount++;
            // If tool call simulated on first round:
            if (options?.simulateToolCall && (callCount === 1 || options?.infiniteToolLoop)) {
              return {
                choices: [
                  {
                    message: {
                      role: 'assistant',
                      content: 'Calling get_telemetry_activity...',
                      tool_calls: [
                        {
                          id: `call_step_${callCount}`,
                          type: 'function',
                          function: {
                            name: 'get_telemetry_activity',
                            arguments: '{}'
                          }
                        }
                      ]
                    }
                  }
                ]
              };
            }

            // Otherwise, return direct synthesized answer
            return {
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content: 'Inference complete. Telemetry metrics show activeNodes: 4, clusterHealth: OPTIMAL.'
                  }
                }
              ]
            };
          }
        }
      }
    };
  };

  // 1. Verify every framework adapter is registered and implements the interface
  for (const fw of frameworks) {
    const adapter = getFrameworkAdapter(fw);
    const valid = !!adapter && adapter.id === fw && typeof adapter.execute === 'function';
    if (!valid) {
      console.error(`[FAIL] Adapter ${fw} failed registration or interface check`);
      results[`adapter_registered_${fw}`] = false;
    } else {
      console.log(`[PASS] Framework Adapter Registered: ${adapter.name} (${adapter.id}, version: ${adapter.version})`);
      results[`adapter_registered_${fw}`] = true;
    }
  }

  // 2. Test execution of all 5 frameworks + native adapter through tool execution cycle
  for (const fw of frameworks) {
    console.log(`--- Testing Framework Execution: ${fw} ---`);
    const adapter = getFrameworkAdapter(fw);
    const mockEngine = createMockEngine({ simulateToolCall: true });

    const messages: BrowserAgentMessage[] = [
      { role: 'user', content: 'Inspect system telemetry activity.' }
    ];

    const result: FrameworkExecutionResult = await adapter.execute({
      messages,
      modelId: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
      tools: mockTools,
      engine: mockEngine,
      maxRounds: 5
    });

    const passed = (
      result.framework === fw &&
      result.toolsInvoked.includes('get_telemetry_activity') &&
      result.rounds >= 2 &&
      result.trace.length > 0 &&
      result.privacySummary.localInferenceRounds >= 2 &&
      result.privacySummary.networkProxyCalls >= 1 &&
      result.privacySummary.privateDataExposedToNetwork === false &&
      result.finalText.includes('Inference complete')
    );

    if (passed) {
      console.log(`[PASS] ${adapter.name}: Successfully executed multi-turn tool calling loop with ${result.trace.length} trace events`);
      results[`execution_verified_${fw}`] = true;
    } else {
      console.error(`[FAIL] ${adapter.name}: Unexpected execution output`, result);
      results[`execution_verified_${fw}`] = false;
    }
  }

  // 3. Test LangGraph StateGraph cyclic topology and state transitions specifically
  console.log('--- Testing LangGraph StateGraph Node Transitions ---');
  const langGraph = getFrameworkAdapter('langgraph');
  const lgEngine = createMockEngine({ simulateToolCall: true });
  const lgResult = await langGraph.execute({
    messages: [{ role: 'user', content: 'Run graph' }],
    modelId: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
    tools: mockTools,
    engine: lgEngine
  });

  const nodeTypes = lgResult.trace.map(t => t.type);
  const hasGraphNode = nodeTypes.includes('graph_node');
  const hasStateTransition = nodeTypes.includes('state_transition');
  const lgValid = hasGraphNode && hasStateTransition;
  if (lgValid) {
    console.log('[PASS] LangGraph StateGraph verified: Produced explicit graph_node entries and state_transition edges');
  } else {
    console.error('[FAIL] LangGraph StateGraph failed to produce graph nodes and transitions');
  }
  results['langgraph_state_machine_verified'] = lgValid;

  // 4. Test Recursion Protection / Circuit Breaker across all adapters
  console.log('--- Testing Recursion Limit / Circuit Breaker Protection ---');
  for (const fw of frameworks) {
    const adapter = getFrameworkAdapter(fw);
    const infiniteEngine = createMockEngine({ simulateToolCall: true, infiniteToolLoop: true });
    const limitResult = await adapter.execute({
      messages: [{ role: 'user', content: 'Trigger infinite loop' }],
      modelId: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
      tools: mockTools,
      engine: infiniteEngine,
      maxRounds: 3
    });

    const halted = limitResult.rounds === 3 && (limitResult.finalText.includes('limit') || limitResult.finalText.includes('reached') || limitResult.finalText.includes('exceeded') || limitResult.finalText.includes('Stopped') || limitResult.finalText.includes('Notice'));
    if (halted) {
      console.log(`[PASS] ${adapter.name}: Circuit breaker safely stopped execution at 3 rounds without hanging`);
      results[`circuit_breaker_${fw}`] = true;
    } else {
      console.error(`[FAIL] ${adapter.name}: Circuit breaker failed to halt at max rounds`, limitResult);
      results[`circuit_breaker_${fw}`] = false;
    }
  }

  // 5. Test Tool Error Handling (No Fake Data)
  console.log('--- Testing Tool Error Handling (No Simulated Fake Data) ---');
  const errorEngine = {
    unload: async () => {},
    chat: {
      completions: {
        create: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                tool_calls: [
                  {
                    id: 'call_err_1',
                    type: 'function',
                    function: {
                      name: 'failing_tool',
                      arguments: '{}'
                    }
                  }
                ]
              }
            }
          ]
        })
      }
    }
  };

  const vercelAdapter = getFrameworkAdapter('vercel-ai-sdk');
  const errMessages: BrowserAgentMessage[] = [{ role: 'user', content: 'Call failing tool' }];
  const errRes = await vercelAdapter.execute({
    messages: errMessages,
    modelId: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
    tools: mockTools,
    engine: errorEngine,
    maxRounds: 2
  });

  const toolResultStep = errRes.trace.find(t => t.type === 'tool_result' && t.details?.toolCallId === 'call_err_1');
  const errPayload = toolResultStep?.details?.result;
  const noFakeData = typeof errPayload?.error === 'string' && (errPayload.error.includes('failed') || errPayload.error.includes('Connection refused'));

  if (noFakeData) {
    console.log(`[PASS] Error handling verified: Tool failure explicitly surfaced as error (${errPayload.error}) rather than fabricated data`);
  } else {
    console.error('[FAIL] Tool failure was not properly surfaced as error', errPayload);
  }
  results['no_fabricated_data_on_tool_failure'] = noFakeData;

  // 6. Test Runtime Engine Integration with Adapters
  console.log('--- Testing BrowserAgentRuntimeEngine Integration with Framework Adapters ---');
  const runtime = new BrowserAgentRuntimeEngine();
  runtime.setEngineCreator(async () => createMockEngine({ simulateToolCall: true }));
  runtime.setActiveFramework('langchain');
  const runtimeRes = await runtime.executeAgentTurnWithTrace(
    [{ role: 'user', content: 'Test prompt' }],
    'SmolLM2-360M-Instruct-q4f16_1-MLC'
  );

  const runtimeSuccess = (
    runtimeRes.framework === 'langchain' &&
    runtimeRes.rounds >= 2 &&
    runtime.getLastExecutionResult() === runtimeRes
  );

  if (runtimeSuccess) {
    console.log('[PASS] BrowserAgentRuntimeEngine successfully routed execution through LangChain adapter with cached trace');
  } else {
    console.error('[FAIL] BrowserAgentRuntimeEngine failed to route through selected framework');
  }
  results['runtime_framework_routing_verified'] = runtimeSuccess;

  return results;
}
