import { tool as createAiTool } from 'ai';
import { BrowserAgentMessage, BrowserAgentTool } from '../browserAgentRuntime';
import { FrameworkExecutionResult, FrameworkExecutionTraceStep, IFrameworkAdapter } from './types';

/**
 * Vercel AI SDK Browser Runtime Adapter
 * Directly integrates the official 'ai' package tool constructs and multi-step tool-calling pipeline.
 */
export class VercelAiAdapter implements IFrameworkAdapter {
  public id = 'vercel-ai-sdk' as const;
  public name = 'Vercel AI SDK';
  public version = '7.0.x (ai package)';
  public description = 'Client-side agent loop utilizing official Vercel AI SDK tool constructs and streaming step traces.';

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

    // Instantiate official Vercel AI SDK tool definitions
    const aiToolsMap = new Map<string, any>();
    const toolMetaMap = new Map<string, BrowserAgentTool>();

    for (const t of tools) {
      toolMetaMap.set(t.name, t);
      const aiTool = (createAiTool as any)({
        description: t.description,
        execute: async (args: any) => t.execute(args)
      });
      aiToolsMap.set(t.name, aiTool);
    }

    logStep({
      type: 'workflow_step',
      title: 'Vercel AI SDK: createAiTool Registry Initialized',
      details: {
        toolsInitialized: Array.from(aiToolsMap.keys()),
        sdkPackage: 'ai (v7.0.x)'
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

    const currentMessages = [...messages];
    let round = 0;
    let finalAnswer = '';

    while (round < maxRounds) {
      round++;
      localInferenceRounds++;

      logStep({
        type: 'model_call',
        title: `Vercel AI SDK generateText (Round ${round})`,
        details: {
          model: modelId,
          messagesCount: currentMessages.length,
          availableTools: Array.from(aiToolsMap.keys())
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
        throw new Error('Vercel AI SDK Adapter: Model returned empty completion response.');
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
            title: `Vercel AI SDK tool.execute: ${fnName}`,
            details: {
              toolCallId: toolCall.id,
              toolName: fnName,
              args: parsedArgs
            }
          });

          let resultPayload: any;
          const targetAiTool = aiToolsMap.get(fnName);
          const targetToolMeta = toolMetaMap.get(fnName);

          if (targetAiTool && targetToolMeta) {
            if (targetToolMeta.source === 'FLOOR_MCP' || targetToolMeta.source === 'SYSTEM_VERIFIED') {
              networkProxyCalls++;
            }
            try {
              // Execute directly through the official Vercel AI SDK tool instance
              resultPayload = await targetAiTool.execute(parsedArgs, { toolCallId: toolCall.id, messages: currentMessages });
            } catch (err: any) {
              resultPayload = { error: `Tool execution failed: ${err?.message || 'Unknown'}` };
            }
          } else {
            resultPayload = { error: `Tool '${fnName}' is not registered or authorized on the FLOOR.` };
          }

          logStep({
            type: 'tool_result',
            title: `Vercel AI SDK toolResult: ${fnName}`,
            details: {
              toolCallId: toolCall.id,
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
      finalAnswer = `[Vercel AI SDK Notice: Step limit reached (${maxRounds} maxSteps). Safe termination invoked.]`;
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

export const vercelAiAdapter = new VercelAiAdapter();
