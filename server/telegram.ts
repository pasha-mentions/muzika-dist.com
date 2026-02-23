/**
 * Telegram Bot Integration
 * Sends notifications to Telegram chats (admin + organizations)
 */

import type { IStorage } from './storage';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID; // Admin chat

interface TelegramMessage {
  chat_id: string;
  text: string;
  parse_mode: 'HTML';
  disable_web_page_preview?: boolean;
}

/**
 * Sends a notification message to Telegram chat
 * Uses fire-and-forget pattern - errors are logged but don't break the flow
 * 
 * @param title - Notification title
 * @param message - Notification message
 */
export async function sendTelegramNotification(
  title: string,
  message: string
): Promise<void> {
  try {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.log('[TELEGRAM] Skipping - bot token or chat ID not configured');
      return;
    }

    // Format message with HTML for better readability
    const formattedText = `<b>🔔 ${title}</b>\n\n${message}`;

    const telegramMessage: TelegramMessage = {
      chat_id: TELEGRAM_CHAT_ID,
      text: formattedText,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    };

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(telegramMessage),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[TELEGRAM] Failed to send notification:', errorData);
      return;
    }

    const data = await response.json();
    console.log('[TELEGRAM] Notification sent successfully:', data.result?.message_id);
  } catch (error) {
    // Errors are logged but don't break the flow
    console.error('[TELEGRAM] Error sending notification:', error);
  }
}

/**
 * Sends a notification to a specific chat (organization's Telegram group)
 */
export async function sendTelegramMessageToChat(
  chatId: string,
  title: string,
  message: string
): Promise<boolean> {
  try {
    if (!TELEGRAM_BOT_TOKEN) {
      console.log('[TELEGRAM] Skipping - bot token not configured');
      return false;
    }

    const formattedText = `<b>🔔 ${title}</b>\n\n${message}`;

    const telegramMessage: TelegramMessage = {
      chat_id: chatId,
      text: formattedText,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    };

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(telegramMessage),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[TELEGRAM] Failed to send to chat:', chatId, errorData);
      return false;
    }

    console.log('[TELEGRAM] Message sent to chat:', chatId);
    return true;
  } catch (error) {
    console.error('[TELEGRAM] Error sending to chat:', chatId, error);
    return false;
  }
}

/**
 * Sends notification to organization's Telegram chat if configured
 */
export async function sendOrgTelegramNotification(
  storage: IStorage,
  orgId: string,
  title: string,
  message: string
): Promise<boolean> {
  try {
    const org = await storage.getOrganization(orgId);
    if (!org?.telegramChatId) {
      console.log('[TELEGRAM] Org has no Telegram chat configured:', orgId);
      return false;
    }

    return await sendTelegramMessageToChat(org.telegramChatId, title, message);
  } catch (error) {
    console.error('[TELEGRAM] Error sending org notification:', error);
    return false;
  }
}

/**
 * Generates a unique verification code
 */
export function generateVerificationCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 to avoid confusion
  let code = 'MZK-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Telegram webhook update interface
 */
interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      first_name: string;
      username?: string;
    };
    chat: {
      id: number;
      type: 'private' | 'group' | 'supergroup' | 'channel';
      title?: string;
    };
    text?: string;
    date: number;
  };
}

/**
 * Handles incoming Telegram webhook updates
 */
export async function handleTelegramWebhook(
  storage: IStorage,
  update: TelegramUpdate
): Promise<{ success: boolean; message?: string }> {
  try {
    const message = update.message;
    if (!message?.text) {
      return { success: true }; // Ignore non-text messages
    }

    const chatId = message.chat.id.toString();
    const text = message.text.trim();

    // Handle /start command
    if (text === '/start') {
      await sendTelegramMessageToChat(
        chatId,
        'Вітаємо в Muzika Bot! 👋',
        'Щоб підключити сповіщення для вашої організації:\n\n' +
        '1. Зайдіть в Muzika → Налаштування → Організація → Інтеграції\n' +
        '2. Натисніть "Підключити Telegram"\n' +
        '3. Скопіюйте код та надішліть його сюди\n\n' +
        'Код має формат: <code>MZK-XXXXXX</code>'
      );
      return { success: true };
    }

    // Check if this looks like a verification code
    const codeMatch = text.match(/^MZK-[A-Z0-9]{6}$/i);
    if (codeMatch) {
      const code = codeMatch[0].toUpperCase();
      
      // Use atomic transaction to link chat - prevents race conditions
      const result = await storage.linkTelegramChatToOrg(code, chatId);
      
      if (!result.success) {
        const errorMessages: Record<string, { title: string; message: string }> = {
          'CODE_NOT_FOUND': {
            title: 'Код не знайдено ❌',
            message: 'Цей код не існує або вже був використаний. Спробуйте згенерувати новий код в налаштуваннях Muzika.'
          },
          'CODE_EXPIRED': {
            title: 'Код прострочено ⏰',
            message: 'Термін дії коду закінчився. Згенеруйте новий код в налаштуваннях Muzika.'
          },
          'CODE_ALREADY_USED': {
            title: 'Код вже використано ⚠️',
            message: 'Цей код вже був використаний. Згенеруйте новий код якщо потрібно.'
          },
          'ORG_NOT_FOUND': {
            title: 'Помилка ❌',
            message: 'Організацію не знайдено. Зверніться до підтримки.'
          }
        };
        
        const errorInfo = errorMessages[result.error || ''] || {
          title: 'Помилка ❌',
          message: 'Щось пішло не так. Спробуйте ще раз або зверніться до підтримки.'
        };
        
        await sendTelegramMessageToChat(chatId, errorInfo.title, errorInfo.message);
        return { success: true };
      }

      const chatType = message.chat.type === 'private' ? 'особистий чат' : 
                       message.chat.title || 'група';

      await sendTelegramMessageToChat(
        chatId,
        'Telegram підключено! ✅',
        `Сповіщення для <b>${result.orgName}</b> тепер надходитимуть в цей ${chatType}.\n\n` +
        'Ви отримуватимете сповіщення про:\n' +
        '• Зміни статусу релізів\n' +
        '• Нові повідомлення від підтримки\n' +
        '• Важливі оновлення платформи'
      );

      console.log('[TELEGRAM] Organization linked:', result.orgName, 'to chat:', chatId);
      return { success: true, message: 'Organization linked successfully' };
    }

    // Unknown message - provide help
    if (message.chat.type === 'private') {
      await sendTelegramMessageToChat(
        chatId,
        'Потрібна допомога? 🤔',
        'Надішліть код верифікації у форматі <code>MZK-XXXXXX</code> або напишіть /start для інструкцій.'
      );
    }

    return { success: true };
  } catch (error) {
    console.error('[TELEGRAM] Webhook error:', error);
    return { success: false, message: 'Internal error' };
  }
}

/**
 * Sets up the Telegram webhook URL
 */
export async function setupTelegramWebhook(webhookUrl: string): Promise<boolean> {
  try {
    if (!TELEGRAM_BOT_TOKEN) {
      console.log('[TELEGRAM] Cannot setup webhook - bot token not configured');
      return false;
    }

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ['message'],
      }),
    });

    const data = await response.json();
    if (data.ok) {
      console.log('[TELEGRAM] Webhook set successfully:', webhookUrl);
      return true;
    } else {
      console.error('[TELEGRAM] Failed to set webhook:', data);
      return false;
    }
  } catch (error) {
    console.error('[TELEGRAM] Error setting webhook:', error);
    return false;
  }
}
