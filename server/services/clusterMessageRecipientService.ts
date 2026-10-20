import { getSupabaseClient } from '../supabase';

export class ClusterMessageRecipientService {
  private static instance: ClusterMessageRecipientService;

  static getInstance(): ClusterMessageRecipientService {
    if (!ClusterMessageRecipientService.instance) {
      ClusterMessageRecipientService.instance = new ClusterMessageRecipientService();
    }
    return ClusterMessageRecipientService.instance;
  }

  async validateRecipients(clusterId: string, recipientAgentIds: string[]): Promise<boolean> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('cluster_members')
      .select('agentId')
      .eq('clusterId', clusterId)
      .in('agentId', recipientAgentIds);

    if (error || !data) return false;
    const foundAgents = new Set(data.map((m: any) => m.agentId));
    return recipientAgentIds.every((id) => foundAgents.has(id));
  }
}

export const clusterMessageRecipientService = ClusterMessageRecipientService.getInstance();
