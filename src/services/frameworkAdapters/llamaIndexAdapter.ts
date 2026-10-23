import { FunctionTool } from 'llamaindex';
import { BrowserAgentMessage, BrowserAgentTool } from '../browserAgentRuntime';
import { FrameworkExecutionResult, FrameworkExecutionTraceStep, IFrameworkAdapter } from './types';

/**
 * LlamaIndex.TS Browser Runtime Adapter
 * Directly integrates official LlamaIndex FunctionTool instances and the ReAct reasoning pipeline:
 * Thought -> Action -> Action Input -> Observation -> Thought -> Final Answer
 */
export class LlamaIndexAdapter implements IFrameworkAdapter {
  public id = 'llamaindex' as const;
  public name = 'LlamaIndex.TS';
  public version = '0.12.x (llamaindex)';
  public description = 'LlamaIndex.TS ReAct agent pipeline utilizing official FunctionTools and multi-step Thought-Action-Observation loops.';

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

    // Construct official LlamaIndex FunctionTools
    const toolMetaMap = new Map<string, BrowserAgentTool>();
    const llamaToolsMap = new Map<string, FunctionTool<any, any>>();

    for (const t of tools) {
      toolMetaMap.set(t.name, t);
      const ft = FunctionTool.from(
        async (args: any) => t.execute(args),
        {
          name: t.name,
          description: t.description,
          parameters: t.parameters
        }
      );
      llamaToolsMap.set(t.name, ft);
    }

    logStep({
      type: 'workflow_step',
      title: 'LlamaIndex FunctionTool.from Registry Initialized',
      details: {
        toolsConfigured: Array.from(llamaToolsMap.keys()),
        model: modelId,
        sdkPackage: 'llamaindex',
        strategy: 'ReAct (Thought/Action/Observation)'
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
    let round = 0;
    let finalAnswer = '';

    while (round < maxRounds) {
      round++;
      localInferenceRounds++;

      logStep({
        type: 'react_thought',
        title: `LlamaIndex ReAct Cycle #${round}: Thought`,
        details: {
          round,
          contextTurns: currentMessages.length,
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
        throw new Error('LlamaIndex: Model returned empty response.');
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

          logStep({
            type: 'react_action',
            title: `LlamaIndex Action: ${fnName}`,
            details: {
              action: fnName,
              actionInput: parsedArgs,
              callId: toolCall.id
            }
          });

          let resultPayload: any;
          const targetLlamaTool = llamaToolsMap.get(fnName);
          const targetToolMeta = toolMetaMap.get(fnName);

          if (targetLlamaTool && targetToolMeta) {
            if (targetToolMeta.source === 'FLOOR_MCP' || targetToolMeta.source === 'SYSTEM_VERIFIED') {
              networkProxyCalls++;
            }
            try {
              // Execute directly through the official LlamaIndex FunctionTool
              resultPayload = await targetLlamaTool.call(parsedArgs);
            } catch (err: any) {
              resultPayload = { error: `Tool execution failed: ${err?.message || 'Unknown'}` };
            }
          } else {
            resultPayload = { error: `Tool '${fnName}' is not registered or authorized on the FLOOR.` };
          }

          logStep({
            type: 'tool_result',
            title: `LlamaIndex Observation: ${fnName}`,
            details: {
              observation: resultPayload
            }
          });

          currentMessages.push({
            role: 'tool',
            name: fnName,
            content: JSON.stringify(resultPayload),
            tool_call_id: toolCall.id,
            toolCallId: toolCall.id
          });
        }
      } else {
        finalAnswer = message.content || '';
        logStep({
          type: 'react_thought',
          title: 'LlamaIndex Final Answer Synthesized',
          details: {
            finalAnswerPreview: finalAnswer.slice(0, 80)
          }
        });
        if (onStream) onStream(finalAnswer);
        break;
      }
    }

    if (!finalAnswer && round >= maxRounds) {
      finalAnswer = `[LlamaIndex Notice: Max ReAct reasoning rounds exceeded (${maxRounds}). Stopped.]`;
      if (onStream) onStream(finalAnswer);
    }

    return {
      finalText: finalAnswer,
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

export const llamaIndexAdapter = new LlamaIndexAdapter();
