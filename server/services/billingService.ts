import { MasterAccountService } from './masterAccountService.js';

/**
 * BillingEntitlementService:
 * Decoupled entitlement layer for managing Master Account plan states and account status lifecycle.
 * Future payment gateways (Stripe, Razorpay, etc.) will call this service to apply purchases.
 */
export class BillingEntitlementService {
  private static instance: BillingEntitlementService;

  public static getInstance(): BillingEntitlementService {
    if (!BillingEntitlementService.instance) {
      BillingEntitlementService.instance = new BillingEntitlementService();
    }
    return BillingEntitlementService.instance;
  }

  /**
   * Expire a Master plan:
   * Sets plan_status to 'EXPIRED' and freezes all associated active managed Slaves with 'plan_expired' status reason.
   * Primary Master user identity is NEVER frozen by plan expiry.
   */
  public async expireMasterPlan(masterId: string): Promise<void> {
    const masterService = MasterAccountService.getInstance();

    // 1. Update Master Account Plan Status
    await masterService.updateMasterAccount(masterId, {
      plan_status: 'EXPIRED'
    });

    // 2. Fetch all managed Slaves that belong to this Master
    const managedSlaves = await masterService.getManagedSlavesForMaster(masterId);

    // 3. Freeze only active Slaves, excluding the Master primary user and already suspended/deleted accounts
    for (const slave of managedSlaves) {
      if (slave.status === 'active') {
        await masterService.updateUserStatus(slave.id, 'frozen', 'plan_expired');
      }
    }
  }

  /**
   * Renew a Master plan:
   * Sets plan_status to 'ACTIVE', updates plan expiration time, and unfreezes accounts specifically frozen due to plan expiration.
   * CRITICAL: Reactivates ONLY Slaves where status = 'frozen' AND status_reason = 'plan_expired'.
   * Accounts frozen due to 'security_action' or marked 'deleted' must remain frozen/deleted.
   */
  public async renewMasterPlan(
    masterId: string,
    durationDays: number,
    accountLimit?: number
  ): Promise<{ planStatus: string; expiresAt: string; accountLimit: number }> {
    const masterService = MasterAccountService.getInstance();
    const expiresAtDate = new Date();
    expiresAtDate.setDate(expiresAtDate.getDate() + durationDays);
    const expiresAt = expiresAtDate.toISOString();

    const updates: Record<string, any> = {
      plan_status: 'ACTIVE',
      plan_expires_at: expiresAt,
      plan_started_at: new Date().toISOString()
    };

    if (accountLimit !== undefined && accountLimit !== null) {
      updates.account_limit = accountLimit;
    }

    // 1. Update Master Account Plan Metadata
    await masterService.updateMasterAccount(masterId, updates);

    const masterAccount = await masterService.getMasterAccount(masterId);
    const limitToUse = masterAccount?.account_limit || accountLimit || 10;

    // 2. Fetch managed Slaves belonging to this Master
    const managedSlaves = await masterService.getManagedSlavesForMaster(masterId);

    // 3. Reactivate ONLY accounts frozen due to 'plan_expired' (Section 9 Requirement)
    for (const slave of managedSlaves) {
      if (slave.status === 'frozen' && slave.status_reason === 'plan_expired') {
        await masterService.updateUserStatus(slave.id, 'active', null);
      }
    }

    return {
      planStatus: 'ACTIVE',
      expiresAt,
      accountLimit: limitToUse
    };
  }
}
