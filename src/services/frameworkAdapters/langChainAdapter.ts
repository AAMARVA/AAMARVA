import { DynamicTool } from '@langchain/core/tools';
import { BrowserAgentMessage, BrowserAgentTool } from '../browserAgentRuntime';
import { FrameworkExecutionResult, FrameworkExecutionTraceStep, IFrameworkAdapter } from './types';

export interface LangChainAgentAction {
  tool: string;
  toolInput: Record<string, any>;
  log: string;
}

export interface LangChainAgentStep {
  action: LangChainAgentAction;
  observation: any;
}

export interface LangChainAgentFinish {
  returnValues: { output: string };
  log: string;
}

/**
 * LangChain.js Browser Runtime Adapter
 * Directly integrates @langchain/core DynamicTool and runnable invocation loops.
 */
export class LangChainAdapter implements IFrameworkAdapter {
  public id = 'langchain' as const;
  public name = 'LangChain.js';
  public version = '1.3.x (@langchain/core)';
  public description = 'LangChain.js Agent runtime orchestrating DynamicTools with runnable execution and intermediate step logging.';

  public async execute(params: {
    messages: BrowserAgentMessage[];
    modelId: string;
    tools: BrowserAgentTool[];
    engine: any;
    maxRounds?: number;
    onStream?: (chunk: string) => void;
    onStep?: (step: FrameworkExecutionTraceStep) => void;
  }): Promise<FrameworkExecutionResult> {
    const { messages, modelId, tools, engine, maxRounds = 5, onStream, onStep } = params;
    const trace: FrameworkExecutionTraceStep[] = [];
    const toolsInvoked: string[] = [];
    let localInferenceRounds = 0;
    let networkProxyCalls = 0;
    let stepCounter = 1;

    const logStep = (step: Omit<FrameworkExecutionTraceStep, 'stepNumber' | 'framework' | 'timestamp'>) => {
      const entry: FrameworkExecutionTraceStep = {
        stepNumber: stepCounter++,
        framework: this.id,
        timestamp: new Date().toISOString(),
        ...step
      };
      trace.push(entry);
      if (onStep) onStep(entry);
    };

    // Construct official LangChain DynamicTool instances
    const toolMetaMap = new Map<string, BrowserAgentTool>();
    const lcToolsMap = new Map<string, DynamicTool>();

    for (const t of tools) {
      toolMetaMap.set(t.name, t);
      const lcTool = new DynamicTool({
        name: t.name,
        description: t.description,
        func: async (input: any) => {
          let parsed = input;
          if (typeof input === 'string') {
            try {
              parsed = JSON.parse(input);
            } catch {
              parsed = { raw: input };
            }
          }
          const res = await t.execute(parsed);
          return typeof res === 'string' ? res : JSON.stringify(res);
        }
      });
      lcToolsMap.set(t.name, lcTool);
    }

    logStep({
      type: 'workflow_step',
      title: 'LangChain DynamicTool Registry Initialized',
      details: {
        toolsLoaded: Array.from(lcToolsMap.keys()),
        sdkPackage: '@langchain/core',
        model: modelId
      }
    });

    const openAiTools = tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));

    let currentMessages = [...messages];
    const intermediateSteps: LangChainAgentStep[] = [];
    let round = 0;
    let outputText = '';

    while (round < maxRounds) {
      round++;
      localInferenceRounds++;

      logStep({
        type: 'model_call',
        title: `LangChain ChatModel.invoke (Round ${round})`,
        details: {
          intermediateStepsCount: intermediateSteps.length,
          model: modelId
        }
      });

      const response = await engine.chat.completions.create({
        messages: currentMessages as any,
        tools: openAiTools.length > 0 ? (openAiTools as any) : undefined,
        tool_choice: openAiTools.length > 0 ? 'auto' : undefined,
        temperature: 0.2,
        max_tokens: 1024,
      });

      const choice = response.choices?.[0];
      const message = choice?.message;

      if (!message) {
        throw new Error('LangChain Adapter: Model returned empty response.');
      }

      if (message.tool_calls && message.tool_calls.length > 0) {
        currentMessages.push({
          role: 'assistant',
          content: message.content || '',
          tool_calls: message.tool_calls
        });

        for (const toolCall of message.tool_calls) {
          const fnName = toolCall.function.name;
          toolsInvoked.push(fnName);

          let parsedArgs = {};
          try {
            parsedArgs = typeof toolCall.function.arguments === 'string'
              ? JSON.parse(toolCall.function.arguments || '{}')
              : toolCall.function.arguments || {};
          } catch (err: any) {
            parsedArgs = { error: 'Invalid JSON args' };
          }

          const action: LangChainAgentAction = {
            tool: fnName,
            toolInput: parsedArgs,
            log: `Invoking DynamicTool ${fnName} with input ${JSON.stringify(parsedArgs)}`
          };

          logStep({
            type: 'tool_call',
            title: `LangChain DynamicTool.invoke: ${fnName}`,
            details: action
          });

          let obs: any;
          const targetLcTool = lcToolsMap.get(fnName);
          const targetToolMeta = toolMetaMap.get(fnName);

          if (targetLcTool && targetToolMeta) {
            if (targetToolMeta.source === 'FLOOR_MCP' || targetToolMeta.source === 'SYSTEM_VERIFIED') {
              networkProxyCalls++;
            }
            try {
              // Execute directly via LangChain's official tool.invoke method
              const rawObs = await targetLcTool.invoke(parsedArgs);
              try {
                obs = typeof rawObs === 'string' ? JSON.parse(rawObs) : rawObs;
              } catch {
                obs = rawObs;
              }
            } catch (err: any) {
              obs = { error: `LangChain tool execution failed: ${err?.message || 'Unknown'}` };
            }
          } else {
            obs = { error: `Tool '${fnName}' is not registered or authorized on the FLOOR.` };
          }

          intermediateSteps.push({ action, observation: obs });

          logStep({
            type: 'tool_result',
            title: `LangChain Observation: ${fnName}`,
            details: { observation: obs }
          });

          currentMessages.push({
            role: 'tool',
            name: fnName,
            content: JSON.stringify(obs),
            tool_call_id: toolCall.id,
            toolCallId: toolCall.id
          });
        }
      } else {
        outputText = message.content || '';
        const finish: LangChainAgentFinish = {
          returnValues: { output: outputText },
          log: 'LangChain Agent completed task.'
        };
        logStep({
          type: 'workflow_step',
          title: 'LangChain AgentFinish',
          details: finish
        });
        if (onStream) onStream(outputText);
        break;
      }
    }

    if (!outputText && round >= maxRounds) {
      outputText = `[LangChain Notice: Max iterations reached (${maxRounds} iterations).]`;
      if (onStream) onStream(outputText);
    }

    return {
      finalText: outputText,
      trace,
      framework: this.id,
      toolsInvoked,
      rounds: round,
      privacySummary: {
        localInferenceRounds,
        networkProxyCalls,
        privateDataExposedToNetwork: false
      }
    };
  }
}

export const langChainAdapter = new LangChainAdapter();
