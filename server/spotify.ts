import { SpotifyApi } from "@spotify/web-api-ts-sdk";

let connectionSettings: any;
let cachedClientCredentialsToken: { token: string; expiresAt: number } | null = null;

// Get access token using Client Credentials Flow (for public data like follower counts)
async function getClientCredentialsToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    console.log('⚠️ SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET not found, falling back to Replit integration');
    return null;
  }
  
  // Check if we have a valid cached token
  if (cachedClientCredentialsToken && cachedClientCredentialsToken.expiresAt > Date.now()) {
    return cachedClientCredentialsToken.token;
  }
  
  console.log('🎵 Using custom Spotify credentials for authentication');
  
  // Get new token using Client Credentials Flow
  const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
    },
    body: 'grant_type=client_credentials'
  });
  
  if (!tokenResponse.ok) {
    throw new Error(`Failed to get Spotify access token: ${tokenResponse.statusText}`);
  }
  
  const data = await tokenResponse.json();
  
  // Cache token (expires in 1 hour, we'll refresh 5 minutes early)
  cachedClientCredentialsToken = {
    token: data.access_token,
    expiresAt: Date.now() + ((data.expires_in - 300) * 1000)
  };
  
  return data.access_token;
}

async function getAccessToken() {
  // First, try custom Spotify credentials
  const customToken = await getClientCredentialsToken();
  if (customToken) {
    return {
      accessToken: customToken,
      clientId: process.env.SPOTIFY_CLIENT_ID!,
      refreshToken: null,
      expiresIn: 3600
    };
  }
  
  // Fallback to Replit Connectors API
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    const refreshToken = connectionSettings?.settings?.oauth?.credentials?.refresh_token;
    const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;
    const clientId = connectionSettings?.settings?.oauth?.credentials?.client_id;
    const expiresIn = connectionSettings.settings?.oauth?.credentials?.expires_in;
    return {accessToken, clientId, refreshToken, expiresIn};
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
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=spotify',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);
  
  if (!connectionSettings || !connectionSettings.settings) {
    console.warn('⚠️ Spotify connection not found or not configured properly');
    throw new Error('Spotify not connected - please authorize Spotify in Replit Integrations panel');
  }
  
  const refreshToken = connectionSettings?.settings?.oauth?.credentials?.refresh_token;
  const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;
  const clientId = connectionSettings?.settings?.oauth?.credentials?.client_id;
  const expiresIn = connectionSettings?.settings?.oauth?.credentials?.expires_in;
  
  if (!accessToken || !clientId || !refreshToken) {
    console.warn('⚠️ Spotify credentials incomplete:', { 
      hasAccessToken: !!accessToken, 
      hasClientId: !!clientId, 
      hasRefreshToken: !!refreshToken 
    });
    throw new Error('Spotify not connected');
  }
  return {accessToken, clientId, refreshToken, expiresIn};
}

export async function getUncachableSpotifyClient() {
  const {accessToken, clientId, refreshToken, expiresIn} = await getAccessToken();

  const spotify = SpotifyApi.withAccessToken(clientId, {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: expiresIn || 3600,
    refresh_token: refreshToken || undefined,
  });

  return spotify;
}


export interface AudioFeatures {
  danceability: number;
  energy: number;
  valence: number;
  tempo: number;
  acousticness: number;
  instrumentalness: number;
  speechiness: number;
  liveness: number;
  key: number;
  mode: number;
}

