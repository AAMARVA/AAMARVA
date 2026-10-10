import { validateContractTerms } from '../services/ticketService.js';
import { acceptContract } from '../services/bidService.js';
import { setSupabaseClient, createMockSupabaseClient } from '../supabase.js';

export async function runContractTermsAndAwardTests() {
  console.log('🧪 Running Contract Terms, Bid Awarding, and Mutual Acceptance Tests...');

  // 1. Test 4 valid bullet terms: rejected
  const fourTerms = `- Term 1\n- Term 2\n- Term 3\n- Term 4`;
  const res4 = validateContractTerms(fourTerms);
  if (res4.isValid) {
    throw new Error('Test failed: 4 terms should be rejected.');
  }
  console.log('✅ 4 valid bullet terms correctly rejected.');

  // 2. Test 5 valid bullet terms: accepted
  const fiveTerms = `- Term 1\n- Term 2\n- Term 3\n- Term 4\n- Term 5`;
  const res5 = validateContractTerms(fiveTerms);
  if (!res5.isValid || res5.termCount !== 5) {
    throw new Error(`Test failed: 5 terms should be accepted. Got isValid=${res5.isValid}, count=${res5.termCount}`);
  }
  console.log('✅ 5 valid bullet terms correctly accepted.');

  // 3. Test 10,000 valid bullet terms: accepted and persistence
  const tenThousandTerms = Array.from({ length: 10000 }, (_, i) => `- Term item number ${i + 1}`).join('\n');
  const res10k = validateContractTerms(tenThousandTerms);
  if (!res10k.isValid || res10k.termCount !== 10000) {
    throw new Error(`Test failed: 10,000 terms should be accepted. Got count=${res10k.termCount}`);
  }

  // Test persistence & retrieval roundtrip of 10,000 terms
  const mockClient = createMockSupabaseClient();
  setSupabaseClient(mockClient);

  await mockClient.from('posts').insert([{
    id: 'post_10k',
    userId: 'user_1',
    agentId: 'agent_1',
    agentName: 'Agent 1',
    content: tenThousandTerms,
    type: 'intake',
    category: 'General'
  }]);

  const { data: retrievedPost } = await mockClient.from('posts').select('*').eq('id', 'post_10k').maybeSingle();
  const retrievedValidation = validateContractTerms(retrievedPost.content);
  if (!retrievedValidation.isValid || retrievedValidation.termCount !== 10000) {
    throw new Error(`Test failed: 10,000 terms failed persistence roundtrip. Count: ${retrievedValidation.termCount}`);
  }
  console.log('✅ 10,000 valid bullet terms correctly accepted and survived persistence roundtrip without truncation.');

  // 4. Test 10,001 valid bullet terms: rejected
  const tenThousandOneTerms = Array.from({ length: 10001 }, (_, i) => `- Term item number ${i + 1}`).join('\n');
  const res10k1 = validateContractTerms(tenThousandOneTerms);
  if (res10k1.isValid) {
    throw new Error('Test failed: 10,001 terms should be rejected.');
  }
  console.log('✅ 10,001 valid bullet terms correctly rejected.');

  // 5. Test Headings, empty bullets, ordinary paragraphs do not count
  const mixedContent = `
# Project Title Heading
This is an ordinary paragraph text that should not count as a term.
- 
* 
1. 
- Valid bullet term one requirement
- Valid bullet term two requirement
- Valid bullet term three requirement
- Valid bullet term four requirement
- Valid bullet term five requirement
  `;
  const resMixed = validateContractTerms(mixedContent);
  if (!resMixed.isValid || resMixed.termCount !== 5) {
    throw new Error(`Test failed: Mixed content should result in exactly 5 valid terms. Got ${resMixed.termCount}`);
  }
  console.log('✅ Headings, empty bullets, and ordinary paragraphs correctly ignored.');

  // 6. Test Mutual Acceptance Logic with mock database
  await mockClient.from('contracts').insert([{
    id: 'cnt_test_123',
    ticketId: 'post_1',
    bidId: 'rep_1',
    ownerUserId: 'user_owner',
    ownerAgentId: 'agent-owner',
    selectedAgentId: 'agent-selected',
    terms: '- Term 1\n- Term 2\n- Term 3\n- Term 4\n- Term 5',
    bidContent: 'My bid offer',
    status: 'pending_acceptance',
    ownerAccepted: false,
    agentAccepted: false
  }]);

  // Test unauthorized user acceptance -> throws forbidden
  let threwError = false;
  try {
    await acceptContract('cnt_test_123', 'user_unauthorized', 'agent-intruder');
  } catch (err: any) {
    if (err.message.includes('Forbidden')) {
      threwError = true;
    }
  }
  if (!threwError) {
    throw new Error('Test failed: Unauthorized acceptance must be forbidden.');
  }
  console.log('✅ Unauthorized contract acceptance correctly forbidden.');

  // Test owner acceptance -> remains pending_acceptance until agent accepts
  const afterOwner = await acceptContract('cnt_test_123', 'user_owner', 'agent-owner');
  if (afterOwner.status !== 'pending_acceptance' || !afterOwner.ownerAccepted || afterOwner.agentAccepted) {
    throw new Error('Test failed: Owner acceptance state incorrect.');
  }
  console.log('✅ Owner acceptance recorded while status remains pending_acceptance.');

  // Test agent acceptance -> transitions to active
  const afterAgent = await acceptContract('cnt_test_123', 'user_other', 'agent-selected');
  if (afterAgent.status !== 'active' || !afterAgent.ownerAccepted || !afterAgent.agentAccepted) {
    throw new Error('Test failed: Mutual acceptance should transition status to active.');
  }
  console.log('✅ Mutual acceptance successfully transitions contract status to active.');

  // 7. Test simultaneous concurrent acceptances (concurrency safety)
  await mockClient.from('contracts').insert([{
    id: 'cnt_concurrent_456',
    ticketId: 'post_2',
    bidId: 'rep_2',
    ownerUserId: 'user_owner',
    ownerAgentId: 'agent-owner',
    selectedAgentId: 'agent-selected',
    terms: '- Term 1\n- Term 2\n- Term 3\n- Term 4\n- Term 5',
    bidContent: 'Bid offer 2',
    status: 'pending_acceptance',
    ownerAccepted: false,
    agentAccepted: false
  }]);

  await Promise.all([
    acceptContract('cnt_concurrent_456', 'user_owner', 'agent-owner'),
    acceptContract('cnt_concurrent_456', 'user_other', 'agent-selected')
  ]);

  const { data: concContract } = await mockClient.from('contracts').select('*').eq('id', 'cnt_concurrent_456').maybeSingle();
  if (concContract.status !== 'active' || !concContract.ownerAccepted || !concContract.agentAccepted) {
    throw new Error('Test failed: Concurrent simultaneous acceptances must reliably result in active status and both acceptance flags true.');
  }
  console.log('✅ Concurrent simultaneous acceptances successfully produced active status with both acceptance flags true.');

  console.log('🎉 All Contract Terms, Award, and Mutual Acceptance tests passed successfully!');
  return { success: true, message: 'All tests passed' };
}
