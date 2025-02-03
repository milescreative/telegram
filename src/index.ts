import { env } from './env.js';
import * as dotenv from 'dotenv';
import { Hono } from 'hono';
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { chatDB } from './db.js';
import { handleNotification, getNotificationStatus } from './notify.js';

dotenv.config();
const parsed_env = env({ process_env: process.env });
const app = new Hono();

// Debug log for routes
console.log('\n[DEBUG] Registered routes:');
console.log('GET /', '- Main endpoint');
console.log('POST /', '- Main POST endpoint');
console.log('GET /notify', '- Notification status endpoint');
console.log('POST /notify', '- Notification handler endpoint\n');

// GET endpoint remains the same
app.get('/', (c) => {
  const testenv = env({ process_env: process.env });
  return c.text('Telegram AI Assistant Server is running!');
});

// POST endpoint with proper streaming implementation
app.post('/', async (c) => {
  try {
    const body = await c.req.json();

    // Validate message structure
    if (!body.message?.chat?.id || !body.message?.text) {
      return c.json({ error: 'Invalid message format' }, 400);
    }

    const { message } = body;
    const botToken = parsed_env.TELEGRAM_BOT_TOKEN;

    // Acknowledge immediately
    c.header('Content-Type', 'application/json');

    // Process in background
    processAIResponse(message.chat.id, message.text, botToken, message).catch(
      (error) => {
        console.error('AI Processing Error:', error);
        sendMessage(message.chat.id, '⚠️ Error generating response', botToken);
      }
    );

    return c.json({ status: 'Processing...' });
  } catch (error) {
    console.error('Request Handling Error:', error);
    return c.json({ error: 'Server Error' }, 500);
  }
});

// Update notification endpoints
app.post('/notify', handleNotification);
app.get('/notify', getNotificationStatus);

async function processAIResponse(
  chatId: number,
  prompt: string,
  botToken: string,
  message: {
    from: {
      id: number;
      first_name: string;
      last_name?: string;
    };
  }
) {
  let messageId: number | undefined;
  let fullContent = '';
  let lastUpdate = Date.now();
  const updateDebounce = 500; // Minimum time between updates in ms

  // Get recent chat history
  const recentMessages = chatDB.getRecentMessages(chatId);

  // Format conversation history for context
  const conversationHistory = recentMessages
    .map(
      (msg) => `${msg.user_name}: ${msg.message_text}\nAI: ${msg.ai_response}\n`
    )
    .join('\n');

  // Add conversation history to system prompt
  const systemPrompt = `You are a helpful assistant. Here's the recent conversation history:\n\n${conversationHistory}`;

  const result = await streamText({
    model: openai('gpt-4'),
    system: systemPrompt,
    prompt: prompt,
  });

  // Show initial typing indicator
  await sendChatAction(chatId, 'typing', botToken);

  // Process text stream
  for await (const textDelta of result.textStream) {
    fullContent += textDelta;

    // Determine if we should update based on content or timing
    const shouldUpdate =
      hasNaturalBreak(textDelta) ||
      fullContent.length % 50 < textDelta.length || // Approximate every 50 chars
      Date.now() - lastUpdate >= updateDebounce;

    if (shouldUpdate) {
      await debouncedUpdate();
    }
  }

  // Final update with complete content
  await updateMessage(fullContent);

  // Add completion indicator
  if (messageId) {
    await editMessage(chatId, messageId, `${fullContent} ✅`, botToken);
  }

  // After generating the complete response, save to database
  await chatDB.saveMessage(
    chatId,
    message.from.id,
    `${message.from.first_name} ${message.from.last_name || ''}`.trim(),
    prompt,
    fullContent,
    'gpt-4'
  );

  async function debouncedUpdate() {
    const now = Date.now();
    if (now - lastUpdate >= updateDebounce) {
      await updateMessage(fullContent);
      lastUpdate = now;
    }
  }

  async function updateMessage(content: string) {
    try {
      if (messageId) {
        // Edit existing message with new content
        await editMessage(chatId, messageId, `${content} ✍️`, botToken);
      } else {
        // Send initial message
        const response = await sendMessage(chatId, `${content} ✍️`, botToken);
        messageId = response.message_id;
      }
      // Reset typing indicator
      await sendChatAction(chatId, 'typing', botToken);
    } catch (error) {
      console.error('Message update failed:', error);
      // Fallback to new message if editing fails
      const response = await sendMessage(chatId, content, botToken);
      messageId = response.message_id;
    }
  }
}

// Helper to detect natural break points in new content
function hasNaturalBreak(text: string): boolean {
  return /([.?!]\s|\n|,\s)/.test(text);
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

export default {
  port: process.env.NODE_ENV === 'production' ? 3000 : 3333,
  fetch: app.fetch,
};
