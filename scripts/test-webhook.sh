#!/bin/bash
# Test jinyang webhook with Linear delegation using Node.js for signature

WEBHOOK_URL="https://your-server.example.com/webhooks/linear"
WEBHOOK_SECRET="lin_wh_your-webhook-secret"

# Calculate signature using Node.js
SIGNATURE=$(node -e "
const crypto = require('crypto');
const secret = '$WEBHOOK_SECRET';
const payload = {
  action: 'updated',
  url: 'https://linear.app/...',
  createdAt: '2026-02-04T15:00:00Z',
  data: {},
  event: { type: 'Issue', delegate: 'jinyang' }
};
console.log(crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex'));
")

echo "Signature: $SIGNATURE"
echo ""
echo "Sending test webhook..."

RESPONSE=$(curl -s -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "Linear-Signature: $SIGNATURE" \
  -d @- <<EOF
{
  "action": "updated",
  "url": "https://linear.app/...",
  "createdAt": "2026-02-04T15:00:00Z",
  "data": {},
  "event": {
    "type": "Issue",
    "delegate": "jinyang"
  }
}
EOF
)

echo "Response: $RESPONSE"
