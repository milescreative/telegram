import { env } from './env.js';
import * as dotenv from 'dotenv';
import { Hono } from 'hono';
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

// Load environment variables
dotenv.config();

const app = new Hono();

// GET endpoint for health check
app.get('/', (c) => {
  const testenv = env({ process_env: process.env });
  return c.text('Telegram AI Assistant Server is running!');
});

// POST endpoint for Telegram webhook
app.post('/', async (c) => {
  try {
    const body = await c.req.json();
    console.log('Received message:', JSON.stringify(body, null, 2));

    if (!body.message) {
      return c.json({ error: 'No message in request' }, 400);
    }

    const parsed_env = env({ process_env: process.env });
    const { chat, text } = body.message;
    const botToken = parsed_env.TELEGRAM_BOT_TOKEN;

    // Immediately acknowledge the webhook
    c.header('Content-Type', 'application/json');

    // Process AI response in the background
    processAIResponse(chat.id, text, botToken).catch((error) => {
      console.error('Error processing AI response:', error);
      sendMessage(
        chat.id,
        '⚠️ An error occurred during response generation',
        botToken
      );
    });

    return c.json({ status: 'Processing request...' });
  } catch (error) {
    console.error('Error handling request:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// AI Response Processor with Streaming Simulation
async function processAIResponse(
  chatId: number,
  prompt: string,
  botToken: string
) {
  let messageId: number | undefined;
  let lastContent = '';
  let buffer = '';

  // Start the AI stream
  const result = streamText({
    model: openai('gpt-4'),
    prompt: prompt,
  });

  // Initial "typing" indicator
  await sendChatAction(chatId, 'typing', botToken);

  // Process stream in chunks
  for await (const delta of result.toDataStream()) {
    buffer += delta;

    // Send updates when we reach natural break points or every 20 characters
    if (/(\n|\. |! |\? |, )/.test(buffer) || buffer.length >= 20) {
      await updateMessage(chatId, buffer, botToken, messageId);
      buffer = '';
    }
  }

  // Send any remaining content
  if (buffer.length > 0) {
    await updateMessage(chatId, buffer, botToken, messageId);
  }

  // Finalize message
  if (messageId) {
    await editMessage(chatId, messageId, lastContent + ' ✅', botToken);
  }

  async function updateMessage(
    chatId: number,
    newContent: string,
    botToken: string,
    existingMessageId?: number
  ) {
    lastContent += newContent;

    try {
      if (existingMessageId) {
        await editMessage(
          chatId,
          existingMessageId,
          lastContent + ' ✍️',
          botToken
        );
      } else {
        const response = await sendMessage(
          chatId,
          lastContent + ' ✍️',
          botToken
        );
        messageId = response.message_id;
      }
    } catch (error) {
      console.error('Error updating message:', error);
      // Fallback to new message if editing fails
      const response = await sendMessage(chatId, lastContent, botToken);
      messageId = response.message_id;
    }

    // Reset typing indicator
    await sendChatAction(chatId, 'typing', botToken);
  }
}

// Telegram API Utilities
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
