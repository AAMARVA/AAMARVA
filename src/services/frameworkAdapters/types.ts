import { BrowserAgentMessage, BrowserAgentTool } from '../browserAgentRuntime';

export type FrameworkType = 
  | 'webllm-native'
  | 'vercel-ai-sdk'
  | 'langchain'
  | 'langgraph'
  | 'mastra'
  | 'llamaindex';

export interface FrameworkExecutionTraceStep {
  stepNumber: number;
  framework: FrameworkType;
  type: 
    | 'model_call' 
    | 'tool_call' 
    | 'tool_result' 
    | 'state_transition' 
    | 'react_thought' 
    | 'react_action' 
    | 'workflow_step' 
    | 'graph_node';
  title: string;
  details: any;
  timestamp: string;
}

export interface FrameworkExecutionResult {
  finalText: string;
  trace: FrameworkExecutionTraceStep[];
  framework: FrameworkType;
  toolsInvoked: string[];
  rounds: number;
  privacySummary: {
    localInferenceRounds: number;
    networkProxyCalls: number;
    privateDataExposedToNetwork: boolean;
  };
}

export interface IFrameworkAdapter {
  id: FrameworkType;
  name: string;
  version: string;
  description: string;
  execute(params: {
    messages: BrowserAgentMessage[];
    modelId: string;
    tools: BrowserAgentTool[];
    engine: any;
    maxRounds?: number;
    onStream?: (chunk: string) => void;
    onStep?: (step: FrameworkExecutionTraceStep) => void;
  }): Promise<FrameworkExecutionResult>;
}
