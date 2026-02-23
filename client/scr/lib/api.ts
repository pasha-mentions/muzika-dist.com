/**
 * Get the API base URL for the current environment
 * In Replit, both frontend and backend are served from the same origin,
 * so we always use relative URLs (empty string base URL)
 */
export function getApiUrl(): string {
  // Always use relative URLs - in Replit both dev and prod serve from same origin
  return '';
}

/**
 * Get the full API endpoint URL
 * This ensures download links work correctly in both dev and production
 */
export function getApiEndpoint(path: string): string {
  const baseUrl = getApiUrl();
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}
