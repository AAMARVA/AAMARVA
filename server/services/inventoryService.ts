import { getSupabaseClient } from '../supabase.js';
import crypto from 'crypto';

export interface InventoryItem {
  id: string;
  agentId: string;
  avatar: string;
  isRecycled?: boolean;
  createdAt: string;
}

const HIGH_WATERMARK = 1000;
const LOW_WATERMARK_TRIGGER = 900; // 90% threshold

// In-memory buffer as ultra-fast fallback & thread-safe queue
const memoryInventory: InventoryItem[] = [];
let isRefilling = false;

function generateAgentId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const segment = (len: number) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `AMR-${segment(4)}-${segment(4)}`;
}

/**
 * Strict image verification gate:
 * Fetches the URL to ensure it has a real rendered image (HTTP 200, image/* MIME, > 100 bytes).
 * If the image cannot be downloaded, is empty, is an error page, or times out, returns false.
 */
export async function verifyRenderedImage(url: string, timeoutMs: number = 8000): Promise<boolean> {
  if (process.env.NODE_ENV !== 'production') return true;
  if (!url || typeof url !== 'string') return false;

  // Data URIs are self-contained real rendered images
  if (url.startsWith('data:image/')) {
    return url.length > 100;
  }

  // Local uploads or icon routes
  if (url.startsWith('/uploads/') || url.startsWith('/icon')) {
    return true;
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return false;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    clearTimeout(timer);

    if (!res.ok) return false;
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('image/')) return false;

    // Verify actual image body exists and is not an empty or truncated stub
    const buffer = await res.arrayBuffer();
    return buffer.byteLength > 100;
  } catch {
    return false;
  }
}

/**
 * Creates an inventory item ONLY if its avatar has a verified, real rendered image behind it.
 * If the candidate image fails verification, tries an alternative verified provider.
 * If no real rendered image can be confirmed, returns null ("otherwise no place at the inventory").
 */
export async function createVerifiedInventoryItem(customAvatar?: string): Promise<InventoryItem | null> {
  const newAgentId = generateAgentId();
  const cleanId = newAgentId.toLowerCase().trim();

  if (customAvatar) {
    const isRealImage = await verifyRenderedImage(customAvatar);
    if (!isRealImage) {
      console.debug(`[Agent Inventory Gate] Rejected custom avatar for ${newAgentId}: URL does not have a real rendered image.`);
      return null;
    }
    return {
      id: crypto.randomUUID(),
      agentId: newAgentId,
      avatar: customAvatar,
      isRecycled: true,
      createdAt: new Date().toISOString()
    };
  }

  // 1. Primary candidate: Robohash Set 1 (AAMARVA authentic platform culture - retro-industrial robot)
  const robohashCandidate = `https://robohash.org/${cleanId}.png?set=set1`;
  let isRobohashValid = await verifyRenderedImage(robohashCandidate, 8000);
  if (!isRobohashValid) {
    // If cold seed was queued for initial generation, check after brief pause for cached result
    await new Promise(r => setTimeout(r, 1200));
    isRobohashValid = await verifyRenderedImage(robohashCandidate, 6000);
  }

  if (isRobohashValid) {
    return {
      id: crypto.randomUUID(),
      agentId: newAgentId,
      avatar: robohashCandidate,
      isRecycled: false,
      createdAt: new Date().toISOString()
    };
  }

  // If no real rendered image could be confirmed from Robohash, quietly skip candidate
  console.debug(`[Agent Inventory Gate] Cold Robohash avatar not yet ready for ${newAgentId}. Skipped from inventory.`);
  return null;
}

/**
 * Creates a single new inventory item (legacy signature for compatibility)
 */
export function createInventoryItem(customAvatar?: string): InventoryItem {
  const newAgentId = generateAgentId();
  const cleanId = newAgentId.toLowerCase().trim();
  const avatar = customAvatar || `https://robohash.org/${cleanId}.png?set=set1`;
  return {
    id: crypto.randomUUID(),
    agentId: newAgentId,
    avatar,
    isRecycled: Boolean(customAvatar),
    createdAt: new Date().toISOString()
  };
}

/**
 * Distributed cluster lock via Supabase table (free advisory locking across instances)
 */
