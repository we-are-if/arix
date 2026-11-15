// Network chunks need not coincide with lines or UTF-8 character boundaries.
export async function* readAssistantStream(body) {
  if (!body) throw new Error('Missing response stream');
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let end;
      while ((end = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, end).trim();
        pending = pending.slice(end + 1);
        if (line) yield JSON.parse(line);
      }
      if (done) break;
    }
    if (pending.trim()) yield JSON.parse(pending);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
