import { serve } from 'bun';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function handleRequest(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST')
      return new Response('Invalid request', { status: 405 });

    const body = await req.json();
    console.log('Received message:', JSON.stringify(body, null, 2));

    if (!body.message) {
      return new Response('No message in request (mc)', { status: 400 });
    }

    const chatId = body.message.chat.id;
    const text = body.message.text;

    await sendMessage(chatId, `You said: ${text}`);
    return new Response('OK (mc)');
  } catch (error) {
    console.error('Error handling request:', error);
    return new Response('Internal server error (mc)', { status: 500 });
  }
}

async function sendMessage(chatId: number, text: string) {
  if (!BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN environment variable is not set');
  }

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to send message: ${errorData}`);
  }
}

// Start the server
serve({
  fetch: handleRequest,
  port: 3000,
});

console.log('Telegram webhook server running on port 3000');
