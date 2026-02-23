import { google } from 'googleapis';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings?.settings?.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  const response = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-mail',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  );
  const data = await response.json();
  console.log('[GMAIL DEBUG] API Response:', JSON.stringify(data, null, 2));
  connectionSettings = data.items?.[0];
  console.log('[GMAIL DEBUG] Connection settings:', connectionSettings ? 'Found' : 'Not found');
  
  const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;
  console.log('[GMAIL DEBUG] Access token:', accessToken ? 'Present' : 'Missing');

  if (!connectionSettings || !accessToken) {
    throw new Error('Gmail not connected');
  }
  return accessToken;
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
// Always call this function again to get a fresh client.
export async function getUncachableGmailClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

/**
 * Helper function to encode email message in base64url format for Gmail API
 */
function encodeMessage(message: string): string {
  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Map notification types to English email subjects
 * Returns plain ASCII text without entity names to avoid encoding issues
 */
function getEmailSubject(notificationType: string): string {
  const subjectMap: Record<string, string> = {
    'RELEASE_CREATED': 'New Release Created',
    'MUSIC_VIDEO_CREATED': 'New Music Video Created',
    'MUSIC_VIDEO_UPDATED': 'Music Video Updated',
    'PITCHING_SUBMITTED': 'Pitching Submitted',
    'STREAMING_REPORT_UPLOADED': 'Streaming Report Uploaded',
    'STREAMING_REPORT_UPDATED': 'Streaming Report Updated',
    'PAYMENT_PROCESSED': 'Payment Processed',
    'RELEASE_STATUS_CHANGED': 'Release Status Changed',
    'WITHDRAWAL_REQUESTED': 'Withdrawal Request Submitted',
  };
  
  return subjectMap[notificationType] || 'Notification';
}

/**
 * Send email from admin to user
 * Subject: "New Message in Your Account"
 * Body: message + "Reply at muzika-dist.com"
 */
export async function sendAdminToUserEmail(
  userEmail: string,
  message: string
): Promise<void> {
  try {
    const gmail = await getUncachableGmailClient();
    
    const emailLines = [
      'From: Muzika Distribution <muzika.ua.distribution@gmail.com>',
      `To: ${userEmail}`,
      'Subject: New Message in Your Account',
      'Content-Type: text/plain; charset=utf-8',
      '',
      message,
      '',
      'Reply at muzika-dist.com'
    ];
    
    const encodedMessage = encodeMessage(emailLines.join('\n'));
    
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage
      }
    });
    
    console.log(`✉️ Admin email sent to ${userEmail}`);
  } catch (error) {
    console.error('Failed to send admin email:', error);
    throw new Error('Failed to send email from admin');
  }
}

/**
 * Send email from user to admin
 * Subject: "Message from Client" (plain ASCII to avoid encoding issues)
 * Body: message with organization name
 */
export async function sendUserToAdminEmail(
  organizationName: string,
  userEmail: string,
  message: string
): Promise<void> {
  try {
    const gmail = await getUncachableGmailClient();
    
    // Use plain ASCII subject, organization name is in the message body
    const emailLines = [
      `From: ${userEmail}`,
      'To: Muzika Distribution <muzika.ua.distribution@gmail.com>',
      'Subject: Message from Client',
      'Content-Type: text/plain; charset=utf-8',
      '',
      `Organization: ${organizationName}`,
      '',
      message
    ];
    
    const encodedMessage = encodeMessage(emailLines.join('\n'));
    
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage
      }
    });
    
    console.log(`✉️ User email sent from ${organizationName} (${userEmail}) to admin`);
  } catch (error) {
    console.error('Failed to send user email:', error);
    throw new Error('Failed to send email to admin');
  }
}

/**
 * Send notification email to admin
 * This duplicates in-app notifications to email for better visibility
 * Subject: English notification type (plain ASCII)
 * Body: notification message (can be in any language, properly encoded)
 */
