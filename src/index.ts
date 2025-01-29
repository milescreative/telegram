import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { env, Env } from './env.js';

const app = new Hono();

app.get('/', (c) => {
  return c.text('Telegram Bot Webhook Server is running!');
});

app.post('/', async (c) => {
  try {
    const p_env = c.env as Env;
    const parsed_env = env({ process_env: p_env });

    const body = await c.req.json();
    console.log('Received message:', JSON.stringify(body, null, 2));

    if (!body.message) {
      return c.json({ error: 'No message in request (mc)' }, 400);
    }

    const chatId = body.message.chat.id;
    const text = body.message.text;

    await sendMessage(
      chatId,
      `You said: ${text}`,
      parsed_env.TELEGRAM_BOT_TOKEN
    );
    return c.json({ status: 'OK (mc)' });
  } catch (error) {
    console.error('Error handling request:', error);
    return c.json({ error: 'Internal server error (mc)' }, 500);
  }
});

async function sendMessage(chatId: number, text: string, botToken: string) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
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

serve(app, (info) => {
  console.log(
    `Telegram webhook server running on http://localhost:${info.port}`
  );
});
