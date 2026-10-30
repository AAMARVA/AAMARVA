import {
  buildClusterMessageCacheKey,
  getScopedClusterDecryptedMessage,
  cacheScopedClusterDecryptedMessage,
  reconcileClusterMessages,
  purgeStaleClusterCacheEntries,
  clearAllDecryptedMessageCache,
  getCachedDecryptedMessage,
  cacheDecryptedMessage,
  ReconcilableClusterMessage
} from '../../src/lib/decryptedMessageStore';
import {
  generateClusterGroupKey,
  encryptClusterMessage,
  decryptClusterMessage
} from '../../src/lib/clusterCrypto';

export async function runClusterMessageIdentityTests(): Promise<Record<string, { status: 'PASSED' | 'FAILED'; reason?: string }>> {
  console.log('\n=== AAMARVA CLUSTER MESSAGE IDENTITY & CACHE ISOLATION REGRESSION SUITE ===\n');
  const results: Record<string, { status: 'PASSED' | 'FAILED'; reason?: string }> = {};

  const recordResult = (id: string, success: boolean, reason?: string) => {
    results[id] = { status: success ? 'PASSED' : 'FAILED', reason };
    console.log(`[${success ? 'PASSED' : 'FAILED'}] ${id}${reason ? `: ${reason}` : ''}`);
  };

  // Setup mock localStorage & sessionStorage if running in Node environment
  const makeStorageMock = () => {
    const map = new Map<string, string>();
    return {
      get length() {
        return map.size;
      },
      key(idx: number) {
        return Array.from(map.keys())[idx] ?? null;
      },
      getItem(k: string) {
        return map.has(k) ? map.get(k)! : null;
      },
      setItem(k: string, v: string) {
        map.set(k, String(v));
      },
      removeItem(k: string) {
        map.delete(k);
      },
      clear() {
        map.clear();
      }
    };
  };

  const g = globalThis as any;
  if (!g.localStorage) {
    g.localStorage = makeStorageMock();
  }
  if (!g.sessionStorage) {
    g.sessionStorage = makeStorageMock();
  }

  try {
    clearAllDecryptedMessageCache();

    const groupKeyObj = await generateClusterGroupKey();
    const clusterA = 'cluster_alpha_001';
    const clusterB = 'cluster_beta_002';
    const account1 = 'user_master_001';
    const account2 = 'user_master_002';
    const sender1 = 'AMR-SLAVE-01';
    const sender2 = 'AMR-SLAVE-02';
    const senderMaster = 'AMR-MASTER-01';

    // Helper simulating ClusterChatModal's fetchDetails message decryption + cache pipeline
    const processServerMessages = async (
      rawServerMessages: any[],
      ctx: { accountId: string; clusterId: string; groupKey: CryptoKey | null },
      prevState: ReconcilableClusterMessage[] = [],
      pendingOptimisticToServerId?: Map<string, string>
    ): Promise<ReconcilableClusterMessage[]> => {
      const decryptedList: ReconcilableClusterMessage[] = await Promise.all(
        rawServerMessages.map(async (m) => {
          const msgId = String(m.id || m.messageId || '').trim();
          const cacheCtx = {
            accountId: ctx.accountId,
            clusterId: ctx.clusterId,
            messageId: msgId,
            senderAgentId: m.senderAgentId,
            ciphertext: m.ciphertext,
            nonce: m.nonce
          };

          const cached = getScopedClusterDecryptedMessage(cacheCtx);
          if (cached) {
            return {
              id: msgId,
              clusterId: m.clusterId || ctx.clusterId,
              senderAgentId: m.senderAgentId,
              content: cached,
              ciphertext: m.ciphertext,
              nonce: m.nonce,
              sequence: m.sequence,
              isDecrypted: true,
              createdAt: m.createdAt
            };
          }

          if (ctx.groupKey && m.ciphertext && m.nonce) {
            try {
              const text = await decryptClusterMessage(
                m.ciphertext,
                m.nonce,
                ctx.groupKey,
                m.senderAgentId,
                ctx.clusterId,
                m.keyEpoch || 1,
                m.version || 2
              );
              cacheScopedClusterDecryptedMessage(cacheCtx, text);
              return {
                id: msgId,
                clusterId: m.clusterId || ctx.clusterId,
                senderAgentId: m.senderAgentId,
                content: text,
                ciphertext: m.ciphertext,
                nonce: m.nonce,
                sequence: m.sequence,
                isDecrypted: true,
                createdAt: m.createdAt
              };
            } catch (e: any) {
              return {
                id: msgId,
                clusterId: m.clusterId || ctx.clusterId,
                senderAgentId: m.senderAgentId,
                content: '',
                ciphertext: m.ciphertext,
                nonce: m.nonce,
                sequence: m.sequence,
                isDecrypted: false,
                decryptionStatus: {
                  title: '🔒 Cannot be decrypted because group key or authentication failed',
                  detail: e?.message || 'Authentication tag or key mismatch'
                },
                createdAt: m.createdAt
              };
            }
          }

          return {
            id: msgId,
            clusterId: m.clusterId || ctx.clusterId,
            senderAgentId: m.senderAgentId,
            content: '',
            ciphertext: m.ciphertext,
            nonce: m.nonce,
            sequence: m.sequence,
            isDecrypted: false,
            decryptionStatus: {
              title: '🔒 Cannot be decrypted because keys or ciphertext are missing',
              detail: 'Missing decryption key material'
            },
            createdAt: m.createdAt
          };
        })
      );

      return reconcileClusterMessages(prevState, decryptedList, {
        accountId: ctx.accountId,
        clusterId: ctx.clusterId,
        pendingOptimisticToServerId
      });
    };

    // -------------------------------------------------------------------------
    // TEST 1: Two different senders send different plaintext messages with the
    //         same sequence number. Both must display their correct individual content.
    // -------------------------------------------------------------------------
    clearAllDecryptedMessageCache();
    const envSender1 = await encryptClusterMessage('Telemetry report from Slave 01', groupKeyObj.key, sender1, clusterA, 1);
    const envSender2 = await encryptClusterMessage('Diagnostics alert from Slave 02', groupKeyObj.key, sender2, clusterA, 1);

    const sameSeqRawMessages = [
      {
        id: 'msg_same_seq_1',
        clusterId: clusterA,
        senderAgentId: sender1,
        ciphertext: envSender1.ciphertext,
        nonce: envSender1.nonce,
        version: 2,
        keyEpoch: 1,
        sequence: 1,
        createdAt: '2026-10-30T16:57:00.000Z'
      },
      {
        id: 'msg_same_seq_2',
        clusterId: clusterA,
        senderAgentId: sender2,
        ciphertext: envSender2.ciphertext,
        nonce: envSender2.nonce,
        version: 2,
        keyEpoch: 1,
        sequence: 1,
        createdAt: '2026-10-30T17:00:00.000Z'
      }
    ];

    const processedSameSeq = await processServerMessages(sameSeqRawMessages, {
      accountId: account1,
      clusterId: clusterA,
      groupKey: groupKeyObj.key
    });

    const test1Passed =
      processedSameSeq.length === 2 &&
      processedSameSeq[0].id === 'msg_same_seq_1' &&
      processedSameSeq[0].content === 'Telemetry report from Slave 01' &&
      processedSameSeq[1].id === 'msg_same_seq_2' &&
      processedSameSeq[1].content === 'Diagnostics alert from Slave 02';

    recordResult(
      '1_different_senders_same_sequence_distinct_content',
      test1Passed,
      `Sender1="${processedSameSeq[0]?.content}", Sender2="${processedSameSeq[1]?.content}"`
    );

    // -------------------------------------------------------------------------
    // TEST 2: Multiple messages in the same cluster must never inherit another
    //         message's plaintext (including when sequence is null or identical).
    // -------------------------------------------------------------------------
    clearAllDecryptedMessageCache();
    const envM1 = await encryptClusterMessage('First distinct message', groupKeyObj.key, sender1, clusterA, 1);
    const envM2 = await encryptClusterMessage('Second distinct message', groupKeyObj.key, sender2, clusterA, 1);
    const envM3 = await encryptClusterMessage('Third distinct message from master', groupKeyObj.key, senderMaster, clusterA, 1);

    const multiRaw = [
      {
        id: 'msg_multi_1',
        clusterId: clusterA,
        senderAgentId: sender1,
        ciphertext: envM1.ciphertext,
        nonce: envM1.nonce,
        version: 2,
        keyEpoch: 1,
        sequence: null,
        createdAt: '2026-10-30T16:57:00.000Z'
      },
      {
        id: 'msg_multi_2',
        clusterId: clusterA,
        senderAgentId: sender2,
        ciphertext: envM2.ciphertext,
        nonce: envM2.nonce,
        version: 2,
        keyEpoch: 1,
        sequence: null,
        createdAt: '2026-10-30T17:00:00.000Z'
      },
      {
        id: 'msg_multi_3',
        clusterId: clusterA,
        senderAgentId: senderMaster,
        ciphertext: envM3.ciphertext,
        nonce: envM3.nonce,
        version: 2,
        keyEpoch: 1,
        sequence: null,
        createdAt: '2026-10-30T17:02:00.000Z'
      }
    ];

    const processedMulti = await processServerMessages(multiRaw, {
      accountId: account1,
      clusterId: clusterA,
      groupKey: groupKeyObj.key
    });

    const test2Passed =
      processedMulti.length === 3 &&
      processedMulti[0].content === 'First distinct message' &&
      processedMulti[1].content === 'Second distinct message' &&
      processedMulti[2].content === 'Third distinct message from master' &&
      new Set(processedMulti.map((m) => m.content)).size === 3;

    recordResult(
      '2_multiple_messages_never_inherit_other_plaintext',
      test2Passed,
      'All 3 messages preserved strictly independent plaintext content'
    );

    // -------------------------------------------------------------------------
    // TEST 3: Reopening a cluster must not display stale or incorrectly
    //         associated cached messages.
    // -------------------------------------------------------------------------
    clearAllDecryptedMessageCache();
    // Simulate legacy/stale poisoned entries in localStorage and incompatible envelope entries
    g.localStorage.setItem('aamarva_dec_msg_multi_1', 'POISONED_LEGACY_PLAINTEXT');
    g.localStorage.setItem(`aamarva_dec_${clusterA}_msg_multi_1`, 'POISONED_CLUSTER_LEGACY_PLAINTEXT');
    g.localStorage.setItem(`aamarva_dec_${clusterA}_null`, 'POISONED_NULL_NONCE_PLAINTEXT');
    g.localStorage.setItem('aamarva_dec_seq_null', 'POISONED_SEQ_NULL_PLAINTEXT');
    // Also inject a stale v2 envelope with wrong ciphertext/sender for msg_multi_2
    const staleKeyForMsg2 = buildClusterMessageCacheKey(account1, clusterA, 'msg_multi_2')!;
    g.localStorage.setItem(
      `aamarva_dec_${staleKeyForMsg2}`,
      JSON.stringify({
        v: 2,
        accountId: account1,
        clusterId: clusterA,
        messageId: 'msg_multi_2',
        senderAgentId: senderMaster, // mismatched sender
        ciphertext: envM3.ciphertext, // mismatched ciphertext
        nonce: envM3.nonce,
        plaintext: 'STALE_WRONG_PLAINTEXT_FROM_MASTER'
      })
    );

    purgeStaleClusterCacheEntries();

    // Reopen cluster (prevState is empty [])
    const reopenedMessages = await processServerMessages(
      multiRaw,
      {
        accountId: account1,
        clusterId: clusterA,
        groupKey: groupKeyObj.key
      },
      []
    );

    const test3Passed =
      reopenedMessages.length === 3 &&
      reopenedMessages[0].content === 'First distinct message' &&
      reopenedMessages[1].content === 'Second distinct message' &&
      reopenedMessages[2].content === 'Third distinct message from master';

    recordResult(
      '3_reopening_cluster_rejects_stale_and_poisoned_cache',
      test3Passed,
      `Reopened messages resolved to authentic plaintexts: [${reopenedMessages.map((m) => m.content).join(', ')}]`
    );

    // -------------------------------------------------------------------------
    // TEST 4: Switching between clusters must not reuse another cluster's
    //         cached plaintext.
    // -------------------------------------------------------------------------
    clearAllDecryptedMessageCache();
    const sharedMessageId = 'msg_collision_999';
    cacheScopedClusterDecryptedMessage(
      {
        accountId: account1,
        clusterId: clusterA,
        messageId: sharedMessageId,
        senderAgentId: sender1,
        ciphertext: envM1.ciphertext,
        nonce: envM1.nonce
      },
      'Cluster A Confidential Payload'
    );

    // Attempt to read with same accountId & messageId, and even same ciphertext/nonce, but in clusterB
    const crossClusterRead = getScopedClusterDecryptedMessage({
      accountId: account1,
      clusterId: clusterB,
      messageId: sharedMessageId,
      senderAgentId: sender1,
      ciphertext: envM1.ciphertext,
      nonce: envM1.nonce
    });

    const clusterAValidRead = getScopedClusterDecryptedMessage({
      accountId: account1,
      clusterId: clusterA,
      messageId: sharedMessageId,
      senderAgentId: sender1,
      ciphertext: envM1.ciphertext,
      nonce: envM1.nonce
    });

    const test4Passed = crossClusterRead === null && clusterAValidRead === 'Cluster A Confidential Payload';
    recordResult(
      '4_switching_clusters_isolates_cached_plaintext',
      test4Passed,
      `Cluster B lookup=${crossClusterRead}, Cluster A lookup="${clusterAValidRead}"`
    );

    // -------------------------------------------------------------------------
    // TEST 5: Switching authenticated accounts must not reuse another account's
    //         cached plaintext.
    // -------------------------------------------------------------------------
    const crossAccountRead = getScopedClusterDecryptedMessage({
      accountId: account2,
      clusterId: clusterA,
      messageId: sharedMessageId,
      senderAgentId: sender1,
      ciphertext: envM1.ciphertext,
      nonce: envM1.nonce
    });

    const account1ValidRead = getScopedClusterDecryptedMessage({
      accountId: account1,
      clusterId: clusterA,
      messageId: sharedMessageId,
      senderAgentId: sender1,
      ciphertext: envM1.ciphertext,
      nonce: envM1.nonce
    });

    const test5Passed = crossAccountRead === null && account1ValidRead === 'Cluster A Confidential Payload';
    recordResult(
      '5_switching_accounts_isolates_cached_plaintext',
      test5Passed,
      `Account 2 lookup=${crossAccountRead}, Account 1 lookup="${account1ValidRead}"`
    );

    // -------------------------------------------------------------------------
    // TEST 6: A failed decryption must never fall back to another message's
    //         plaintext (even when sequence numbers are both 1 or both null).
    // -------------------------------------------------------------------------
    clearAllDecryptedMessageCache();
    const otherGroupKey = await generateClusterGroupKey();
    const unDecryptableEnv = await encryptClusterMessage(
      'Encrypted with unknown key',
      otherGroupKey.key,
      sender2,
      clusterA,
      1
    );

    const envMasterRg = await encryptClusterMessage(
      'rgkljwgkwnkvw',
      groupKeyObj.key,
      senderMaster,
      clusterA,
      1
    );

    // Initial state has a decrypted message with sequence: 1
    const initialDecryptedState: ReconcilableClusterMessage[] = [
      {
        id: 'msg_decrypted_master',
        clusterId: clusterA,
        senderAgentId: senderMaster,
        content: 'rgkljwgkwnkvw',
        ciphertext: envMasterRg.ciphertext,
        nonce: envMasterRg.nonce,
        sequence: 1,
        isDecrypted: true,
        createdAt: '2026-10-30T17:02:00.000Z'
      }
    ];

    const pollWithUndecryptable = await processServerMessages(
      [
        {
          id: 'msg_undecryptable_slave',
          clusterId: clusterA,
          senderAgentId: sender2,
          ciphertext: unDecryptableEnv.ciphertext,
          nonce: unDecryptableEnv.nonce,
          version: 2,
          keyEpoch: 1,
          sequence: 1, // Identical sequence number to msg_decrypted_master!
          createdAt: '2026-10-30T16:57:00.000Z'
        },
        {
          id: 'msg_decrypted_master',
          clusterId: clusterA,
          senderAgentId: senderMaster,
          ciphertext: envMasterRg.ciphertext,
          nonce: envMasterRg.nonce,
          version: 2,
          keyEpoch: 1,
          sequence: 1,
          createdAt: '2026-10-30T17:02:00.000Z'
        }
      ],
      {
        accountId: account1,
        clusterId: clusterA,
        groupKey: groupKeyObj.key
      },
      initialDecryptedState
    );

    const failedMsg = pollWithUndecryptable.find((m) => m.id === 'msg_undecryptable_slave');
    const validMsg = pollWithUndecryptable.find((m) => m.id === 'msg_decrypted_master');

    const test6Passed =
      Boolean(failedMsg) &&
      failedMsg!.isDecrypted === false &&
      failedMsg!.content === '' &&
      Boolean(failedMsg!.decryptionStatus?.title) &&
      failedMsg!.content !== 'rgkljwgkwnkvw' &&
      Boolean(validMsg) &&
      validMsg!.isDecrypted === true &&
      validMsg!.content === 'rgkljwgkwnkvw';

    recordResult(
      '6_failed_decryption_never_falls_back_to_other_message',
      test6Passed,
      `Failed msg isDecrypted=${failedMsg?.isDecrypted}, content="${failedMsg?.content}", status="${failedMsg?.decryptionStatus?.title}"`
    );

    // -------------------------------------------------------------------------
    // TEST 7: Optimistic messages must reconcile correctly with their
    //         corresponding server messages without overwriting other messages.
    // -------------------------------------------------------------------------
    clearAllDecryptedMessageCache();
    const tempId = 'temp_cluster_1730290000_xyz';
    const assignedServerId = 'msg_server_assigned_777';
    const optimisticPlaintext = 'Execute autonomous deployment sequence';
    const envOptimistic = await encryptClusterMessage(optimisticPlaintext, groupKeyObj.key, senderMaster, clusterA, 1);

    const pendingMap = new Map<string, string>([[tempId, assignedServerId]]);
    const stateWithOptimistic: ReconcilableClusterMessage[] = [
      {
        id: 'msg_multi_1',
        clusterId: clusterA,
        senderAgentId: sender1,
        content: 'First distinct message',
        ciphertext: envM1.ciphertext,
        nonce: envM1.nonce,
        isDecrypted: true,
        createdAt: '2026-10-30T16:57:00.000Z'
      },
      {
        id: tempId,
        clusterId: clusterA,
        senderAgentId: senderMaster,
        content: optimisticPlaintext,
        isDecrypted: true,
        createdAt: '2026-10-30T17:05:00.000Z'
      }
    ];

    // Server returns both existing message and newly persisted message
    const reconciledAfterSend = await processServerMessages(
      [
        {
          id: 'msg_multi_1',
          clusterId: clusterA,
          senderAgentId: sender1,
          ciphertext: envM1.ciphertext,
          nonce: envM1.nonce,
          version: 2,
          keyEpoch: 1,
          createdAt: '2026-10-30T16:57:00.000Z'
        },
        {
          id: assignedServerId,
          clusterId: clusterA,
          senderAgentId: senderMaster,
          ciphertext: envOptimistic.ciphertext,
          nonce: envOptimistic.nonce,
          version: 2,
          keyEpoch: 1,
          createdAt: '2026-10-30T17:05:01.000Z'
        }
      ],
      {
        accountId: account1,
        clusterId: clusterA,
        groupKey: groupKeyObj.key
      },
      stateWithOptimistic,
      pendingMap
    );

    const hasNoTempDuplicate = !reconciledAfterSend.some((m) => m.id === tempId);
    const reconciledMsg = reconciledAfterSend.find((m) => m.id === assignedServerId);
    const preservedOtherMsg = reconciledAfterSend.find((m) => m.id === 'msg_multi_1');

    const test7Passed =
      reconciledAfterSend.length === 2 &&
      hasNoTempDuplicate &&
      reconciledMsg?.content === optimisticPlaintext &&
      reconciledMsg?.isDecrypted === true &&
      preservedOtherMsg?.content === 'First distinct message';

    recordResult(
      '7_optimistic_messages_reconcile_without_overwriting',
      test7Passed,
      `Total=${reconciledAfterSend.length}, Reconciled="${reconciledMsg?.content}", Other="${preservedOtherMsg?.content}"`
    );

    // -------------------------------------------------------------------------
    // TEST 8: Repeated message polling must preserve the correct content of
    //         every message across multiple poll cycles.
    // -------------------------------------------------------------------------
    let pollState = reconciledAfterSend;
    const rawPollFeed = [
      {
        id: 'msg_multi_1',
        clusterId: clusterA,
        senderAgentId: sender1,
        ciphertext: envM1.ciphertext,
        nonce: envM1.nonce,
        version: 2,
        keyEpoch: 1,
        sequence: 1,
        createdAt: '2026-10-30T16:57:00.000Z'
      },
      {
        id: 'msg_multi_2',
        clusterId: clusterA,
        senderAgentId: sender2,
        ciphertext: envM2.ciphertext,
        nonce: envM2.nonce,
        version: 2,
        keyEpoch: 1,
        sequence: 1,
        createdAt: '2026-10-30T17:00:00.000Z'
      },
      {
        id: assignedServerId,
        clusterId: clusterA,
        senderAgentId: senderMaster,
        ciphertext: envOptimistic.ciphertext,
        nonce: envOptimistic.nonce,
        version: 2,
        keyEpoch: 1,
        sequence: 1,
        createdAt: '2026-10-30T17:05:01.000Z'
      }
    ];

    for (let cycle = 0; cycle < 5; cycle++) {
      // Simulate transient missing groupKey on odd cycles to verify cache/reconciliation stability
      const activeKey = cycle % 2 === 0 ? groupKeyObj.key : null;
      pollState = await processServerMessages(
        rawPollFeed,
        {
          accountId: account1,
          clusterId: clusterA,
          groupKey: activeKey
        },
        pollState,
        pendingMap
      );
    }

    const test8Passed =
      pollState.length === 3 &&
      pollState[0].id === 'msg_multi_1' &&
      pollState[0].content === 'First distinct message' &&
      pollState[1].id === 'msg_multi_2' &&
      pollState[1].content === 'Second distinct message' &&
      pollState[2].id === assignedServerId &&
      pollState[2].content === optimisticPlaintext;

    recordResult(
      '8_repeated_polling_preserves_exact_message_content',
      test8Passed,
      `After 5 poll cycles: [${pollState.map((m) => `${m.id}="${m.content}"`).join(', ')}]`
    );

    // Also verify unsafe keys (seq_*, *_null, *_undefined, temp_cluster_*) are rejected by generic cache
    cacheDecryptedMessage('Should not be stored', ['seq_null', 'seq_1', 'cluster_null', 'cluster_undefined', 'temp_cluster_123']);
    const unsafeLookup = getCachedDecryptedMessage(['seq_null', 'seq_1', 'cluster_null', 'cluster_undefined', 'temp_cluster_123']);
    recordResult(
      '9_unsafe_sequence_and_null_keys_rejected_by_store',
      unsafeLookup === null,
      'Generic store rejected sequence and null/undefined keys'
    );
  } catch (err: any) {
    recordResult('unexpected_suite_exception', false, err?.message || String(err));
  }

  return results;
}

if (process.argv[1] && process.argv[1].includes('clusterMessageIdentityTests')) {
  runClusterMessageIdentityTests().then((res) => {
    const failed = Object.values(res).some((r) => r.status === 'FAILED');
    process.exit(failed ? 1 : 0);
  });
}
