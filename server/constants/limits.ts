export interface ClusterQuota {
  burstLimit: number;
  monthlyQuota: number;
  dailyPacing: number;
  windowMs: number;
}

export interface PlanLimits {
  activeClusters: number;
  endpoints: Record<string, ClusterQuota>;
}

export const FREE_PLAN_LIMITS: PlanLimits = {
  activeClusters: 1,
  endpoints: {
    'cluster_create': {
      burstLimit: 3,
      monthlyQuota: 3,
      dailyPacing: 1, // Approximately 1 per 10 days, but we'll set it to 1 to be safe
      windowMs: 60 * 60 * 1000 // 1 hour
    },
    'cluster_list': {
      burstLimit: 60,
      monthlyQuota: 10000,
      dailyPacing: 333,
      windowMs: 60 * 1000 // 1 minute
    },
    'cluster_invite_me_list': {
      burstLimit: 30,
      monthlyQuota: 3000,
      dailyPacing: 100,
      windowMs: 60 * 1000
    },
    'cluster_get': {
      burstLimit: 60,
      monthlyQuota: 10000,
      dailyPacing: 333,
      windowMs: 60 * 1000
    },
    'cluster_update': {
      burstLimit: 10,
      monthlyQuota: 300,
      dailyPacing: 10,
      windowMs: 60 * 1000
    },
    'cluster_delete': {
      burstLimit: 3,
      monthlyQuota: 30,
      dailyPacing: 1,
      windowMs: 60 * 60 * 1000
    },
    'cluster_invite_create': {
      burstLimit: 10,
      monthlyQuota: 300,
      dailyPacing: 10,
      windowMs: 60 * 1000
    },
    'cluster_invite_list': {
      burstLimit: 30,
      monthlyQuota: 3000,
      dailyPacing: 100,
      windowMs: 60 * 1000
    },
    'cluster_invite_revoke': {
      burstLimit: 10,
      monthlyQuota: 300,
      dailyPacing: 10,
      windowMs: 60 * 1000
    },
    'cluster_join': {
      burstLimit: 5,
      monthlyQuota: 100,
      dailyPacing: 3,
      windowMs: 60 * 60 * 1000
    },
    'cluster_member_role_update': {
      burstLimit: 10,
      monthlyQuota: 300,
      dailyPacing: 10,
      windowMs: 60 * 1000
    },
    'cluster_message_create': {
      burstLimit: 30,
      monthlyQuota: 3000,
      dailyPacing: 100,
      windowMs: 60 * 1000
    },
    'cluster_message_list': {
      burstLimit: 120,
      monthlyQuota: 30000,
      dailyPacing: 1000,
      windowMs: 60 * 1000
    },
    'cluster_member_kick': {
      burstLimit: 10,
      monthlyQuota: 300,
      dailyPacing: 10,
      windowMs: 60 * 1000
    },
    'cluster_leave': {
      burstLimit: 5,
      monthlyQuota: 100,
      dailyPacing: 3,
      windowMs: 60 * 60 * 1000
    },
    'public_cluster_recent': {
      burstLimit: 60,
      monthlyQuota: 30000,
      dailyPacing: 1000,
      windowMs: 60 * 1000
    },
    'public_cluster_members': {
      burstLimit: 60,
      monthlyQuota: 30000,
      dailyPacing: 1000,
      windowMs: 60 * 1000
    }
  }
};
