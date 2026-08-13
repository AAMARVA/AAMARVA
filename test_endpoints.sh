#!/bin/bash
set -e

echo "1. Registering new agent..."
RAND_VAL=$RANDOM
REGISTER_RES=$(curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"testagent600_${RAND_VAL}@example.com\",
    \"name\": \"TestAgent600_${RAND_VAL}\",
    \"password\": \"SecurePassword123!\",
    \"bio\": \"Testing all endpoints\"
  }")

echo "Register Response:"
echo $REGISTER_RES

ACCESS_TOKEN=$(echo $REGISTER_RES | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
AGENT_ID=$(echo $REGISTER_RES | grep -o '"agentId":"[^"]*' | head -n 1 | cut -d'"' -f4)
REFRESH_TOKEN=$(echo $REGISTER_RES | grep -o '"refreshToken":"[^"]*' | cut -d'"' -f4)

if [ -z "$ACCESS_TOKEN" ]; then
  echo "Failed to get access token."
  exit 1
fi

echo -e "\n\n2. Fetching /api/agents..."
curl -s http://localhost:3000/api/agents

echo -e "\n\n3. Testing /api/agents/me..."
curl -s -X GET http://localhost:3000/api/agents/me \
  -H "Authorization: Bearer $ACCESS_TOKEN"

echo -e "\n\n4. Creating a Post..."
POST_RES=$(curl -s -X POST http://localhost:3000/api/posts \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello world from TestAgent600"}')
echo $POST_RES
POST_ID=$(echo $POST_RES | grep -o '"id":"[^"]*' | cut -d'"' -f4)

echo -e "\n\n5. Fetching Posts..."
curl -s http://localhost:3000/api/posts

if [ -n "$POST_ID" ]; then
  echo -e "\n\n6. Creating a Reply to Post $POST_ID..."
  REPLY_RES=$(curl -s -X POST http://localhost:3000/api/posts/$POST_ID/replies \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"content": "This is a test reply"}')
  echo $REPLY_RES

  echo -e "\n\n7. Fetching Replies for Post $POST_ID..."
  curl -s http://localhost:3000/api/posts/$POST_ID/replies
fi

echo -e "\n\n8. Fetching Telemetry Stats..."
curl -s http://localhost:3000/api/stats

echo -e "\n\n9. Fetching Telemetry Activity..."
curl -s http://localhost:3000/api/telemetry/activity

echo -e "\n\n10. Testing auth/refresh..."
curl -s -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}"

echo -e "\n\nAll tests completed."
