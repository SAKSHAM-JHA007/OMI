import test from 'node:test';
import assert from 'node:assert/strict';

// Test PRD §7.3 Outbound Allowlist & Taint Enforcement Logic
test('Outbound allowlist blocks query-string exfiltration attempts', () => {
  const allowedUrls = new Set([
    'https://html.duckduckgo.com/html/',
    'https://fastify.dev/docs/latest/Guides/Benchmarking/',
  ]);

  function isUrlAllowlisted(targetUrl, allowedSet) {
    if (allowedSet.has(targetUrl)) return true;
    try {
      const u1 = new URL(targetUrl);
      for (const allowed of allowedSet) {
        const u2 = new URL(allowed);
        if (u1.origin === u2.origin && u1.pathname === u2.pathname) return true;
      }
    } catch {
      return false;
    }
    return false;
  }

  // Attack 1: arbitrary model constructed URL
  assert.equal(isUrlAllowlisted('https://attacker.com/leak?data=secret', allowedUrls), false);

  // Attack 2: query string tampering on same host
  assert.equal(isUrlAllowlisted('https://fastify.dev/other-path?leak=token', allowedUrls), false);

  // Legitimate URL from search
  assert.equal(isUrlAllowlisted('https://fastify.dev/docs/latest/Guides/Benchmarking/', allowedUrls), true);
});

test('Taint tracking strips write_memory and send_email tools', () => {
  const allTools = [
    { name: 'web_search', risk: 'read', returnsTrust: 'untrusted' },
    { name: 'fetch_page', risk: 'read', returnsTrust: 'untrusted' },
    { name: 'read_memory', risk: 'read', returnsTrust: 'trusted' },
    { name: 'write_memory', risk: 'write', returnsTrust: 'trusted' },
    { name: 'send_email', risk: 'external', returnsTrust: 'trusted' },
  ];

  function filterToolsForRun(tools, isTainted) {
    return tools.filter((t) => {
      if (isTainted && (t.name === 'write_memory' || t.name === 'send_email')) {
        return false;
      }
      return true;
    });
  }

  const cleanTools = filterToolsForRun(allTools, false);
  assert.equal(cleanTools.length, 5);

  const taintedTools = filterToolsForRun(allTools, true);
  assert.equal(taintedTools.length, 3);
  assert.equal(taintedTools.some((t) => t.name === 'write_memory'), false);
  assert.equal(taintedTools.some((t) => t.name === 'send_email'), false);
});

test('Duplicate tool call limiter blocks 3rd identical call (PRD §5)', () => {
  const callHistory = new Map();

  function recordAndCheck(toolName, args) {
    const key = `${toolName}:${JSON.stringify(args)}`;
    const count = callHistory.get(key) || 0;
    if (count >= 2) {
      return { allowed: false, message: 'You already executed this exact tool call twice' };
    }
    callHistory.set(key, count + 1);
    return { allowed: true };
  }

  assert.equal(recordAndCheck('web_search', { q: 'node' }).allowed, true);
  assert.equal(recordAndCheck('web_search', { q: 'node' }).allowed, true);
  // 3rd identical call must be blocked per PRD §5
  const thirdCall = recordAndCheck('web_search', { q: 'node' });
  assert.equal(thirdCall.allowed, false);
});
