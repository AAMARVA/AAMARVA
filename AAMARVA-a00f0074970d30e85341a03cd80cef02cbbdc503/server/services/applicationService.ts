import fs from 'fs';
import path from 'path';
import { getSupabaseClient, isSupabaseConfigured } from '../supabase';
import { sendApplicationUnderReviewEmail, sendAdminOtpEmail } from '../emailService';

export interface ApplicationRecord {
  id: string;
  fullName: string;
  emailAddress: string;
  githubProfile: string;
  linkedinProfile: string;
  xProfile?: string;
  redditProfile?: string;
  bestDescribes: string;
  operatingAgent: string;
  agentName: string;
  agentUrl: string;
  agentDetails: string;
  agentStage: string;
  agentFrameworks: string[];
  agentOperateLocation: string;
  devEnvironment: string;
  devEnvironmentOther: string;
  languages: string[];
  languagesOther: string;
  modelProviders: string[];
  modelProvidersOther: string;
  usesExternalTools: string;
  communicatesWithAgents: string;
  communicationDetails: string;
  hopeToAccomplish: string;
  agentUsePurpose: string;
  discoverCapability: string;
  discoveryProblems: string;
  contributions: string[];
  contributionsOther: string;
  first30Days: string;
  additionalNotes: string;
  createdAt: string;
  status?: 'Under Review' | 'Approved' | 'Declined';
}

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const FILE_PATH = path.join(DATA_DIR, 'applications.json');

// In-memory caching/store
let applicationsCache: ApplicationRecord[] = [];
let failedAttemptsMap: Record<string, number> = {}; // IP -> timestamp of block expiration
let activeOtp: { code: string; expiresAt: number } | null = null;

// Initialize and load from local file
function initLocalStore() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(FILE_PATH)) {
      const raw = fs.readFileSync(FILE_PATH, 'utf-8');
      applicationsCache = JSON.parse(raw);
    }
  } catch (err) {
    console.error('[APPLICATION_SERVICE] Failed to initialize file-backed storage:', err);
  }
}
initLocalStore();

function saveToLocalStore() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(FILE_PATH, JSON.stringify(applicationsCache, null, 2), 'utf-8');
  } catch (err) {
    console.error('[APPLICATION_SERVICE] Failed to write to file-backed storage:', err);
  }
}