// Extract Spotify artist ID from URL
function extractSpotifyArtistId(spotifyUrl: string): string | null {
  try {
    // Format: https://open.spotify.com/artist/1234567890abcdef
    const match = spotifyUrl.match(/\/artist\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
  } catch (error) {
    console.error('Error extracting Spotify artist ID:', error);
    return null;
  }
}

// Search track by artist ID (more accurate)
export async function searchTrackByArtistId(trackTitle: string, artistId: string): Promise<string | null> {
  try {
    const spotify = await getUncachableSpotifyClient();
    
    // First try to find in artist's top tracks (most common case)
    const artistTracks = await spotify.artists.topTracks(artistId, 'US');
    const normalizedTitle = trackTitle.toLowerCase().trim();
    const exactMatch = artistTracks.tracks.find(track => 
      track.name.toLowerCase().trim() === normalizedTitle
    );
    
    if (exactMatch) {
      return exactMatch.id;
    }
    
    // If not in top tracks, search by title and filter by artist ID
    const searchQuery = `track:${trackTitle}`;
    const results = await spotify.search(searchQuery, ['track'], undefined, 20);
    
    // Find track by this specific artist
    const trackByArtist = results.tracks.items.find(track =>
      track.artists.some(artist => artist.id === artistId) &&
      track.name.toLowerCase().trim().includes(normalizedTitle)
    );
    
    if (trackByArtist) {
      return trackByArtist.id;
    }
    
    return null;
  } catch (error) {
    console.error('Error searching track by artist ID:', error);
    return null;
  }
}

export async function searchTrackOnSpotify(trackTitle: string, artistName: string, spotifyUrl?: string): Promise<string | null> {
  try {
    // If Spotify URL is provided, try to use artist ID for more accurate search
    if (spotifyUrl) {
      const artistId = extractSpotifyArtistId(spotifyUrl);
      if (artistId) {
        const trackId = await searchTrackByArtistId(trackTitle, artistId);
        if (trackId) {
          return trackId;
        }
      }
    }
    
    // Fallback to name-based search
    const spotify = await getUncachableSpotifyClient();
    const searchQuery = `track:${trackTitle} artist:${artistName}`;
    const results = await spotify.search(searchQuery, ['track'], undefined, 1);
    
    if (results.tracks.items.length > 0) {
      return results.tracks.items[0].id;
    }
    return null;
  } catch (error) {
    console.error('Error searching track on Spotify:', error);
    return null;
  }
}

export async function getTrackAudioFeatures(trackId: string): Promise<AudioFeatures | null> {
  try {
    const spotify = await getUncachableSpotifyClient();
    const features = await spotify.tracks.audioFeatures(trackId);
    
    return {
      danceability: features.danceability,
      energy: features.energy,
      valence: features.valence,
      tempo: features.tempo,
      acousticness: features.acousticness,
      instrumentalness: features.instrumentalness,
      speechiness: features.speechiness,
      liveness: features.liveness,
      key: features.key,
      mode: features.mode,
    };
  } catch (error) {
    console.error('Error getting audio features:', error);
    return null;
  }
}

export interface PlaylistRecommendation {
  name: string;
  description: string;
  matchScore: number;
  matchReasons: string[];
  genre?: string;
  targetAudience?: string;
}

const CURATED_PLAYLISTS = [
  {
    name: "Chill Vibes",
    characteristics: { 
      acousticness: [0.4, 1.0], 
      energy: [0.0, 0.5], 
      valence: [0.4, 0.8],
      tempo: [60, 120] 
    },
    genre: "Acoustic, Indie",
    targetAudience: "Relaxation, Study, Background"
  },
  {
    name: "Energy Boost",
    characteristics: { 
      energy: [0.7, 1.0], 
      danceability: [0.6, 1.0], 
      valence: [0.5, 1.0],
      tempo: [120, 180] 
    },
    genre: "Pop, Dance, EDM",
    targetAudience: "Workout, Party, Motivation"
  },
  {
    name: "Melancholic Moods",
    characteristics: { 
      valence: [0.0, 0.4], 
      acousticness: [0.3, 1.0], 
      energy: [0.0, 0.5],
      tempo: [60, 110] 
    },
    genre: "Indie, Alternative, Singer-Songwriter",
    targetAudience: "Reflection, Late Night, Emotional"
  },
  {
    name: "Dance Floor Hits",
    characteristics: { 
      danceability: [0.7, 1.0], 
      energy: [0.6, 1.0], 
      valence: [0.6, 1.0],
      tempo: [110, 140] 
    },
    genre: "House, Dance Pop, Latin",
    targetAudience: "Clubs, Parties, Dancing"
  },
  {
    name: "Focus & Concentration",
    characteristics: { 
      instrumentalness: [0.5, 1.0], 
      energy: [0.3, 0.6], 
      speechiness: [0.0, 0.2],
      tempo: [80, 120] 
    },
    genre: "Instrumental, Ambient, Classical",
    targetAudience: "Study, Work, Deep Focus"
  },
  {
    name: "Happy Pop",
    characteristics: { 
      valence: [0.7, 1.0], 
      energy: [0.6, 0.9], 
      danceability: [0.5, 0.9],
      tempo: [100, 140] 
    },
    genre: "Pop, Indie Pop",
    targetAudience: "Feel Good, Uplifting, Daytime"
  },
  {
    name: "Live Sessions",
    characteristics: { 
      liveness: [0.4, 1.0], 
      acousticness: [0.3, 0.8],
      energy: [0.4, 0.8] 
    },
    genre: "Live Recordings, Acoustic Sessions",
    targetAudience: "Concert Feel, Authentic Sound"
  },
  {
    name: "Rap & Hip-Hop",
    characteristics: { 
      speechiness: [0.3, 1.0], 
      energy: [0.5, 0.9], 
      danceability: [0.6, 0.9],
      tempo: [80, 120] 
    },
    genre: "Hip-Hop, Rap, Trap",
    targetAudience: "Urban, Street, Youth"
  },
  {
    name: "Peaceful Acoustic",
    characteristics: { 
      acousticness: [0.7, 1.0], 
      instrumentalness: [0.0, 0.5], 
      energy: [0.2, 0.5],
      valence: [0.3, 0.7],
      tempo: [60, 100] 
    },
    genre: "Acoustic, Folk, Singer-Songwriter",
    targetAudience: "Coffee Shops, Intimate Settings"
  },
  {
    name: "Dark & Intense",
    characteristics: { 
      valence: [0.0, 0.3], 
      energy: [0.6, 1.0],
      mode: [0, 0],
      tempo: [100, 160] 
    },
    genre: "Metal, Rock, Dark Electronic",
    targetAudience: "Intense Emotions, Power"
  }
];

function calculateMatchScore(features: AudioFeatures, playlistCharacteristics: any): { score: number; reasons: string[] } {
  let score = 0;
  let maxScore = 0;
  const reasons: string[] = [];

  for (const [feature, range] of Object.entries(playlistCharacteristics)) {
    const [min, max] = range as [number, number];
    const value = features[feature as keyof AudioFeatures] as number;
    
    maxScore += 100;
    
    if (value >= min && value <= max) {
      score += 100;
      
      if (feature === 'danceability' && value > 0.7) {
        reasons.push(`Висока танцювальність (${Math.round(value * 100)}%)`);
      } else if (feature === 'energy' && value > 0.7) {
        reasons.push(`Висока енергія (${Math.round(value * 100)}%)`);
      } else if (feature === 'valence' && value > 0.7) {
        reasons.push(`Позитивний настрій (${Math.round(value * 100)}%)`);
      } else if (feature === 'valence' && value < 0.4) {
        reasons.push(`Меланхолійний настрій (${Math.round(value * 100)}%)`);
      } else if (feature === 'acousticness' && value > 0.6) {
        reasons.push(`Акустичне звучання (${Math.round(value * 100)}%)`);
      } else if (feature === 'instrumentalness' && value > 0.5) {
        reasons.push(`Інструментальний трек (${Math.round(value * 100)}%)`);
      } else if (feature === 'speechiness' && value > 0.3) {
        reasons.push(`Містить вокал/речь (${Math.round(value * 100)}%)`);
      } else if (feature === 'liveness' && value > 0.4) {
        reasons.push(`Має концертне звучання (${Math.round(value * 100)}%)`);
      } else if (feature === 'tempo') {
        reasons.push(`Темп: ${Math.round(value)} BPM`);
      }
    } else {
      const distance = value < min ? (min - value) / (max - min) : (value - max) / (max - min);
      score += Math.max(0, 100 * (1 - distance));
    }
  }

  return { 
    score: maxScore > 0 ? (score / maxScore) * 100 : 0, 
    reasons: reasons.slice(0, 3)
  };
}

export async function getPlaylistRecommendations(
  trackTitle: string, 
  artistName: string,
  spotifyUrl?: string
): Promise<PlaylistRecommendation[]> {
  try {
    const trackId = await searchTrackOnSpotify(trackTitle, artistName, spotifyUrl);
    if (!trackId) {
      throw new Error('Track not found on Spotify');
    }

    const features = await getTrackAudioFeatures(trackId);
    if (!features) {
      throw new Error('Could not retrieve audio features');
    }

    const recommendations: PlaylistRecommendation[] = CURATED_PLAYLISTS.map(playlist => {
      const { score, reasons } = calculateMatchScore(features, playlist.characteristics);
      
      return {
        name: playlist.name,
        description: `${playlist.genre} плейлист для ${playlist.targetAudience}`,
        matchScore: Math.round(score),
        matchReasons: reasons,
        genre: playlist.genre,
        targetAudience: playlist.targetAudience,
      };
    });

    return recommendations
      .filter(rec => rec.matchScore >= 40)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 5);
  } catch (error) {
    console.error('Error getting playlist recommendations:', error);
    throw error;
  }
}

