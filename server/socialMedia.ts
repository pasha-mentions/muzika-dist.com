import { getUncachableSpotifyClient } from './spotify';

export function extractSpotifyArtistId(url: string): string | null {
  if (!url) return null;
  
  try {
    const match = url.match(/\/artist\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
  } catch (error) {
    console.error('Error extracting Spotify artist ID:', error);
    return null;
  }
}

export function extractYouTubeChannelId(url: string): string | null {
  if (!url) return null;
  
  const channelPattern = /youtube\.com\/channel\/([a-zA-Z0-9_-]+)/;
  const match = url.match(channelPattern);
  
  if (match && match[1]) {
    return match[1];
  }
  
  return null;
}

export function extractYouTubeHandle(url: string): string | null {
  if (!url) return null;
  
  const handlePatterns = [
    /youtube\.com\/@([a-zA-Z0-9_.-]+)/,
    /youtube\.com\/c\/([a-zA-Z0-9_.-]+)/,
    /youtube\.com\/user\/([a-zA-Z0-9_.-]+)/
  ];
  
  for (const pattern of handlePatterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

export async function fetchSpotifyFollowerCount(artistId: string): Promise<number | null> {
  try {
    const spotify = await getUncachableSpotifyClient();
    const artist = await spotify.artists.get(artistId);
    
    return artist.followers?.total || null;
  } catch (error: any) {
    // Gracefully handle Spotify not being connected
    if (error?.message?.includes('Spotify not connected') || error?.message?.includes('X_REPLIT_TOKEN')) {
      console.warn(`⚠️ Spotify integration not configured. Please set up Spotify connection in Replit integrations.`);
      return null;
    }
    console.error(`❌ Error fetching Spotify follower count for artist ${artistId}:`, error);
    return null;
  }
}

// Extract Spotify playlist ID from URL
export function extractSpotifyPlaylistId(url: string): string | null {
  if (!url) return null;
  
  try {
    // Match patterns like:
    // https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M
    // spotify:playlist:37i9dQZF1DXcBWIGoYBM5M
    const urlPattern = /\/playlist\/([a-zA-Z0-9]+)/;
    const uriPattern = /spotify:playlist:([a-zA-Z0-9]+)/;
    
    const urlMatch = url.match(urlPattern);
    if (urlMatch) return urlMatch[1];
    
    const uriMatch = url.match(uriPattern);
    if (uriMatch) return uriMatch[1];
    
    return null;
  } catch (error) {
    console.error('Error extracting Spotify playlist ID:', error);
    return null;
  }
}

// Extract Spotify track ID from URL or ISRC
export function extractSpotifyTrackId(url: string): string | null {
  if (!url) return null;
  
  try {
    // Match patterns like:
    // https://open.spotify.com/track/37i9dQZF1DXcBWIGoYBM5M
    // spotify:track:37i9dQZF1DXcBWIGoYBM5M
    const urlPattern = /\/track\/([a-zA-Z0-9]+)/;
    const uriPattern = /spotify:track:([a-zA-Z0-9]+)/;
    
    const urlMatch = url.match(urlPattern);
    if (urlMatch) return urlMatch[1];
    
    const uriMatch = url.match(uriPattern);
    if (uriMatch) return uriMatch[1];
    
    return null;
  } catch (error) {
    console.error('Error extracting Spotify track ID:', error);
    return null;
  }
}

// Check if a track is present in a Spotify playlist
export async function checkTrackInPlaylist(playlistId: string, trackUrl: string): Promise<boolean> {
  try {
    const trackId = extractSpotifyTrackId(trackUrl);
    if (!trackId) {
      console.warn(`⚠️ Could not extract track ID from URL: ${trackUrl}`);
      return false;
    }
    
    const spotify = await getUncachableSpotifyClient();
    
    // Fetch all tracks from playlist (paginated)
    let offset = 0;
    const limit = 50; // Max allowed by Spotify API typing
    let hasMore = true;
    
    while (hasMore) {
      const playlistTracks = await spotify.playlists.getPlaylistItems(playlistId, undefined, undefined, limit, offset);
      
      for (const item of playlistTracks.items) {
        if (item.track && 'id' in item.track && item.track.id === trackId) {
          return true;
        }
      }
      
      offset += limit;
      hasMore = playlistTracks.items.length === limit && offset < (playlistTracks.total || 0);
    }
    
    return false;
  } catch (error: any) {
    // Gracefully handle Spotify not being connected
    if (error?.message?.includes('Spotify not connected') || error?.message?.includes('X_REPLIT_TOKEN')) {
      console.warn(`⚠️ Spotify integration not configured. Please set up Spotify connection in Replit integrations.`);
      return false;
    }
    console.error(`❌ Error checking track in playlist ${playlistId}:`, error);
    return false;
  }
}

// Fetch playlist data from Spotify API
export interface SpotifyPlaylistData {
  name: string;
  description: string | null;
  followerCount: number;
  tracksCount: number;
  imageUrl: string | null;
  ownerName: string;
  averageTrackPopularity: number | null;
}

export async function fetchSpotifyPlaylistData(playlistId: string): Promise<SpotifyPlaylistData | null> {
  try {
    const spotify = await getUncachableSpotifyClient();
    const playlist = await spotify.playlists.getPlaylist(playlistId);
    
    let averageTrackPopularity: number | null = null;
    
    if (playlist.tracks?.items && playlist.tracks.items.length > 0) {
      const trackPopularities: number[] = [];
      for (const item of playlist.tracks.items) {
        if (item.track && 'popularity' in item.track && typeof item.track.popularity === 'number') {
          trackPopularities.push(item.track.popularity);
        }
      }
      if (trackPopularities.length > 0) {
        averageTrackPopularity = Math.round(
          trackPopularities.reduce((sum, p) => sum + p, 0) / trackPopularities.length
        );
      }
    }
    
    return {
      name: playlist.name,
      description: playlist.description || null,
      followerCount: playlist.followers?.total || 0,
      tracksCount: playlist.tracks?.total || 0,
      imageUrl: playlist.images?.[0]?.url || null,
      ownerName: playlist.owner?.display_name || 'Unknown',
      averageTrackPopularity,
    };
  } catch (error: any) {
    // Gracefully handle Spotify not being connected
    if (error?.message?.includes('Spotify not connected') || error?.message?.includes('X_REPLIT_TOKEN')) {
      console.warn(`⚠️ Spotify integration not configured. Please set up Spotify connection in Replit integrations.`);
      return null;
    }
    console.error(`❌ Error fetching Spotify playlist data for ${playlistId}:`, error);
    return null;
  }
}
