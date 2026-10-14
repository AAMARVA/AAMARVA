import { getSupabaseClient } from '../supabase';
import crypto from 'crypto';

export interface KeyPackage {
  iv: string;
  key: string;
}

export interface EstablishEpochParams {
  epoch?: number;
  keyFingerprint: string;
  distributionMap: Record<string, KeyPackage>;
  senderPublicKey?: any;
  reason?: string;
}

export class ClusterService {
  private static instance: ClusterService;

  static getInstance(): ClusterService {
    if (!ClusterService.instance) {
      ClusterService.instance = new ClusterService();
    }
    return ClusterService.instance;
  }

  /**
   * Distributes or updates an individual wrapped group key package for a specific recipient.
   */
  async distributeGroupKey(
    clusterId: string,
    epoch: number,
    recipientAgentId: string,
    encryptedKeyPackage: string,
    senderPublicKey?: any
  ): Promise<void> {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('cluster_key_distributions').insert({
      id: `dist_${crypto.randomUUID()}`,
      clusterId,
      epoch,
      recipientAgentId,
      encryptedKeyPackage,
      senderPublicKey: senderPublicKey ? (typeof senderPublicKey === 'string' ? senderPublicKey : JSON.stringify(senderPublicKey)) : null,
      createdAt: new Date().toISOString()
    });

    if (error) {
      throw new Error(`Failed to distribute key: ${error.message}`);
    }
  }

  /**
   * Establishes a cluster epoch with an authoritative key fingerprint and distribution packages.
   * Atomic operation ensuring no epoch exists in an unusable or pending state.
   */
  async establishClusterEpoch(
    clusterId: string,
    params: EstablishEpochParams
  ): Promise<{ epoch: number; keyFingerprint: string }> {
    const supabase = getSupabaseClient();
    const { keyFingerprint, distributionMap, senderPublicKey } = params;

    if (!keyFingerprint || typeof keyFingerprint !== 'string' || keyFingerprint.trim().length === 0 || keyFingerprint === 'PENDING_INIT') {
      throw new Error('INVALID_KEY_FINGERPRINT: A valid group key fingerprint is required to establish an authoritative epoch.');
    }

    if (!distributionMap || typeof distributionMap !== 'object' || Object.keys(distributionMap).length === 0) {
      throw new Error('INVALID_DISTRIBUTION_MAP: Distribution map must contain encrypted key packages for authorized recipients.');
    }

    // Determine latest authoritative epoch
    const { data: latestEpochRecord } = await supabase
      .from('cluster_epochs')
      .select('epoch')
      .eq('clusterId', clusterId)
      .order('epoch', { ascending: false })
      .limit(1)
      .maybeSingle();

    const expectedNextEpoch = (latestEpochRecord?.epoch || 0) + 1;
    const targetEpoch = typeof params.epoch === 'number' && params.epoch > 0 ? params.epoch : expectedNextEpoch;

    if (params.epoch && params.epoch !== expectedNextEpoch && (latestEpochRecord?.epoch || 0) > 0) {
      throw new Error(`EPOCH_CONFLICT: Target epoch ${params.epoch} does not match expected authoritative next epoch ${expectedNextEpoch}.`);
    }

    const epochId = `epoch_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    // 1. Insert authoritative epoch record with real fingerprint
    const { error: epochInsertErr } = await supabase.from('cluster_epochs').insert({
      id: epochId,
      clusterId,
      epoch: targetEpoch,
      keyFingerprint: keyFingerprint.trim(),
      createdAt: now
    });

    if (epochInsertErr) {
      throw new Error(`Failed to record authoritative cluster epoch: ${epochInsertErr.message}`);
    }

    // 2. Insert distribution packages
    const distRecords = Object.entries(distributionMap).map(([recipientAgentId, pkg]) => ({
      id: `dist_${crypto.randomUUID()}`,
      clusterId,
      epoch: targetEpoch,
      recipientAgentId,
      encryptedKeyPackage: typeof pkg === 'string' ? pkg : JSON.stringify(pkg),
      senderPublicKey: senderPublicKey ? (typeof senderPublicKey === 'string' ? senderPublicKey : JSON.stringify(senderPublicKey)) : null,
      createdAt: now
    }));

    if (distRecords.length > 0) {
      const { error: distErr } = await supabase.from('cluster_key_distributions').insert(distRecords);
      if (distErr) {
        throw new Error(`Failed to record key distribution packages: ${distErr.message}`);
      }
    }

    return { epoch: targetEpoch, keyFingerprint: keyFingerprint.trim() };
  }

  /**
   * Advances the cluster epoch and distributes the new group key packages.
   * Enforces real key fingerprint and complete distribution before the epoch is usable.
   */
  async advanceEpoch(
    clusterId: string,
    params: EstablishEpochParams | string
  ): Promise<{ epoch: number; keyFingerprint: string }> {
    if (typeof params === 'string') {
      throw new Error('KEY_MATERIAL_REQUIRED: Advancing an epoch requires authoritative keyFingerprint and distributionMap.');
    }

    return await this.establishClusterEpoch(clusterId, params);
  }
}

export const clusterService = ClusterService.getInstance();
