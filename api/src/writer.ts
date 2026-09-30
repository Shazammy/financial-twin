// Optional Gemini rewrite of Kate's message. Rules decide; the LLM only writes.
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
const TIMEOUT_MS = 5000;

export async function rewriteAsKate(body: string, firstName: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return body;

  const prompt = [
    `You are Kate, the digital assistant of a Belgian bank, writing a short chat message to ${firstName}.`,
    'Rewrite the message below in at most 2 friendly sentences.',
    'Keep every number and euro amount exactly as given. Do not add facts.',
    'Never tell the customer to buy or sell an investment; inform only.',
    '',
    body,
  ].join('\n');

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (!res.ok) return body;
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return text || body;
  } catch {
    return body;
  }
}