export interface SpotifyTopTrack {
  id: string;
  name: string;
  popularity: number;
  albumName: string;
  albumImage: string;
  previewUrl: string | null;
  externalUrl: string;
  durationMs: number;
}

export async function getArtistTopTracks(artistId: string): Promise<SpotifyTopTrack[]> {
  try {
    const spotify = await getUncachableSpotifyClient();
    const topTracks = await spotify.artists.topTracks(artistId, 'US');
    
    return topTracks.tracks.map(track => ({
      id: track.id,
      name: track.name,
      popularity: track.popularity,
      albumName: track.album.name,
      albumImage: track.album.images[0]?.url || '',
      previewUrl: track.preview_url,
      externalUrl: track.external_urls.spotify,
      durationMs: track.duration_ms
    }));
  } catch (error) {
    console.error('Error getting artist top tracks:', error);
    throw error;
  }
}

export async function getMultipleTracksAudioFeatures(trackIds: string[]): Promise<AudioFeatures[]> {
  try {
    console.log(`🎵 Fetching audio features for ${trackIds.length} tracks`);
    
    const spotify = await getUncachableSpotifyClient();
    if (!spotify) {
      throw new Error('Could not create Spotify client');
    }
    
    const features = await spotify.tracks.audioFeatures(trackIds);
    
    console.log(`✅ Successfully fetched audio features for ${features.length} tracks`);
    
    return features.map(f => ({
      danceability: f.danceability,
      energy: f.energy,
      valence: f.valence,
      tempo: f.tempo,
      acousticness: f.acousticness,
      instrumentalness: f.instrumentalness,
      speechiness: f.speechiness,
      liveness: f.liveness,
      key: f.key,
      mode: f.mode,
    }));
  } catch (error) {
    console.error('Error getting multiple tracks audio features:', error);
    throw error;
  }
}

export interface RelatedArtist {
  id: string;
  name: string;
  popularity: number;
  followers: number;
  genres: string[];
  image: string;
  externalUrl: string;
}

export async function getRelatedArtists(artistId: string): Promise<RelatedArtist[]> {
  try {
    console.log(`🎵 Fetching related artists for artist ID: ${artistId}`);
    
    const spotify = await getUncachableSpotifyClient();
    if (!spotify) {
      throw new Error('Could not create Spotify client');
    }
    
    const response = await spotify.artists.relatedArtists(artistId);
    const related = response.artists;
    
    console.log(`✅ Found ${related.length} related artists for ${artistId}`);
    
    return related.map((artist: any) => ({
      id: artist.id,
      name: artist.name,
      popularity: artist.popularity,
      followers: artist.followers.total,
      genres: artist.genres,
      image: artist.images[0]?.url || '',
      externalUrl: artist.external_urls.spotify
    })).slice(0, 10);
  } catch (error) {
    console.error(`❌ Error getting related artists for ${artistId}:`, error);
    throw error;
  }
}
