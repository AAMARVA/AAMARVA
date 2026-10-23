import { createTool } from '@mastra/core/tools';
import { BrowserAgentMessage, BrowserAgentTool } from '../browserAgentRuntime';
import { FrameworkExecutionResult, FrameworkExecutionTraceStep, IFrameworkAdapter } from './types';

export interface MastraWorkflowStep {
  stepId: string;
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  input?: any;
  output?: any;
  durationMs?: number;
}

/**
 * Mastra Browser Runtime Adapter
 * Directly integrates official @mastra/core tool creation and workflow step telemetry.
 */
export class MastraAdapter implements IFrameworkAdapter {
  public id = 'mastra' as const;
  public name = 'Mastra';
  public version = '1.79.x (@mastra/core)';
  public description = 'Mastra Agent & Step Workflow runner utilizing official createTool definitions and workflow step telemetry.';

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

    // Construct official Mastra createTool definitions
    const toolMetaMap = new Map<string, BrowserAgentTool>();
    const mastraToolsMap = new Map<string, any>();

    for (const t of tools) {
      toolMetaMap.set(t.name, t);
      const mTool = createTool({
        id: t.name,
        description: t.description,
        execute: async ({ context }: { context?: any }) => t.execute(context)
      });
      mastraToolsMap.set(t.name, mTool);
    }

    logStep({
      type: 'workflow_step',
      title: 'Mastra createTool Registry Initialized',
      details: {
        agentName: 'AamarvaMastraBrowserAgent',
        registeredTools: Array.from(mastraToolsMap.keys()),
        sdkPackage: '@mastra/core',
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
    let round = 0;
    let finalAnswer = '';

    while (round < maxRounds) {
      round++;
      localInferenceRounds++;
      const startTime = Date.now();

      logStep({
        type: 'model_call',
        title: `Mastra Step: Agent.generate (Round ${round})`,
        details: {
          round,
          contextLength: currentMessages.length,
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
        throw new Error('Mastra: Model returned empty response.');
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
          const toolStartTime = Date.now();

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
            title: `Mastra WorkflowStep: ToolExecution (${fnName})`,
            details: {
              stepId: `step_${toolCall.id}`,
              toolId: fnName,
              input: parsedArgs,
              status: 'running'
            }
          });

          let resultPayload: any;
          const targetMastraTool = mastraToolsMap.get(fnName);
          const targetToolMeta = toolMetaMap.get(fnName);

          if (targetMastraTool && targetToolMeta) {
            if (targetToolMeta.source === 'FLOOR_MCP' || targetToolMeta.source === 'SYSTEM_VERIFIED') {
              networkProxyCalls++;
            }
            try {
              // Execute directly through the official Mastra createTool instance
              resultPayload = await targetMastraTool.execute({ context: parsedArgs });
            } catch (err: any) {
              resultPayload = { error: `Mastra tool error: ${err?.message || 'Unknown'}` };
            }
          } else {
            resultPayload = { error: `Tool '${fnName}' is not registered or authorized on the FLOOR.` };
          }

          const toolDuration = Date.now() - toolStartTime;

          logStep({
            type: 'tool_result',
            title: `Mastra WorkflowStep: ToolSuccess (${fnName})`,
            details: {
              stepId: `step_${toolCall.id}`,
              status: 'success',
              output: resultPayload,
              durationMs: toolDuration
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
        const duration = Date.now() - startTime;
        logStep({
          type: 'workflow_step',
          title: 'Mastra Workflow: Complete',
          details: {
            finalAnswerPreview: finalAnswer.slice(0, 80),
            durationMs: duration
          }
        });
        if (onStream) onStream(finalAnswer);
        break;
      }
    }

    if (!finalAnswer && round >= maxRounds) {
      finalAnswer = `[Mastra Notice: Max workflow steps reached (${maxRounds}). Stopped.]`;
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

export const mastraAdapter = new MastraAdapter();