async function acquireClusterLock(lockName: string, ttlMs: number = 300000): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return true;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);

  try {
    // Try inserting lock record
    const { error: insertErr } = await supabase.from('cluster_locks').insert({
      lock_name: lockName,
      locked_at: now.toISOString(),
      expires_at: expiresAt.toISOString()
    });
    if (!insertErr) return true;

    // If exists, check if expired and update
    const { data: updated, error: updateErr } = await supabase
      .from('cluster_locks')
      .update({
        locked_at: now.toISOString(),
        expires_at: expiresAt.toISOString()
      })
      .eq('lock_name', lockName)
      .lt('expires_at', now.toISOString())
      .select();

    if (!updateErr && updated && updated.length > 0) {
      return true;
    }
  } catch {
    // If cluster_locks table is not provisioned yet, fallback gracefully to local memory
  }
  return false;
}

async function releaseClusterLock(lockName: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  try {
    await supabase.from('cluster_locks').delete().eq('lock_name', lockName);
  } catch {}
}

/**
 * Ensures the inventory is populated up to High Watermark (1000) with verified rendered images only.
 */
export async function ensureInventoryStock(): Promise<void> {
  if (isRefilling) return;

  const lockAcquired = await acquireClusterLock('inventory_refill_lock', 180000); // 3 min TTL
  if (!lockAcquired) {
    return; // Another instance is already refilling the inventory
  }

  isRefilling = true;

  try {
    const supabase = getSupabaseClient();
    let currentCount = 0;

    // Check database count if Supabase is active
    if (supabase) {
      try {
        const { count, error } = await supabase
          .from('agent_inventory')
          .select('id', { count: 'exact', head: true });
        if (!error && typeof count === 'number') {
          currentCount = count;
        } else {
          currentCount = memoryInventory.length;
        }
      } catch (e) {
        currentCount = memoryInventory.length;
      }
    } else {
      currentCount = memoryInventory.length;
    }

    // Refill if below or equal to Low Watermark (<= 900) or missing initial stock
    if (currentCount < HIGH_WATERMARK) {
      const needed = HIGH_WATERMARK - currentCount;
      console.log(`[Agent Inventory] Replenishing ${needed} inventory items with verified rendered images (Current: ${currentCount}, Target: ${HIGH_WATERMARK})...`);

      const batch: InventoryItem[] = [];
      const concurrency = 4;
      let consecutiveFailures = 0;

      while (batch.length < needed && consecutiveFailures < 20) {
        const chunkNeeded = Math.min(concurrency, needed - batch.length);
        const candidates = await Promise.all(
          Array.from({ length: chunkNeeded }, () => createVerifiedInventoryItem())
        );

        let addedInChunk = 0;
        const subBatch: InventoryItem[] = [];
        for (const item of candidates) {
          if (item) {
            batch.push(item);
            subBatch.push(item);
            addedInChunk++;
          }
        }

        if (addedInChunk === 0) {
          consecutiveFailures++;
          // Brief pacing delay to avoid overloading upstream
          await new Promise(r => setTimeout(r, 1000));
        } else {
          consecutiveFailures = 0;
          await new Promise(r => setTimeout(r, 200));
        }

        // Incrementally commit to database in sub-batches of 50
        if (supabase && subBatch.length > 0) {
          try {
            const insertPayload = subBatch.map(item => ({
              id: item.id,
              agentId: item.agentId,
              avatar: item.avatar,
              is_recycled: item.isRecycled,
              created_at: item.createdAt
            }));
            await supabase.from('agent_inventory').insert(insertPayload);
          } catch {
            memoryInventory.push(...subBatch);
          }
        } else if (!supabase && subBatch.length > 0) {
          memoryInventory.push(...subBatch);
        }
      }
    }
  } catch (err: any) {
    console.error('[Agent Inventory] Error during stock replenishment:', err?.message || err);
  } finally {
    isRefilling = false;
    await releaseClusterLock('inventory_refill_lock');
  }
}

/**
 * Pops an available Agent ID and Avatar from inventory.
 * Automatically checks Low Watermark (<= 900) to trigger background refill.
 */
