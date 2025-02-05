import { Database } from 'bun:sqlite';

interface Message {
  id: number;
  chat_id: number;
  user_id: number;
  user_name: string;
  message_text: string;
  ai_response: string;
  model: string;
  timestamp: number;
}

export class ChatDB {
  private db: Database;

  constructor() {
    this.db = new Database(process.env.DB_PATH || 'chat_history.sqlite');
    this.init();
  }

  private init() {
    this.db
      .query(
        `
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        user_name TEXT NOT NULL,
        message_text TEXT NOT NULL,
        ai_response TEXT,
        model TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `
      )
      .run();

    // Create indexes for faster querying
    this.db
      .query(
        `
      CREATE INDEX IF NOT EXISTS idx_chat_timestamp
      ON messages(chat_id, timestamp)
    `
      )
      .run();
  }

  async saveMessage(
    chatId: number,
    userId: number,
    userName: string,
    messageText: string,
    aiResponse: string,
    model: string
  ) {
    const insert = this.db.prepare(`
      INSERT INTO messages (
        chat_id, user_id, user_name, message_text,
        ai_response, model, timestamp
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(
      chatId,
      userId,
      userName,
      messageText,
      aiResponse,
      model,
      Math.floor(Date.now() / 1000)
    );
  }

  getRecentMessages(chatId: number, limit: number = 3): Message[] {
    return this.db
      .query<Message, [number, number]>(
        `
      SELECT * FROM messages
      WHERE chat_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `
      )
      .all(chatId, limit);
  }
}

export const chatDB = new ChatDB();
