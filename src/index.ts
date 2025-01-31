import { env } from './env.js';
import * as dotenv from 'dotenv';
import { Hono } from 'hono';
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

dotenv.config();

const app = new Hono();

// GET endpoint remains the same
app.get('/', (c) => {
  const testenv = env({ process_env: process.env });
  return c.text('Telegram AI Assistant Server is running!');
});

// POST endpoint with proper streaming implementation
app.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const parsed_env = env({ process_env: process.env });
    const { chat, text } = body.message;
    const botToken = parsed_env.TELEGRAM_BOT_TOKEN;

    // Acknowledge immediately
    c.header('Content-Type', 'application/json');

    // Process in background
    processAIResponse(chat.id, text, botToken).catch((error) => {
      console.error('AI Processing Error:', error);
      sendMessage(chat.id, '⚠️ Error generating response', botToken);
    });

    return c.json({ status: 'Processing...' });
  } catch (error) {
    console.error('Request Handling Error:', error);
    return c.json({ error: 'Server Error' }, 500);
  }
});

// Revised streaming implementation
async function processAIResponse(
  chatId: number,
  prompt: string,
  botToken: string
) {
  let messageId: number | undefined;
  let buffer = '';
  let lastUpdate = Date.now();
  const updateDebounce = 500; // ms between updates

  const result = await streamText({
    model: openai('gpt-4'),
    system: 'You are a helpful assistant',
    prompt: prompt,
  });

  // Show typing indicator
  await sendChatAction(chatId, 'typing', botToken);

  // Process text stream
  for await (const textDelta of result.textStream) {
    buffer += textDelta;

    // Split on sentence boundaries or every 100 characters
    const splitIndex = findNaturalSplit(buffer);

    if (splitIndex > 0 || buffer.length >= 100) {
      const sendText = buffer.slice(0, splitIndex > 0 ? splitIndex : 100);
      await debouncedUpdate(sendText);
      buffer = buffer.slice(sendText.length);
    }
  }

  // Send remaining text
  if (buffer.length > 0) {
    await updateMessage(buffer);
  }

  // Finalize message
  if (messageId) {
    await editMessage(chatId, messageId, buffer + ' ✅', botToken);
  }

  async function debouncedUpdate(content: string) {
    const now = Date.now();
    if (now - lastUpdate >= updateDebounce) {
      await updateMessage(content);
      lastUpdate = now;
    }
  }

  async function updateMessage(content: string) {
    try {
      const fullText = buffer;
      if (messageId) {
        await editMessage(chatId, messageId, fullText + ' ✍️', botToken);
      } else {
        const response = await sendMessage(chatId, fullText + ' ✍️', botToken);
        messageId = response.message_id;
      }
      await sendChatAction(chatId, 'typing', botToken);
    } catch (error) {
      console.error('Message Update Error:', error);
      // Fallback to new message
      const response = await sendMessage(chatId, content, botToken);
      messageId = response.message_id;
    }
  }
}

// Helper to find natural split points
function findNaturalSplit(text: string): number {
  // Split at sentence boundaries or newlines
  const sentenceEnd = Math.max(
    text.lastIndexOf('. '),
    text.lastIndexOf('! '),
    text.lastIndexOf('? '),
    text.lastIndexOf('\n')
  );

  return sentenceEnd > 0 ? sentenceEnd + 1 : -1;
}

// Telegram API functions remain the same
async function sendMessage(chatId: number, text: string, botToken: string) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  if (!response.ok)
    throw new Error(`Failed to send message: ${await response.text()}`);
  return response.json().then((data) => data.result);
}

async function editMessage(
  chatId: number,
  messageId: number,
  text: string,
  botToken: string
) {
  const url = `https://api.telegram.org/bot${botToken}/editMessageText`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text: text,
    }),
  });

  if (!response.ok)
    throw new Error(`Failed to edit message: ${await response.text()}`);
}

async function sendChatAction(
  chatId: number,
  action: string,
  botToken: string
) {
  const url = `https://api.telegram.org/bot${botToken}/sendChatAction`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action }),
  });
}

export default app;
