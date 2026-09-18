async function test() {
  console.log('Testing running server on port 3000 with "hi"...');
  const runRes = await fetch('http://localhost:3000/api/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'hi' }),
  });
  console.log('Run response status:', runRes.status);
  const data = await runRes.json();
  console.log('Run data:', data);

  const streamRes = await fetch('http://localhost:3000/api/runs/' + data.runId + '/stream');
  console.log('Stream status:', streamRes.status);
  const reader = streamRes.body.getReader();
  const decoder = new TextDecoder();
  let receivedText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value);
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const ev = JSON.parse(line.slice(6));
        console.log('Stream event:', ev.type, ev.delta || ev.text || ev.message || '');
        if (ev.type === 'token') receivedText += ev.delta;
        if (ev.type === 'done') {
          console.log('\nFINAL RECEIVED ANSWER:\n"' + (receivedText || ev.text) + '"');
          return;
        }
      }
    }
  }
}
test().catch(console.error);
