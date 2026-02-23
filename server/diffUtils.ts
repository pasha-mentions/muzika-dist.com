/**
 * Utility for tracking and formatting field changes in releases and music videos
 * Used for generating admin notifications when users edit their content
 */

import { format } from 'date-fns';
import { uk } from 'date-fns/locale';

interface FieldChange {
  field: string;
  oldValue: any;
  newValue: any;
}

/**
 * Field labels in Ukrainian for notification messages
 */
const FIELD_LABELS: Record<string, string> = {
  // Release fields
  title: 'Назва',
  upc: 'UPC',
  catalogNumber: 'Каталожний номер',
  originalReleaseDate: 'Дата першого релізу',
  releaseDate: 'Дата публікації',
  primaryGenre: 'Основний жанр',
  secondaryGenre: 'Додатковий жанр',
  language: 'Мова',
  artworkUrl: 'Обкладинка',
  
  // Music video fields
  firstReleaseDate: 'Дата першого релізу',
  publicationDate: 'Дата публікації',
  isrc: 'ISRC',
  videoFileId: 'Відеофайл',
  
  // Common metadata
  labelName: 'Лейбл',
  copyrightText: 'Copyright',
  productionText: 'Production',
  
  // Arrays
  territories: 'Території',
  platforms: 'Платформи',
  genres: 'Жанри',
  languages: 'Мови',
};

/**
 * Format a value for display in notifications
 */
function formatValue(value: any): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  
  if (Array.isArray(value)) {
    if (value.length === 0) return '—';
    return value.join(', ');
  }
  
  if (typeof value === 'boolean') {
    return value ? 'Так' : 'Ні';
  }
  
  if (value instanceof Date) {
    return format(value, 'dd.MM.yyyy', { locale: uk });
  }
  
  // Check if string is a valid date
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!isNaN(date.getTime()) && value.includes('-')) {
      return format(date, 'dd.MM.yyyy', { locale: uk });
    }
  }
  
  return String(value);
}

/**
 * Compare two values and check if they're different
 */
function isDifferent(oldValue: any, newValue: any): boolean {
  // Handle null/undefined
  if (oldValue === null || oldValue === undefined) {
    return newValue !== null && newValue !== undefined && newValue !== '';
  }
  if (newValue === null || newValue === undefined || newValue === '') {
    return oldValue !== null && oldValue !== undefined && oldValue !== '';
  }
  
  // Handle arrays
  if (Array.isArray(oldValue) && Array.isArray(newValue)) {
    if (oldValue.length !== newValue.length) return true;
    const sortedOld = [...oldValue].sort();
    const sortedNew = [...newValue].sort();
    return sortedOld.some((val, idx) => val !== sortedNew[idx]);
  }
  
  // Handle dates - normalize to timestamps for comparison
  // Check if either value is a Date or looks like a date string
  const isOldDate = oldValue instanceof Date || (typeof oldValue === 'string' && !isNaN(Date.parse(oldValue)) && oldValue.includes('-'));
  const isNewDate = newValue instanceof Date || (typeof newValue === 'string' && !isNaN(Date.parse(newValue)) && newValue.includes('-'));
  
  if (isOldDate || isNewDate) {
    try {
      const oldTime = oldValue instanceof Date ? oldValue.getTime() : new Date(oldValue).getTime();
      const newTime = newValue instanceof Date ? newValue.getTime() : new Date(newValue).getTime();
      
      // Compare timestamps, ignoring if both are invalid
      if (isNaN(oldTime) && isNaN(newTime)) return false;
      if (isNaN(oldTime) || isNaN(newTime)) return true;
      
      return oldTime !== newTime;
    } catch (e) {
      // If date parsing fails, fall through to string comparison
    }
  }
  
  // Convert to strings and compare
  return String(oldValue) !== String(newValue);
}

/**
 * Fields to track for audio releases
 */
const RELEASE_TRACKED_FIELDS = [
  'title',
  'upc',
  'catalogNumber',
  'originalReleaseDate',
  'releaseDate',
  'primaryGenre',
  'secondaryGenre',
  'language',
  'labelName',
  'copyrightText',
  'productionText',
  'artworkUrl',
  'territories',
  'platforms',
];

/**
 * Fields to track for music videos
 */
const VIDEO_TRACKED_FIELDS = [
  'title',
  'upc',
  'isrc',
  'firstReleaseDate',
  'publicationDate',
  'primaryGenre',
  'secondaryGenre',
  'language',
  'labelName',
  'copyrightText',
  'productionText',
  'artworkUrl',
  'territories',
  'platforms',
  'genres',
  'languages',
];

/**
 * Compare release fields and generate change description
 */
export function compareReleaseFields(
  oldRelease: any,
  newRelease: any
): string | null {
  const changes: FieldChange[] = [];
  
  for (const field of RELEASE_TRACKED_FIELDS) {
    const oldValue = oldRelease[field];
    const newValue = newRelease[field];
    
    if (isDifferent(oldValue, newValue)) {
      changes.push({ field, oldValue, newValue });
    }
  }
  
  if (changes.length === 0) {
    return null; // No changes
  }
  
  return formatChanges(changes);
}

/**
 * Compare music video fields and generate change description
 */
export function compareVideoFields(
  oldVideo: any,
  newVideo: any
): string | null {
  const changes: FieldChange[] = [];
  
  for (const field of VIDEO_TRACKED_FIELDS) {
    const oldValue = oldVideo[field];
    const newValue = newVideo[field];
    
    if (isDifferent(oldValue, newValue)) {
      changes.push({ field, oldValue, newValue });
    }
  }
  
  if (changes.length === 0) {
    return null; // No changes
  }
  
  return formatChanges(changes);
}

/**
 * Format changes into readable text
 */
function formatChanges(changes: FieldChange[]): string {
  const lines = changes.map(change => {
    const label = FIELD_LABELS[change.field] || change.field;
    const oldVal = formatValue(change.oldValue);
    const newVal = formatValue(change.newValue);
    return `• ${label}: "${oldVal}" → "${newVal}"`;
  });
  
  return lines.join('\n');
}
