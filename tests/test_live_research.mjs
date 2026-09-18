async function test() {
  console.log('Testing research query with Google Gemini 3.5 Flash...');
  const runRes = await fetch('http://localhost:3000/api/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Compare Fastify and Hono for REST APIs with citations' }),
  });
  const data = await runRes.json();
  console.log('Run data:', data);

  const streamRes = await fetch('http://localhost:3000/api/runs/' + data.runId + '/stream');
  const reader = streamRes.body.getReader();
  const decoder = new TextDecoder();
  let fullAnswer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value);
    for (const line of text.split('\n')) {
      if (line.startsWith('data: ')) {
        const ev = JSON.parse(line.slice(6));
        if (ev.type === 'token') fullAnswer += ev.delta;
        if (ev.type === 'tool_call') console.log('-> Executing tool:', ev.name, ev.args);
        if (ev.type === 'tool_result') console.log('-> Tool result:', ev.summary);
        if (ev.type === 'done') {
          console.log('\n--- FULL RESPONSE ---\n' + (fullAnswer || ev.text));
          return;
        }
      }
    }
  }
}
test().catch(console.error);