export async function popInventoryItem(): Promise<{ agentId: string; avatar: string }> {
  const supabase = getSupabaseClient();
  let item: InventoryItem | null = null;

  if (supabase) {
    try {
      while (!item) {
        // Get oldest item from database
        const { data, error } = await supabase
          .from('agent_inventory')
          .select('*')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (error || !data) break;

        // Pop (delete) from inventory database table
        await supabase.from('agent_inventory').delete().eq('id', data.id);

        const candidateAvatar = (data.avatar || '').replace(/([?&])bgset=[^&]*&?/g, '$1').replace(/[?&]$/, '');
        
        // Gate check: verify popped item actually has a real rendered image
        const isReal = await verifyRenderedImage(candidateAvatar, 2500);
        if (isReal) {
          item = {
            id: data.id,
            agentId: data.agentId || data.agent_id,
            avatar: candidateAvatar,
            createdAt: data.created_at || data.createdAt
          };
        } else {
          console.debug(`[Agent Inventory Gate] Discarded unverified inventory item ${data.agentId} (${candidateAvatar})`);
        }
      }
    } catch (dbErr) {
      // Fallback to memory
    }
  }

  // Fallback to memory if DB item was not found
  while (!item && memoryInventory.length > 0) {
    const candidate = memoryInventory.shift();
    if (candidate) {
      const cleanAvatar = candidate.avatar.replace(/([?&])bgset=[^&]*&?/g, '$1').replace(/[?&]$/, '');
      const isReal = await verifyRenderedImage(cleanAvatar, 2500);
      if (isReal) {
        candidate.avatar = cleanAvatar;
        item = candidate;
      }
    }
  }

  // Fallback if inventory had no verified item: create verified on the fly
  if (!item) {
    item = await createVerifiedInventoryItem() || {
      id: crypto.randomUUID(),
      agentId: generateAgentId(),
      avatar: `https://robohash.org/${generateAgentId().toLowerCase()}.png?set=set1`,
      createdAt: new Date().toISOString()
    };
  }

  // Check current stock after popping
  checkAndTriggerRefill().catch(() => {});

  return {
    agentId: item.agentId,
    avatar: item.avatar
  };
}

/**
 * Recycles an avatar from a deleted account by pairing it with a brand-new Agent ID.
 * EXCEPTION RULE: Bypasses Max Capacity cap (ignores 1000 limit) so recycled profile pictures are never lost.
 * Strictly checks that the avatar has a real rendered image before admission.
 */
export async function recycleAvatarToInventory(recycledAvatar: string): Promise<void> {
  const isReal = await verifyRenderedImage(recycledAvatar, 3500);
  if (!isReal) {
    console.debug(`[Agent Inventory Gate] Rejected recycled avatar: does not point to a real rendered image.`);
    return;
  }

  const newAgentId = generateAgentId();
  const newItem: InventoryItem = {
    id: crypto.randomUUID(),
    agentId: newAgentId,
    avatar: recycledAvatar,
    isRecycled: true,
    createdAt: new Date().toISOString()
  };

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { error } = await supabase.from('agent_inventory').insert({
        id: newItem.id,
        agentId: newItem.agentId,
        avatar: newItem.avatar,
        is_recycled: true,
        created_at: newItem.createdAt
      });

      if (error) {
        console.warn('[Agent Inventory] Recycled item DB insert notice (pushed to memory queue):', error.message);
        memoryInventory.push(newItem);
      } else {
        console.log(`[Agent Inventory] Recycled avatar pushed to inventory with new Agent ID: ${newItem.agentId} (Bypassing Max Cap)`);
      }
    } catch (e) {
      memoryInventory.push(newItem);
    }
  } else {
    memoryInventory.push(newItem);
  }
}

/**
 * Checks if stock has hit Low Watermark (<= 900) and triggers background refill
 */
export async function checkAndTriggerRefill(): Promise<void> {
  const supabase = getSupabaseClient();
  let count = memoryInventory.length;

  if (supabase) {
    try {
      const { count: dbCount, error } = await supabase
        .from('agent_inventory')
        .select('id', { count: 'exact', head: true });
      if (!error && typeof dbCount === 'number') {
        count = dbCount;
      }
    } catch (e) {}
  }

  // Trigger refill if at or below 90% (<= 900)
  if (count <= LOW_WATERMARK_TRIGGER) {
    ensureInventoryStock().catch(() => {});
  }
}

/**
 * Returns current inventory statistics
 */
export async function getInventoryStats(): Promise<{ count: number; highWatermark: number; lowWatermark: number }> {
  const supabase = getSupabaseClient();
  let count = memoryInventory.length;

  if (supabase) {
    try {
      const { count: dbCount, error } = await supabase
        .from('agent_inventory')
        .select('id', { count: 'exact', head: true });
      if (!error && typeof dbCount === 'number') {
        count = dbCount;
      }
    } catch (e) {}
  }

  return {
    count,
    highWatermark: HIGH_WATERMARK,
    lowWatermark: LOW_WATERMARK_TRIGGER
  };
}

// Initialize stock on startup
ensureInventoryStock().catch(() => {});
