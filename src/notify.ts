import { Context } from 'hono';
import { env } from './env.js';

const parsed_env = env({ process_env: process.env });

async function sendTelegramNotification(message: string) {
  const chatId = parsed_env.TELEGRAM_NOTIFY_CHAT_ID;
  const botToken = parsed_env.TELEGRAM_NOTIFY_TOKEN;

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'MarkdownV2',
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to send Telegram message: ${await response.text()}`
    );
  }
}

export async function handleNotification(c: Context) {
  console.debug('\n[DEBUG] Notification received');

  try {
    const rawBody = await c.req.text();
    console.debug('[DEBUG] Raw body:', rawBody);

    const service = c.req.query('service') || 'unknown';
    const emoji = '⚠️';
    const alertPrefix = `${emoji} Alert from ${service}:`;

    // Clean up the body text by removing extra line breaks
    const cleanBody = rawBody
      .split('\n')
      .filter((line) => line.trim())
      .join('\n');

    // Escape special characters for MarkdownV2
    const escapedPrefix = alertPrefix.replace(
      /[_*[\]()~`>#+\-=|{}.!]/g,
      '\\$&'
    );
    const escapedBody = cleanBody.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
    const message = `*${escapedPrefix}*\n${escapedBody}`;

    // Send to Telegram
    await sendTelegramNotification(message);

    console.debug('[DEBUG] Notification details:', {
      method: c.req.method,
      service,
      message,
      req: c.req,
    });

    return c.json({ status: 'Notification forwarded to Telegram' });
  } catch (error) {
    console.error('[ERROR] Notification failed:', error);
    return c.json({ error: 'Failed to process notification' }, 400);
  }
}

export async function getNotificationStatus(c: Context) {
  console.debug(
    '[DEBUG] Status check from:',
    c.req.header('origin') || 'no-origin'
  );
  return c.json({
    status: 'active',
    timestamp: new Date().toISOString(),
  });
}
