/**
 * Utility functions for Google Drive operations
 */

/**
 * Extract Google Drive folder ID from URL or return ID if already clean
 * Supports formats:
 * - https://drive.google.com/drive/u/0/folders/FOLDER_ID
 * - https://drive.google.com/drive/folders/FOLDER_ID
 * - FOLDER_ID (already clean)
 */
export function extractDriveFolderId(input: string): string | null {
  if (!input || typeof input !== 'string') {
    return null;
  }

  const trimmed = input.trim();

  // Pattern 1: Full URL with /u/0/
  const pattern1 = /drive\.google\.com\/drive\/u\/\d+\/folders\/([a-zA-Z0-9_-]+)/;
  const match1 = trimmed.match(pattern1);
  if (match1) {
    return match1[1];
  }

  // Pattern 2: URL without /u/0/
  const pattern2 = /drive\.google\.com\/drive\/folders\/([a-zA-Z0-9_-]+)/;
  const match2 = trimmed.match(pattern2);
  if (match2) {
    return match2[1];
  }

  // Pattern 3: Already a folder ID (alphanumeric with - and _)
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed) && trimmed.length > 10) {
    return trimmed;
  }

  return null;
}

/**
 * Extract period (MM-YYYY) from filename
 * Supports formats:
 * - "Charodiyka 09-2025.xlsx" -> "09-2025"
 * - "09-2025 Charodiyka.xlsx" -> "09-2025"
 * - "Charodiyka_10-2024.xls" -> "10-2024"
 * - "Artist Name 01-2024 Report.xlsx" -> "01-2024"
 */
export function extractPeriodFromFilename(filename: string): string | null {
  if (!filename || typeof filename !== 'string') {
    return null;
  }

  // Normalize Unicode dash variants (en dash, em dash, etc.) to ASCII hyphen
  const normalizedFilename = filename
    .replace(/[\u2013\u2014\u2015\u2212]/g, '-') // En dash, em dash, horizontal bar, minus sign
    .replace(/\s+/g, ' '); // Normalize whitespace

  // Pattern: MM-YYYY (month 01-12, year 2000-2099)
  const pattern = /\b(0[1-9]|1[0-2])-(20\d{2})\b/;
  const match = normalizedFilename.match(pattern);

  if (match) {
    return match[0]; // Returns "MM-YYYY"
  }

  return null;
}

/**
 * Validate that a period string is in correct format
 */
export function isValidPeriod(period: string): boolean {
  if (!period || typeof period !== 'string') {
    return false;
  }

  const pattern = /^(0[1-9]|1[0-2])-(20\d{2})$/;
  return pattern.test(period);
}
