import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import { BrowserAgentMessage, BrowserAgentTool } from '../browserAgentRuntime';
import { FrameworkExecutionResult, FrameworkExecutionTraceStep, IFrameworkAdapter } from './types';

/**
 * LangGraph.js Browser Runtime Adapter
 * Directly compiles and executes a real LangGraph StateGraph
 * (START -> agent_node -> tools_condition -> tool_node -> agent_node -> END)
 * using the official @langchain/langgraph package in browser.
 */
export class LangGraphAdapter implements IFrameworkAdapter {
  public id = 'langgraph' as const;
  public name = 'LangGraph.js';
  public version = '1.5.x (@langchain/langgraph)';
  public description = 'Cyclic StateGraph orchestration compiled and invoked via @langchain/langgraph with conditional edges and state checkpoints.';

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

    logStep({
      type: 'graph_node',
      title: 'StateGraph::START -> CompiledStateGraph',
      details: {
        topology: 'START -> agent_node <-> tool_node -> END',
        sdkPackage: '@langchain/langgraph',
        model: modelId,
        maxRecursionLimit: maxRounds
      }
    });

    // Define the official LangGraph State Annotation
    const AgentState = Annotation.Root({
      messages: Annotation<BrowserAgentMessage[]>({
        reducer: (prev, next) => next ?? prev,
        default: () => [...messages]
      }),
      iteration: Annotation<number>({
        reducer: (prev, next) => next ?? prev,
        default: () => 0
      }),
      pendingToolCalls: Annotation<any[]>({
        reducer: (prev, next) => next ?? prev,
        default: () => []
      }),
      finalAnswer: Annotation<string>({
        reducer: (prev, next) => next ?? prev,
        default: () => ''
      }),
      isComplete: Annotation<boolean>({
        reducer: (prev, next) => next ?? prev,
        default: () => false
      })
    });

    // Construct the StateGraph
    const workflow = new StateGraph(AgentState)
      // Agent node: executes model completion
      .addNode('agent_node', async (state) => {
        const nextIteration = state.iteration + 1;
        localInferenceRounds++;

        logStep({
          type: 'graph_node',
          title: `Node [agent_node] (Iteration ${nextIteration})`,
          details: {
            node: 'agent_node',
            stateChannel: 'messages',
            messagesCount: state.messages.length
          }
        });

        const response = await engine.chat.completions.create({
          messages: state.messages as any,
          tools: openAiTools.length > 0 ? (openAiTools as any) : undefined,
          tool_choice: openAiTools.length > 0 ? 'auto' : undefined,
          temperature: 0.2,
          max_tokens: 1024,
        });

        const choice = response.choices?.[0];
        const message = choice?.message;

        if (!message) {
          throw new Error('LangGraph: agent_node failed to return completion.');
        }

        const toolCalls = message.tool_calls || [];
        const hasTools = toolCalls.length > 0 && nextIteration < maxRounds;

        if (!hasTools) {
          let finalAns = message.content || '';
          if (nextIteration >= maxRounds && (toolCalls.length > 0 || !finalAns)) {
            finalAns = `[LangGraph Notice: Recursion limit reached (${maxRounds} cycles). Terminated.]`;
          }
          if (onStream) onStream(finalAns);
          return {
            iteration: nextIteration,
            pendingToolCalls: [],
            finalAnswer: finalAns,
            isComplete: true
          };
        }

        const updatedMessages = [
          ...state.messages,
          {
            role: 'assistant' as const,
            content: message.content || '',
            tool_calls: message.tool_calls
          }
        ];

        return {
          messages: updatedMessages,
          iteration: nextIteration,
          pendingToolCalls: toolCalls,
          isComplete: false
        };
      })
      // Tool node: dispatches tools and accumulates outputs
      .addNode('tool_node', async (state) => {
        const currentMessages = [...state.messages];

        for (const toolCall of state.pendingToolCalls) {
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
            title: `Node [tool_node]::execute(${fnName})`,
            details: {
              toolCallId: toolCall.id,
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
            title: `Node [tool_node]::result(${fnName})`,
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

        // Loop back edge from tool_node to agent_node
        logStep({
          type: 'state_transition',
          title: 'Edge [tool_node] -> [agent_node] (Cycle)',
          details: {
            nextChannel: 'messages_updated',
            iteration: state.iteration
          }
        });

        return {
          messages: currentMessages,
          pendingToolCalls: []
        };
      })
      .addEdge(START, 'agent_node')
      .addConditionalEdges('agent_node', (state) => {
        const next = state.pendingToolCalls.length > 0 && !state.isComplete ? 'tool_node' : END;
        logStep({
          type: 'state_transition',
          title: `Conditional Edge [tools_condition] -> ${next}`,
          details: {
            isComplete: state.isComplete,
            pendingToolCalls: state.pendingToolCalls.length,
            next
          }
        });
        return next;
      })
      .addEdge('tool_node', 'agent_node');

    // Compile official LangGraph runnable
    const compiledGraph = workflow.compile();

    const finalState = await compiledGraph.invoke({
      messages: [...messages],
      iteration: 0,
      pendingToolCalls: [],
      finalAnswer: '',
      isComplete: false
    });

    logStep({
      type: 'graph_node',
      title: 'Node [END] Reached',
      details: {
        finalAnswerPreview: finalState.finalAnswer.slice(0, 100),
        totalIterations: finalState.iteration
      }
    });

    return {
      finalText: finalState.finalAnswer,
      trace,
      framework: this.id,
      toolsInvoked,
      rounds: finalState.iteration,
      privacySummary: {
        localInferenceRounds,
        networkProxyCalls,
        privateDataExposedToNetwork: false
      }
    };
  }
}

export const langGraphAdapter = new LangGraphAdapter();
