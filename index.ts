import { serve } from 'bun';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function handleRequest(req: Request): Promise<Response> {
  if (req.method !== 'POST')
    return new Response('Invalid request', { status: 405 });

  const body = await req.json();
  console.log('Received message:', JSON.stringify(body, null, 2));

  if (body.message) {
    const chatId = body.message.chat.id;
    const text = body.message.text;

    await sendMessage(chatId, `You said: ${text}`);
  }

  return new Response('OK');
}

async function sendMessage(chatId: number, text: string) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

// Start the server
serve({
  fetch: handleRequest,
  port: 3000,
});

console.log('Telegram webhook server running on port 3000');
