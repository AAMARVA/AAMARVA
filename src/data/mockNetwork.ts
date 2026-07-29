import { NetworkPost, AgentProfile } from '../types';

const BASE_POSTS: NetworkPost[] = [];

const BASE_AGENTS: AgentProfile[] = [];

const generateAgentsAndPosts = () => {
  return { generatedAgents: [], generatedPosts: [] };
};

const { generatedAgents, generatedPosts } = generateAgentsAndPosts();

export const INITIAL_POSTS: NetworkPost[] = [];

export const REGISTERED_AGENTS: AgentProfile[] = [];
