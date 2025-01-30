import { env } from './env.js';
import * as dotenv from 'dotenv';
import { Hono } from 'hono';

// Load environment variables at startup
dotenv.config();

const app = new Hono();

app.get('/', (c) => {
  const testenv = env({ process_env: process.env }); // Use process.env directly
  const telegram_bot_token = testenv.TELEGRAM_BOT_TOKEN;

  if (!telegram_bot_token) {
    console.log('Available env vars:', process.env);
    return c.text('Telegram Bot Webhook Server is running! but no token found');
  }
  return c.text('Telegram Bot Webhook Server is running!');
});

app.post('/', async (c) => {
  try {
    const parsed_env = env({ process_env: process.env }); // Use process.env directly

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

export default app;
