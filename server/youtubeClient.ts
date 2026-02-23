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
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=youtube',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('YouTube not connected');
  }
  return accessToken;
}

export async function getUncachableYouTubeClient() {
  const accessToken = await getAccessToken();
  
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });
  
  return google.youtube({ version: 'v3', auth: oauth2Client });
}

export async function resolveYouTubeHandleToChannelId(handle: string): Promise<string | null> {
  try {
    const youtube = await getUncachableYouTubeClient();
    
    const cleanHandle = handle.startsWith('@') ? handle : '@' + handle;
    
    const response = await youtube.channels.list({
      part: ['id'],
      forHandle: cleanHandle
    });
    
    if (response.data.items && response.data.items.length > 0) {
      const channelId = response.data.items[0].id;
      return channelId || null;
    }
    
    return null;
  } catch (error) {
    console.error(`Error resolving YouTube handle ${handle}:`, error);
    return null;
  }
}

export async function fetchYouTubeSubscriberCountViaOAuth(channelId: string): Promise<number | null> {
  try {
    const youtube = await getUncachableYouTubeClient();
    
    const response = await youtube.channels.list({
      part: ['statistics'],
      id: [channelId]
    });
    
    if (response.data.items && response.data.items.length > 0) {
      const subscriberCount = response.data.items[0].statistics?.subscriberCount;
      return subscriberCount ? parseInt(subscriberCount, 10) : null;
    }
    
    return null;
  } catch (error) {
    console.error(`Error fetching YouTube subscriber count for channel ${channelId}:`, error);
    return null;
  }
}

export async function fetchYouTubeChannelInfo(channelId: string): Promise<{ title: string; avatar: string; subscriberCount: number } | null> {
  try {
    const youtube = await getUncachableYouTubeClient();
    
    const response = await youtube.channels.list({
      part: ['snippet', 'statistics'],
      id: [channelId]
    });
    
    if (response.data.items && response.data.items.length > 0) {
      const channel = response.data.items[0];
      const title = channel.snippet?.title || '';
      const avatar = channel.snippet?.thumbnails?.high?.url || channel.snippet?.thumbnails?.default?.url || '';
      const subscriberCount = channel.statistics?.subscriberCount ? parseInt(channel.statistics.subscriberCount, 10) : 0;
      
      return { title, avatar, subscriberCount };
    }
    
    return null;
  } catch (error) {
    console.error(`Error fetching YouTube channel info for channel ${channelId}:`, error);
    return null;
  }
}

export interface SimilarChannel {
  id: string;
  title: string;
  subscriberCount: number;
  avatar: string;
  description: string;
  url: string;
}

export async function getFeaturedChannels(channelId: string): Promise<SimilarChannel[]> {
  try {
    console.log(`🎬 Fetching featured channels for ${channelId}`);
    const youtube = await getUncachableYouTubeClient();
    
    const response = await youtube.channels.list({
      part: ['brandingSettings'],
      id: [channelId]
    });
    
    if (!response.data.items || response.data.items.length === 0) {
      console.log('⚠️ No channel found');
      return [];
    }
    
    const featuredChannelIds = response.data.items[0].brandingSettings?.channel?.featuredChannelsUrls || [];
    
    if (featuredChannelIds.length === 0) {
      console.log('⚠️ No featured channels found');
      return [];
    }
    
    console.log(`✅ Found ${featuredChannelIds.length} featured channels`);
    
    const channelsResponse = await youtube.channels.list({
      part: ['snippet', 'statistics'],
      id: featuredChannelIds.slice(0, 5)
    });
    
    if (!channelsResponse.data.items) {
      return [];
    }
    
    return channelsResponse.data.items.map(channel => ({
      id: channel.id || '',
      title: channel.snippet?.title || '',
      subscriberCount: parseInt(channel.statistics?.subscriberCount || '0', 10),
      avatar: channel.snippet?.thumbnails?.high?.url || channel.snippet?.thumbnails?.default?.url || '',
      description: channel.snippet?.description || '',
      url: `https://www.youtube.com/channel/${channel.id}`
    }));
  } catch (error) {
    console.error('Error getting featured channels:', error);
    return [];
  }
}