export const applicationService = {
  /**
   * Save a newly submitted application
   */
  async saveApplication(data: Omit<ApplicationRecord, 'id' | 'createdAt'>): Promise<ApplicationRecord> {
    const emailToValidate = (data.emailAddress || '').trim().toLowerCase();

    // 0. Enforce one-application rule: An email cannot apply twice until rejected!
    const existingList = await this.getApplications();
    const applicationsForEmail = existingList.filter(
      app => (app.emailAddress || '').trim().toLowerCase() === emailToValidate
    );

    // If an application for this email is currently pending (Under Review), block re-submission
    const activePending = applicationsForEmail.find(
      app => !app.status || app.status === 'Under Review'
    );
    if (activePending) {
      const error: any = new Error(
        'An application with this email address is already under review. You cannot submit another application until your current intake has been processed.'
      );
      error.statusCode = 409;
      throw error;
    }

    // If already approved, block re-submission
    const approvedApp = applicationsForEmail.find(app => app.status === 'Approved');
    if (approvedApp) {
      const error: any = new Error(
        'This email address has already been approved and whitelisted for registration. You do not need to apply again.'
      );
      error.statusCode = 409;
      throw error;
    }

    const record: ApplicationRecord = {
      ...data,
      id: `app_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      status: 'Under Review',
    };

    // 1. Push to in-memory Cache and Save to Local JSON Backup
    applicationsCache.push(record);
    saveToLocalStore();

    // 2. Save to Supabase (if available)
    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        // Safe backward-compatible serialization for custom social profiles
        let socialNotes = '';
        if (record.xProfile) socialNotes += `\n[X (Twitter): ${record.xProfile}]`;
        if (record.redditProfile) socialNotes += `\n[Reddit: ${record.redditProfile}]`;
        
        const { error } = await supabase.from('applications').insert({
          id: record.id,
          full_name: record.fullName,
          email_address: record.emailAddress,
          github_profile: record.githubProfile,
          linkedin_profile: record.linkedinProfile,
          x_profile: record.xProfile || null,
          reddit_profile: record.redditProfile || null,
          status: record.status || 'Under Review',
          best_describes: record.bestDescribes,
          operating_agent: record.operatingAgent,
          agent_name: record.agentName,
          agent_url: record.agentUrl,
          agent_details: record.agentDetails,
          agent_stage: record.agentStage,
          agent_frameworks: record.agentFrameworks,
          agent_operate_location: record.agentOperateLocation,
          dev_environment: record.devEnvironment,
          dev_environment_other: record.devEnvironmentOther,
          languages: record.languages,
          languages_other: record.languagesOther,
          model_providers: record.modelProviders,
          model_providers_other: record.modelProvidersOther,
          uses_external_tools: record.usesExternalTools,
          communicates_with_agents: record.communicatesWithAgents,
          communication_details: record.communicationDetails,
          hope_to_accomplish: record.hopeToAccomplish,
          agent_use_purpose: record.agentUsePurpose,
          discover_capability: record.discoverCapability,
          discovery_problems: record.discoveryProblems,
          contributions: record.contributions,
          contributions_other: record.contributionsOther,
          first_30_days: record.first30Days,
          additional_notes: record.additionalNotes + socialNotes,
          created_at: record.createdAt,
        });

        if (error) {
          console.warn('[APPLICATION_SERVICE] Notice inserting into Supabase applications table:', error.message);
        } else {
          console.log('[APPLICATION_SERVICE] Successfully written application into Supabase!');
        }
      }
    } catch (dbErr: any) {
      console.warn('[APPLICATION_SERVICE] Supabase connection is not initialized or errored. Using local fallback. Notice:', dbErr?.message || dbErr);
    }

    // 3. Dispatch receipt email
    await sendApplicationUnderReviewEmail(record.emailAddress, record.fullName, record.agentName);

    return record;
  },

  /**
   * Retrieve all applications
   */
  async getApplications(): Promise<ApplicationRecord[]> {
    let dbApps: ApplicationRecord[] = [];
    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        const { data, error } = await supabase
          .from('applications')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && data) {
          dbApps = data.map((item: any) => {
            const cached = applicationsCache.find(c => c.id === item.id);
            return {
              id: item.id,
              fullName: item.full_name || item.fullName,
              emailAddress: item.email_address || item.emailAddress,
              githubProfile: item.github_profile || item.githubProfile,
              linkedinProfile: item.linkedin_profile || item.linkedinProfile,
              xProfile: cached?.xProfile || item.x_profile || item.xProfile || '',
              redditProfile: cached?.redditProfile || item.reddit_profile || item.redditProfile || '',
              bestDescribes: item.best_describes || item.bestDescribes,
              operatingAgent: item.operating_agent || item.operatingAgent,
              agentName: item.agent_name || item.agentName,
              agentUrl: item.agent_url || item.agentUrl,
              agentDetails: item.agent_details || item.agentDetails,
              agentStage: item.agent_stage || item.agentStage,
              agentFrameworks: item.agent_frameworks || item.agentFrameworks || [],
              agentOperateLocation: item.agent_operate_location || item.agentOperateLocation,
              devEnvironment: item.dev_environment || item.devEnvironment,
              devEnvironmentOther: item.dev_environment_other || item.devEnvironmentOther,
              languages: item.languages || [],
              languagesOther: item.languages_other || item.languagesOther,
              modelProviders: item.model_providers || item.modelProviders || [],
              modelProvidersOther: item.model_providers_other || item.modelProvidersOther,
              usesExternalTools: item.uses_external_tools || item.usesExternalTools,
              communicatesWithAgents: item.communicates_with_agents || item.communicatesWithAgents,
              communicationDetails: item.communication_details || item.communicationDetails,
              hopeToAccomplish: item.hope_to_accomplish || item.hopeToAccomplish,
              agentUsePurpose: item.agent_use_purpose || item.agentUsePurpose,
              discoverCapability: item.discover_capability || item.discoverCapability,
              discoveryProblems: item.discovery_problems || item.discoveryProblems,
              contributions: item.contributions || [],
              contributionsOther: item.contributions_other || item.contributionsOther,
              first30Days: item.first_30_days || item.first30Days,
              additionalNotes: item.additional_notes || item.additionalNotes,
              createdAt: item.created_at || item.createdAt,
              status: cached?.status || item.status || 'Under Review',
            };
          });
        }
      }
    } catch (err) {
      console.warn('[APPLICATION_SERVICE] Supabase fetch error:', err);
    }

    if (dbApps.length > 0 || isSupabaseConfigured()) {
      applicationsCache = [...dbApps];
      saveToLocalStore();
      return dbApps;
    }

    return applicationsCache.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  /**
   * Check if an IP address is blocked from more admin attempts for the day
   */
  checkAdminAttempt(ip: string): boolean {
    const blockUntil = failedAttemptsMap[ip];
    if (blockUntil && blockUntil > Date.now()) {
      return false; // Blocked
    }
    return true; // Allowed
  },

  /**
   * Record a failed admin attempt and block the IP for 24 hours
   */
  recordFailedAdminAttempt(ip: string): void {
    const oneDayMs = 24 * 60 * 60 * 1000;
    failedAttemptsMap[ip] = Date.now() + oneDayMs;
  },

  /**
   * Reset block for an IP address (helpful for operators / devs)
   */
  resetAdminAttempts(ip: string): void {
    delete failedAttemptsMap[ip];
  },

  /**
   * Generate an OTP and email it to founder@aamarva.com
   */
  async generateAndSendOtp(): Promise<void> {
    // Generate a secure random 6-digit passcode
    const num = Math.floor(100000 + Math.random() * 900000);
    const code = String(num);
    const expiresAt = Date.now() + 5 * 60 * 1000; // valid for 5 minutes

    activeOtp = { code, expiresAt };

    // Send the OTP email to founder@aamarva.com
    await sendAdminOtpEmail(code);
  },

  /**
   * Retrieve the current active OTP code (for local UI bypass/confirmation option)
   */
  getActiveOtp(): string | null {
    if (activeOtp && activeOtp.expiresAt > Date.now()) {
      return activeOtp.code;
    }
    return null;
  },

  /**
   * Verify the provided OTP code
   */
  verifyOtp(code: string): boolean {
    if (!activeOtp) return false;
    if (activeOtp.expiresAt < Date.now()) {
      activeOtp = null; // Expired
      return false;
    }
    if (activeOtp.code === code.trim()) {
      activeOtp = null; // Clear on successful use
      return true;
    }
    return false;
  },

  /**
   * Retrieve the entire whitelist from Supabase registration_whitelist
   */
  async getWhitelist(): Promise<string[]> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('registration_whitelist')
      .select('email')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[WHITELIST_SERVICE] Error fetching whitelist from Supabase:', error);
      throw new Error(`Database error fetching registration whitelist: ${error.message}`);
    }

    return (data || [])
      .map((r: any) => (r.email || '').trim().toLowerCase())
      .filter(Boolean);
  },

  /**
   * Check if an email is whitelisted in Supabase registration_whitelist (authoritative)
   */
  async isEmailWhitelisted(email: string): Promise<boolean> {
    if (!email || typeof email !== 'string') return false;
    const clean = email.toLowerCase().trim();
    if (!clean) return false;

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('registration_whitelist')
      .select('id, email')
      .ilike('email', clean)
      .limit(1);

    if (error) {
      console.error('[WHITELIST_SERVICE] Database error during registration whitelist check:', error);
      throw new Error(`Database error verifying whitelist status: ${error.message}`);
    }

    return Array.isArray(data) && data.length > 0;
  },

  /**
   * Add email to whitelist and persist to Supabase registration_whitelist
   */
  async addEmailToWhitelist(email: string): Promise<void> {
    if (!email || typeof email !== 'string') {
      throw new Error('Valid email address is required.');
    }
    const clean = email.toLowerCase().trim();
    if (!clean || !clean.includes('@')) {
      throw new Error('Please enter a valid email address.');
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('registration_whitelist')
      .upsert({ email: clean }, { onConflict: 'email' });

    if (error && error.code !== '23505') {
      console.error('[WHITELIST_SERVICE] Supabase registration_whitelist write error:', error);
      throw new Error(`Database error: Failed to whitelist email (${error.message})`);
    }

    console.log(`[WHITELIST_SERVICE] Successfully persisted ${clean} to Supabase registration_whitelist.`);
  },

  /**
   * Remove email from whitelist and persist to Supabase registration_whitelist
   */
  async removeEmailFromWhitelist(email: string): Promise<void> {
    if (!email || typeof email !== 'string') return;
    const clean = email.toLowerCase().trim();
    if (!clean) return;

    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('registration_whitelist')
      .delete()
      .ilike('email', clean);

    if (error) {
      console.error('[WHITELIST_SERVICE] Supabase registration_whitelist delete error:', error);
      throw new Error(`Database error: Failed to remove email from registration whitelist (${error.message})`);
    }

    console.log(`[WHITELIST_SERVICE] Successfully deleted ${clean} from Supabase registration_whitelist.`);
  },

  /**
   * Update the status of a specific application
   */
  async updateApplicationStatus(id: string, status: 'Under Review' | 'Approved' | 'Declined'): Promise<void> {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { error } = await supabase
        .from('applications')
        .update({ status })
        .eq('id', id);

      if (error) {
        console.error('[APPLICATION_SERVICE] Supabase status update error:', error);
        throw new Error(`Database error: Failed to update application status (${error.message})`);
      }
    }

    const app = applicationsCache.find(a => a.id === id);
    if (app) {
      app.status = status;
      saveToLocalStore();
    }
  }
};
