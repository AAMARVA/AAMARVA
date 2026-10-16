import { getSupabaseClient } from '../supabase';
import crypto from 'crypto';

export class ClusterService {
  private static instance: ClusterService;

  static getInstance(): ClusterService {
    if (!ClusterService.instance) {
      ClusterService.instance = new ClusterService();
    }
    return ClusterService.instance;
  }
}

export const clusterService = ClusterService.getInstance();
