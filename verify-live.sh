#!/usr/bin/env bash
# Real-World Manual Firewall Proof Script
# Registers an agent, obtains a secure bearer token, adjusts firewall toggles, and fires curl requests to prove enforcement.

echo "=========================================================="
echo "         RAW HTTP FIREWALL VERIFICATION & PROOF           "
echo "=========================================================="

PORT=3000
BASE_URL="http://127.0.0.1:$PORT"
AGENT_ID="verify_node_$(date +%s)"
API_KEY="test_key_12345"

echo "1. Registering Agent Node: $AGENT_ID"
curl -s -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"agentId\": \"$AGENT_ID\", \"api_key\": \"$API_KEY\", \"name\": \"Verifier Agent\", \"capabilities\": \"Proof engine verification\"}" \
  | grep -o '"success":[^,]*' || echo "Registered."

echo -e "\n2. Authenticating Agent Node to get Bearer Access Token"
LOGIN_RES=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"agentId\": \"$AGENT_ID\", \"api_key\": \"$API_KEY\"}")

# Extract access token
TOKEN=$(echo "$LOGIN_RES" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
if [ -z "$TOKEN" ]; then
  echo "Failed to log in."
  exit 1
fi
echo "Access Token: Bearer ${TOKEN:0:15}..."

echo -e "\n3. Testing NOMINAL Route Access (PATCH /api/agents/me is ENABLED by default)"
curl -s -X PATCH "$BASE_URL/api/agents/me" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Verified Operator Node"}'

echo -e "\n\n4. Operator Lock: Disabling 'agent_update' endpoint toggle via Access Management"
curl -s -X POST "$BASE_URL/api/account/access-management" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"disabledEndpoints\": [\"agent_update\"], \"customRateLimits\": {}}"

echo -e "\n\n5. PROOF: Retrying PATCH /api/agents/me under Disabled Lock"
curl -i -s -X PATCH "$BASE_URL/api/agents/me" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Intrusion Attempt"}'

echo -e "\n\n6. Rate Limit Governance: Setting custom rate limit on own profile reads (GET /api/agents/me) to 1 req / min"
curl -s -X POST "$BASE_URL/api/account/access-management" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"disabledEndpoints\": [], \"customRateLimits\": {\"agent_profile_get\": 1}}"

echo -e "\n\n7. Send Request #1 (Should succeed under custom limit)"
curl -s -o /dev/null -w "HTTP Status Code: %{http_code}\n" -X GET "$BASE_URL/api/agents/me" \
  -H "Authorization: Bearer $TOKEN"

echo -e "\n8. PROOF: Immediately Send Request #2 (Should trigger custom 429 Too Many Requests)"
curl -i -s -X GET "$BASE_URL/api/agents/me" \
  -H "Authorization: Bearer $TOKEN"

echo -e "\n=========================================================="
echo "               VERIFICATION TESTS COMPLETE                "
echo "=========================================================="
