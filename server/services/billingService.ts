export class BillingEntitlementService {
  private static instance: BillingEntitlementService;

  public static getInstance(): BillingEntitlementService {
    if (!BillingEntitlementService.instance) {
      BillingEntitlementService.instance = new BillingEntitlementService();
    }
    return BillingEntitlementService.instance;
  }

  public async expireMasterPlan(masterId: string): Promise<void> {
    if (!masterId) return;
    try {
      const { getSupabaseClient } = await import('../supabase.js');
      const sb = getSupabaseClient();
      await sb
        .from('master_plan_entitlements')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('master_account_id', masterId);
      const { MasterAccountService } = await import('./masterAccountService.js');
      MasterAccountService.getInstance().invalidateMasterPlanCache(masterId);
    } catch (e) {
      console.warn('[BillingEntitlementService] Error expiring master plan:', e);
    }
  }
}