export async function searchSimilarChannels(channelId: string, userCountry: string | null = null): Promise<SimilarChannel[]> {
  try {
    console.log(`🔍 Searching for similar channels to ${channelId} (user country: ${userCountry || 'not specified'})`);
    const youtube = await getUncachableYouTubeClient();
    
    // Get source channel profile with extended metadata
    const channelResponse = await youtube.channels.list({
      part: ['snippet', 'statistics', 'brandingSettings', 'topicDetails'],
      id: [channelId]
    });
    
    if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
      console.log('⚠️ Channel not found');
      return [];
    }
    
    const channel = channelResponse.data.items[0];
    const sourceSubscriberCount = parseInt(channel.statistics?.subscriberCount || '0', 10);
    const description = channel.snippet?.description || '';
    const title = channel.snippet?.title || '';
    const channelCountry = channel.snippet?.country || null;
    const tags = (channel.brandingSettings?.channel?.keywords || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    
    // Build enhanced keyword search
    const keywords = extractGenreKeywords(description, title, tags);
    
    // Map country code to region code and language
    const countryConfig = getCountrySearchConfig(userCountry, channelCountry);
    
    let searchQuery = keywords.length > 0 ? keywords.join(' ') : 'music';
    
    // Add country-specific terms for Ukrainian artists
    if (countryConfig.regionCode === 'UA') {
      searchQuery = `${searchQuery} українська музика`;
    }
    
    console.log(`🔎 Searching with keywords: "${searchQuery}", region: ${countryConfig.regionCode}, language: ${countryConfig.relevanceLanguage}`);
    
    // Search with region and language preferences
    const searchParams: any = {
      part: ['snippet'],
      type: ['channel'],
      q: searchQuery,
      maxResults: 20, // Get more candidates for filtering
      order: 'relevance'
    };
    
    if (countryConfig.regionCode) {
      searchParams.regionCode = countryConfig.regionCode;
    }
    
    if (countryConfig.relevanceLanguage) {
      searchParams.relevanceLanguage = countryConfig.relevanceLanguage;
    }
    
    const searchResponse = await youtube.search.list(searchParams);
    
    if (!searchResponse.data.items || searchResponse.data.items.length === 0) {
      console.log('⚠️ No search results found');
      return [];
    }
    
    // Get candidate channel IDs
    const candidateIds = searchResponse.data.items
      .map(item => item.snippet?.channelId)
      .filter(id => id && id !== channelId)
      .slice(0, 20);
    
    if (candidateIds.length === 0) {
      return [];
    }
    
    // Fetch detailed info for all candidates
    const channelsResponse = await youtube.channels.list({
      part: ['snippet', 'statistics', 'brandingSettings'],
      id: candidateIds as string[]
    });
    
    if (!channelsResponse.data.items) {
      return [];
    }
    
    // Score and filter candidates
    const scoredChannels = channelsResponse.data.items.map(ch => {
      const subCount = parseInt(ch.statistics?.subscriberCount || '0', 10);
      const chCountry = ch.snippet?.country || null;
      const chDescription = ch.snippet?.description || '';
      const chTitle = ch.snippet?.title || '';
      
      // Calculate similarity score (0-1)
      let score = 0;
      
      // Country/language match (40% weight)
      if (countryConfig.regionCode === 'UA') {
        const hasUkrainianContent = detectUkrainianContent(chDescription, chTitle);
        const isUkrainianChannel = chCountry === 'UA';
        if (hasUkrainianContent || isUkrainianChannel) {
          score += 0.4;
        }
      } else if (chCountry === countryConfig.regionCode || chCountry === channelCountry) {
        score += 0.4;
      } else {
        score += 0.1; // Partial points for international channels
      }
      
      // Genre/keyword match (35% weight)
      const chTags = (ch.brandingSettings?.channel?.keywords || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
      const chKeywords = extractGenreKeywords(chDescription, chTitle, chTags);
      const commonKeywords = keywords.filter(k => chKeywords.includes(k));
      const keywordMatchRatio = keywords.length > 0 ? commonKeywords.length / keywords.length : 0;
      score += keywordMatchRatio * 0.35;
      
      // Subscriber count proximity (25% weight)
      const subscriberRatio = sourceSubscriberCount > 0 ? subCount / sourceSubscriberCount : 1;
      let sizeScore = 0;
      if (subscriberRatio >= 0.33 && subscriberRatio <= 3.0) {
        // Within ideal range
        sizeScore = 1.0 - Math.abs(Math.log10(subscriberRatio)) / Math.log10(3);
      } else if (subscriberRatio >= 0.2 && subscriberRatio <= 5.0) {
        // Acceptable range
        sizeScore = 0.5;
      }
      score += sizeScore * 0.25;
      
      return {
        id: ch.id || '',
        title: ch.snippet?.title || '',
        subscriberCount: subCount,
        avatar: ch.snippet?.thumbnails?.high?.url || ch.snippet?.thumbnails?.default?.url || '',
        description: chDescription,
        url: `https://www.youtube.com/channel/${ch.id}`,
        score,
        country: chCountry
      };
    });
    
    // Filter by subscriber count range (0.2x - 5x) and sort by score
    let minSubscribers = Math.max(100, sourceSubscriberCount * 0.2);
    let maxSubscribers = Math.max(1000, sourceSubscriberCount * 5.0);
    
    let filtered = scoredChannels
      .filter(ch => ch.subscriberCount >= minSubscribers && ch.subscriberCount <= maxSubscribers)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(({ score, country, ...ch }) => ch); // Remove scoring metadata
    
    // If we got too few results, widen the range gradually
    if (filtered.length < 3) {
      console.log(`⚠️ Only ${filtered.length} channels found in 0.2x-5x range, widening to 0.1x-10x`);
      minSubscribers = Math.max(50, sourceSubscriberCount * 0.1);
      maxSubscribers = Math.max(5000, sourceSubscriberCount * 10.0);
      
      filtered = scoredChannels
        .filter(ch => ch.subscriberCount >= minSubscribers && ch.subscriberCount <= maxSubscribers)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(({ score, country, ...ch }) => ch);
    }
    
    console.log(`✅ Found ${filtered.length} similar channels (scored and filtered from ${scoredChannels.length} candidates, range: ${Math.round(minSubscribers)}-${Math.round(maxSubscribers)} subscribers)`);
    return filtered;
  } catch (error) {
    console.error('Error searching similar channels:', error);
    return [];
  }
}

function extractGenreKeywords(description: string, title: string, tags: string[]): string[] {
  const text = `${description} ${title}`.toLowerCase();
  const allTags = tags.map(t => t.toLowerCase());
  
  const genres = [
    'hip-hop', 'hip hop', 'rap', 'rock', 'pop', 'jazz', 'classical', 'electronic',
    'edm', 'house', 'techno', 'folk', 'country', 'blues', 'reggae', 'metal',
    'indie', 'alternative', 'r&b', 'soul', 'funk', 'disco', 'punk', 'grunge',
    'ambient', 'trance', 'dubstep', 'trap', 'drill', 'latin', 'reggaeton',
    'ukrainian', 'ukrainian music', 'українська музика', 'ukrainian pop',
    'ukrainian rock', 'ukrainian hip-hop', 'ukrainian rap', 'хіп-хоп', 'реп',
    'рок', 'поп', 'електронна'
  ];
  
  const moods = [
    'chill', 'relaxing', 'energetic', 'upbeat', 'melancholic', 'dark',
    'happy', 'sad', 'emotional', 'powerful', 'smooth', 'aggressive'
  ];
  
  const keywords: Set<string> = new Set();
  
  // Check genres in text and tags
  for (const genre of genres) {
    if (text.includes(genre) || allTags.some(tag => tag.includes(genre))) {
      keywords.add(genre);
    }
  }
  
  // Check moods
  for (const mood of moods) {
    if (text.includes(mood) || allTags.includes(mood)) {
      keywords.add(mood);
    }
  }
  
  return Array.from(keywords).slice(0, 5); // Return up to 5 keywords
}

function detectUkrainianContent(description: string, title: string): boolean {
  const text = `${description} ${title}`;
  
  // Check for Cyrillic characters (Ukrainian/Russian alphabet)
  const cyrillicPattern = /[\u0400-\u04FF]/;
  if (cyrillicPattern.test(text)) {
    return true;
  }
  
  // Check for Ukrainian-specific keywords
  const ukrainianKeywords = [
    'україн', 'ukrainian', 'kyiv', 'київ', 'ukraine',
    'українська', 'ukrainian music', 'українська музика'
  ];
  
  const lowerText = text.toLowerCase();
  return ukrainianKeywords.some(keyword => lowerText.includes(keyword));
}

function getCountrySearchConfig(userCountry: string | null, channelCountry: string | null): {
  regionCode: string | null;
  relevanceLanguage: string | null;
} {
  // Prioritize user's country, fallback to channel's country
  const targetCountry = userCountry || channelCountry;
  
  // Extended country-specific configurations
  const countryMap: Record<string, { regionCode: string; relevanceLanguage: string }> = {
    // Eastern Europe
    'UA': { regionCode: 'UA', relevanceLanguage: 'uk' },
    'PL': { regionCode: 'PL', relevanceLanguage: 'pl' },
    'CZ': { regionCode: 'CZ', relevanceLanguage: 'cs' },
    'SK': { regionCode: 'SK', relevanceLanguage: 'sk' },
    'RO': { regionCode: 'RO', relevanceLanguage: 'ro' },
    'HU': { regionCode: 'HU', relevanceLanguage: 'hu' },
    'BG': { regionCode: 'BG', relevanceLanguage: 'bg' },
    // Western Europe
    'DE': { regionCode: 'DE', relevanceLanguage: 'de' },
    'FR': { regionCode: 'FR', relevanceLanguage: 'fr' },
    'ES': { regionCode: 'ES', relevanceLanguage: 'es' },
    'IT': { regionCode: 'IT', relevanceLanguage: 'it' },
    'NL': { regionCode: 'NL', relevanceLanguage: 'nl' },
    'BE': { regionCode: 'BE', relevanceLanguage: 'nl' },
    'PT': { regionCode: 'PT', relevanceLanguage: 'pt' },
    'GR': { regionCode: 'GR', relevanceLanguage: 'el' },
    'AT': { regionCode: 'AT', relevanceLanguage: 'de' },
    'CH': { regionCode: 'CH', relevanceLanguage: 'de' },
    // Anglo countries
    'US': { regionCode: 'US', relevanceLanguage: 'en' },
    'GB': { regionCode: 'GB', relevanceLanguage: 'en' },
    'CA': { regionCode: 'CA', relevanceLanguage: 'en' },
    'AU': { regionCode: 'AU', relevanceLanguage: 'en' },
    'IE': { regionCode: 'IE', relevanceLanguage: 'en' },
    // Nordic
    'SE': { regionCode: 'SE', relevanceLanguage: 'sv' },
    'NO': { regionCode: 'NO', relevanceLanguage: 'no' },
    'DK': { regionCode: 'DK', relevanceLanguage: 'da' },
    'FI': { regionCode: 'FI', relevanceLanguage: 'fi' },
    // Other
    'TR': { regionCode: 'TR', relevanceLanguage: 'tr' },
    'BR': { regionCode: 'BR', relevanceLanguage: 'pt' },
    'MX': { regionCode: 'MX', relevanceLanguage: 'es' },
    'AR': { regionCode: 'AR', relevanceLanguage: 'es' },
    'JP': { regionCode: 'JP', relevanceLanguage: 'ja' },
    'KR': { regionCode: 'KR', relevanceLanguage: 'ko' },
  };
  
  if (targetCountry && countryMap[targetCountry]) {
    return countryMap[targetCountry];
  }
  
  // If channel country is available but not in map, still use it for regionCode
  if (channelCountry) {
    return { regionCode: channelCountry, relevanceLanguage: null };
  }
  
  // Default: no region/language restriction
  return { regionCode: null, relevanceLanguage: null };
}
