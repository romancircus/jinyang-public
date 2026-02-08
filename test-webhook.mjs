#!/usr/bin/env node
/**
 * Test script to trigger jinyang webhook manually
 * Usage: node test-webhook.mjs
 */

import crypto from 'crypto';
import http from 'http';

const WEBHOOK_SECRET = 'lin_wh_your-webhook-secret';
const JINYANG_HOST = 'localhost';
const JINYANG_PORT = 3001;
const JINYANG_PATH = '/webhooks/linear';

// Create a test Linear webhook payload
const payload = {
  action: 'create',
  type: 'Issue',
  data: {
    id: 'test-issue-001',
    identifier: 'ROM-TEST-001',
    title: 'Test jinyang deployment: Add testing documentation to README',
    description: `## Task

Add a new section to README.md documenting the testing infrastructure:

### Testing Section to Add:
\`\`\`markdown
## Testing

Jinyang includes comprehensive test coverage:

### Test Structure
- **Unit Tests**: Individual components (346 tests)
- **Integration Tests**: Component interactions
- **E2E Tests**: Full webhook-to-Linear flow

### Running Tests
\`\`\`bash
npm test              # Run all tests
npm run test:watch    # Watch mode
\`\`\`

### Key Test Areas
- Executor interfaces and implementations
- Worktree management and git operations
- Provider routing with circuit breaker
- Result verification and orchestration
- Webhook handling and Linear integration
\`\`\`

### Requirements:
1. Add this section to the README.md file
2. Ensure proper markdown formatting
3. The section should be added after the "Architecture" section
4. Update the Table of Contents to include the new Testing section

This is a deployment test for the jinyang autonomous execution system.`,
    state: { name: 'Todo' },
    labels: {
      nodes: [
        { name: 'jinyang:auto' }
      ]
    },
    project: {
      id: 'proj-test',
      name: 'jinyang'
    }
  },
  url: 'https://linear.app/your-workspace/issue/ROM-TEST-001',
  createdAt: new Date().toISOString()
};

// Calculate HMAC signature
const signature = crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(JSON.stringify(payload))
  .digest('hex');

console.log('🔔 Triggering jinyang webhook test...');
console.log('Endpoint:', `${JINYANG_HOST}:${JINYANG_PORT}${JINYANG_PATH}`);
console.log('Signature:', signature.substring(0, 16) + '...');

// Send the webhook
const data = JSON.stringify(payload);

const options = {
  hostname: JINYANG_HOST,
  port: JINYANG_PORT,
  path: JINYANG_PATH,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Linear-Signature': signature,
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, (res) => {
  let responseData = '';

  res.on('data', (chunk) => {
    responseData += chunk;
  });

  res.on('end', () => {
    console.log('\n✅ Webhook response:');
    console.log(`Status: ${res.statusCode}`);
    console.log(`Body: ${responseData}`);

    if (res.statusCode === 202) {
      console.log('\n🚀 Webhook accepted! Check logs:');
      console.log('  tail -f ~/.jinyang/logs/*.log');
      console.log('\n⏳ Waiting for execution (may take 30-60 seconds)...');
    } else {
      console.log('\n❌ Webhook failed');
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request failed:', error.message);
});

req.write(data);
req.end();
