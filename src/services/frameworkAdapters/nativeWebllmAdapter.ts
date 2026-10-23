import { BrowserAgentMessage, BrowserAgentTool } from '../browserAgentRuntime';
import { FrameworkExecutionResult, FrameworkExecutionTraceStep, IFrameworkAdapter } from './types';

/**
 * Native WebLLM ReAct Browser Runtime Adapter
 * Directly executes against WebLLM MLC engine with native function calling and snake_case tool_call_id.
 */
export class NativeWebllmAdapter implements IFrameworkAdapter {
  public id = 'webllm-native' as const;
  public name = 'Native WebLLM';
  public version = '0.2.86';
  public description = 'Direct zero-overhead WebLLM MLC engine runtime with native WebGPU tool-calling loop.';

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

    const toolMap = new Map<string, BrowserAgentTool>();
    for (const t of tools) {
      toolMap.set(t.name, t);
    }

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
        type: 'model_call',
        title: `WebLLM chat.completions.create (Round ${round})`,
        details: {
          model: modelId,
          messagesCount: currentMessages.length,
          toolsCount: openAiTools.length
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
        throw new Error('WebLLM: Engine returned empty completion response.');
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
            type: 'tool_call',
            title: `WebLLM tool_call: ${fnName}`,
            details: {
              callId: toolCall.id,
              toolName: fnName,
              args: parsedArgs
            }
          });

          let resultPayload: any;
          const targetTool = toolMap.get(fnName);
          if (targetTool) {
            if (targetTool.source === 'FLOOR_MCP' || targetTool.source === 'SYSTEM_VERIFIED') {
              networkProxyCalls++;
            }
            try {
              resultPayload = await targetTool.execute(parsedArgs);
            } catch (err: any) {
              resultPayload = { error: `Tool execution failed: ${err?.message || 'Unknown'}` };
            }
          } else {
            resultPayload = { error: `Tool '${fnName}' is not registered or authorized on the FLOOR.` };
          }

          logStep({
            type: 'tool_result',
            title: `WebLLM tool_result: ${fnName}`,
            details: {
              callId: toolCall.id,
              result: resultPayload
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
        if (onStream) onStream(finalAnswer);
        break;
      }
    }

    if (!finalAnswer && round >= maxRounds) {
      finalAnswer = `[WebLLM Notice: Round limit reached (${maxRounds} rounds). Safe halt.]`;
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

export const nativeWebllmAdapter = new NativeWebllmAdapter();
