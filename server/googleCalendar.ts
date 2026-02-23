import { google } from 'googleapis';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
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

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-calendar',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Calendar not connected');
  }
  return accessToken;
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
// Always call this function again to get a fresh client.
async function getUncachableGoogleCalendarClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

// Format date for calendar event (Ukrainian format)
function formatDateUkrainian(date: Date): string {
  const months = [
    'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
    'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'
  ];
  
  const day = date.getDate();
  const month = months[date.getMonth()];
  
  return `${day} ${month}`;
}

interface CreateReleaseEventParams {
  releaseDate: Date;
  artistName: string;
  releaseTitle: string;
  calendarEmail: string;
}

export async function createReleaseCalendarEvent({
  releaseDate,
  artistName,
  releaseTitle,
  calendarEmail
}: CreateReleaseEventParams) {
  console.log(`📅 [Google Calendar] Starting event creation:`, {
    releaseDate: releaseDate.toISOString(),
    artistName,
    releaseTitle,
    calendarEmail
  });
  
  try {
    console.log(`📅 [Google Calendar] Getting calendar client...`);
    const calendar = await getUncachableGoogleCalendarClient();
    console.log(`✅ [Google Calendar] Calendar client obtained successfully`);
    
    // Format event summary
    const dateFormatted = formatDateUkrainian(releaseDate);
    const summary = `${artistName} – ${releaseTitle}`;
    
    // Create all-day event
    // Note: For all-day events, end date must be the next day (exclusive)
    const startDate = releaseDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const endDate = new Date(releaseDate);
    endDate.setDate(endDate.getDate() + 1);
    const endDateStr = endDate.toISOString().split('T')[0];
    
    const event = {
      summary: summary,
      description: `Реліз: ${releaseTitle}\nАртист: ${artistName}\nДата виходу: ${dateFormatted}`,
      start: {
        date: startDate,
      },
      end: {
        date: endDateStr,
      },
      // Add reminder 1 day before
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 }, // 1 day before
          { method: 'popup', minutes: 24 * 60 },
        ],
      },
    };

    console.log(`📅 [Google Calendar] Event object prepared:`, event);
    console.log(`📅 [Google Calendar] Inserting event into calendar: ${calendarEmail}`);

    // Create event in the specified calendar
    const response = await calendar.events.insert({
      calendarId: calendarEmail,
      requestBody: event,
    });

    console.log(`✅✅✅ Calendar event created successfully!`);
    console.log(`Event summary: ${summary}`);
    console.log(`Event link: ${response.data.htmlLink}`);
    console.log(`Event ID: ${response.data.id}`);
    return response.data;
  } catch (error) {
    console.error('❌❌❌ Failed to create calendar event:', error);
    console.error('Error details:', {
      name: (error as Error).name,
      message: (error as Error).message,
      stack: (error as Error).stack
    });
    throw error;
  }
}