export async function sendNotificationEmail(
  title: string,
  message: string,
  notificationType?: string
): Promise<void> {
  // Email notifications to admin disabled - using only Telegram and in-app notifications
  console.log(`📧 Email notification skipped (disabled): ${notificationType || title}`);
  return;
  
  try {
    const gmail = await getUncachableGmailClient();
    
    // Use English subject based on notification type
    // If no type provided, use "Notification" as fallback (avoid non-ASCII title)
    const emailSubject = notificationType 
      ? getEmailSubject(notificationType)
      : 'Notification';
    
    const emailLines = [
      'From: Muzika Distribution <muzika.ua.distribution@gmail.com>',
      'To: Muzika Distribution <muzika.ua.distribution@gmail.com>',
      `Subject: ${emailSubject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      message
    ];
    
    const encodedMessage = encodeMessage(emailLines.join('\n'));
    
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage
      }
    });
    
    console.log(`✉️ Notification email sent: ${emailSubject}`);
  } catch (error) {
    console.error('Failed to send notification email:', error);
    // Don't throw - notification emails are supplementary, shouldn't break main flow
  }
}

/**
 * Send password reset email to user
 * Subject: "Password Reset Request"
 * Body: Reset link with token
 */
export async function sendPasswordResetEmail(
  userEmail: string,
  resetToken: string,
  userLanguage?: string
): Promise<void> {
  try {
    const gmail = await getUncachableGmailClient();
    
    const isProduction = process.env.NODE_ENV === 'production';
    const baseUrl = isProduction 
      ? 'https://muzika-dist.com'
      : process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
        : 'https://muzika-dist.com';
    
    const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;
    
    // Get localized content based on user's preferred language
    const content = getPasswordResetContent(userLanguage || 'uk');
    
    const emailLines = [
      'From: Muzika Distribution <muzika.ua.distribution@gmail.com>',
      `To: ${userEmail}`,
      'Subject: =?UTF-8?B?' + Buffer.from(content.subject).toString('base64') + '?=',
      'Content-Type: text/html; charset=utf-8',
      '',
      `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px;">
    <tr>
      <td style="padding: 30px; text-align: center;">
        <span style="font-size: 32px; font-weight: bold; background: linear-gradient(135deg, #8B5CF6, #EC4899); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">muzika-dist.com</span>
      </td>
    </tr>
    <tr>
      <td style="padding: 0 30px;">
        <h2 style="color: #333; margin: 0 0 20px 0;">${content.title}</h2>
        <p style="margin: 0 0 20px 0;">${content.message}</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 0 30px 20px 30px;">
        <p style="margin: 0 0 10px 0;"><strong>${content.clickLink}</strong></p>
        <p style="word-break: break-all; font-size: 14px; margin: 0 0 20px 0;"><a href="${resetLink}" target="_blank" style="color: #8B5CF6; text-decoration: underline;">${resetLink}</a></p>
        <p style="color: #666; font-size: 14px; margin: 0;">${content.expiry}</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 20px 30px; border-top: 1px solid #eee;">
        <p style="color: #999; font-size: 12px; margin: 0 0 10px 0;">${content.ignore}</p>
        <p style="color: #999; font-size: 12px; margin: 0;">${content.footer}</p>
      </td>
    </tr>
  </table>
</body>
</html>`
    ];
    
    const encodedMessage = encodeMessage(emailLines.join('\n'));
    
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage
      }
    });
    
    console.log(`✉️ Password reset email sent to ${userEmail}`);
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    throw new Error('Failed to send password reset email');
  }
}

/**
 * Get localized content for password reset email
 */
function getPasswordResetContent(language: string): {
  subject: string;
  title: string;
  message: string;
  clickLink: string;
  expiry: string;
  ignore: string;
  footer: string;
} {
  const translations: Record<string, ReturnType<typeof getPasswordResetContent>> = {
    uk: {
      subject: 'Скидання паролю - muzika-dist.com',
      title: 'Скидання паролю',
      message: 'Ви отримали цей лист, тому що запросили скидання паролю для вашого облікового запису muzika-dist.com.',
      clickLink: 'Натисніть на посилання нижче, щоб скинути пароль:',
      expiry: 'Це посилання дійсне протягом 1 години.',
      ignore: 'Якщо ви не запитували скидання паролю, просто проігноруйте цей лист.',
      footer: '© muzika-dist.com'
    },
    pl: {
      subject: 'Resetowanie hasła - muzika-dist.com',
      title: 'Resetowanie hasła',
      message: 'Otrzymujesz tę wiadomość, ponieważ poprosiłeś o zresetowanie hasła do swojego konta muzika-dist.com.',
      clickLink: 'Kliknij poniższy link, aby zresetować hasło:',
      expiry: 'Ten link jest ważny przez 1 godzinę.',
      ignore: 'Jeśli nie prosiłeś o zresetowanie hasła, po prostu zignoruj tę wiadomość.',
      footer: '© muzika-dist.com'
    },
    en: {
      subject: 'Password Reset - muzika-dist.com',
      title: 'Password Reset',
      message: 'You are receiving this email because you requested a password reset for your muzika-dist.com account.',
      clickLink: 'Click the link below to reset your password:',
      expiry: 'This link is valid for 1 hour.',
      ignore: 'If you did not request a password reset, please ignore this email.',
      footer: '© muzika-dist.com'
    }
  };
  
  return translations[language] || translations.uk;
}
