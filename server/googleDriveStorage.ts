import { google } from 'googleapis';
import { Readable } from 'stream';

let connectionSettings: any;

async function getAccessToken(forceRefresh = false) {
  if (!forceRefresh && connectionSettings?.settings?.expires_at && connectionSettings?.settings?.access_token && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  connectionSettings = null;
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  try {
    connectionSettings = await fetch(
      'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-drive',
      {
        headers: {
          'Accept': 'application/json',
          'X_REPLIT_TOKEN': xReplitToken
        }
      }
    ).then(res => res.json()).then(data => data.items?.[0]);

    if (!connectionSettings) {
      console.error('Google Drive connection not found in Replit Connections');
      throw new Error('Google Drive not connected. Please set up Google Drive connection in Replit Connections.');
    }

    const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;

    if (!accessToken) {
      console.error('Access token not found in connection settings:', JSON.stringify(connectionSettings, null, 2));
      throw new Error('Google Drive access token not found');
    }

    return accessToken;
  } catch (error) {
    console.error('Failed to get Google Drive access token:', error);
    throw error;
  }
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
// Always call this function again to get a fresh client.
async function getUncachableGoogleDriveClient(forceRefresh = false) {
  const accessToken = await getAccessToken(forceRefresh);

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.drive({ version: 'v3', auth: oauth2Client });
}

// Your folder ID from the URL: https://drive.google.com/drive/u/0/folders/12T7rrIq_8QZGSvn9Grj8i5rEUW8BatJ2
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '12T7rrIq_8QZGSvn9Grj8i5rEUW8BatJ2';

export class GoogleDriveStorageService {
  constructor() {}

  /**
   * Generate a resumable upload URL for direct client upload to Google Drive
   * This bypasses our server limits for large files
   */
  async generateResumableUploadUrl(
    fileName: string,
    mimeType: string,
    fileSize: number
  ): Promise<{ uploadUrl: string; fileId: string }> {
    const accessToken = await getAccessToken();

    const fileMetadata = {
      name: fileName,
      mimeType: mimeType,
      parents: [GOOGLE_DRIVE_FOLDER_ID]
    };

    // Create a resumable upload session using direct fetch
    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': mimeType,
          'X-Upload-Content-Length': fileSize.toString()
        },
        body: JSON.stringify(fileMetadata)
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[RESUMABLE UPLOAD] Failed to create session:', response.status, errorText);
      throw new Error(`Failed to create resumable upload session: ${response.status}`);
    }

    // The resumable session URL is in the Location header
    const uploadUrl = response.headers.get('Location');
    if (!uploadUrl) {
      throw new Error('No upload URL returned from Google Drive');
    }

    // Extract file ID from URL or create placeholder
    const fileIdMatch = uploadUrl.match(/upload_id=([^&]+)/);
    const uploadId = fileIdMatch ? fileIdMatch[1] : '';

    console.log('[RESUMABLE UPLOAD] Session created, upload URL obtained');

    return {
      uploadUrl,
      fileId: uploadId
    };
  }

  /**
   * Upload a chunk to an existing resumable upload session
   * @param uploadUrl - The resumable upload URL from generateResumableUploadUrl
   * @param chunk - The chunk data as Buffer
   * @param startByte - Starting byte position
   * @param endByte - Ending byte position (inclusive)
   * @param totalSize - Total file size
   * @returns Object with status: 'incomplete' (more chunks needed), 'complete' (upload finished with fileId), or 'error'
   */
  async uploadChunkToResumable(
    uploadUrl: string,
    chunk: Buffer,
    startByte: number,
    endByte: number,
    totalSize: number
  ): Promise<{ status: 'incomplete' | 'complete' | 'error'; fileId?: string; nextByte?: number; error?: string }> {
    try {
      const accessToken = await getAccessToken();

      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Length': chunk.length.toString(),
          'Content-Range': `bytes ${startByte}-${endByte}/${totalSize}`
        },
        body: chunk
      });

      // 308 Resume Incomplete - need more chunks
      if (response.status === 308) {
        const rangeHeader = response.headers.get('Range');
        let nextByte = endByte + 1;
        if (rangeHeader) {
          const match = rangeHeader.match(/bytes=0-(\d+)/);
          if (match) {
            nextByte = parseInt(match[1], 10) + 1;
          }
        }
        console.log('[CHUNKED UPLOAD] Chunk uploaded, next byte:', nextByte);
        return { status: 'incomplete', nextByte };
      }

      // 200 or 201 - upload complete
      if (response.status === 200 || response.status === 201) {
        const result = await response.json();
        console.log('[CHUNKED UPLOAD] Upload complete, file ID:', result.id);
        return { status: 'complete', fileId: result.id };
      }

      // Error
      const errorText = await response.text();
      console.error('[CHUNKED UPLOAD] Error:', response.status, errorText);
      return { status: 'error', error: `Upload failed: ${response.status} - ${errorText}` };
    } catch (error: any) {
      console.error('[CHUNKED UPLOAD] Exception:', error.message);
      return { status: 'error', error: error.message };
    }
  }

  /**
   * Query the current status of a resumable upload
   * @param uploadUrl - The resumable upload URL
   * @param totalSize - Total file size
   * @returns The next byte position to upload from, or -1 if complete/error
   */
  async queryUploadProgress(uploadUrl: string, totalSize: number): Promise<number> {
    try {
      const accessToken = await getAccessToken();

      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Length': '0',
          'Content-Range': `bytes */${totalSize}`
        }
      });

      if (response.status === 308) {
        const rangeHeader = response.headers.get('Range');
        if (rangeHeader) {
          const match = rangeHeader.match(/bytes=0-(\d+)/);
          if (match) {
            return parseInt(match[1], 10) + 1;
          }
        }
        return 0; // Start from beginning
      }

      if (response.status === 200 || response.status === 201) {
        return -1; // Already complete
      }

      return 0; // Start over on error
    } catch (error: any) {
      console.error('[CHUNKED UPLOAD] Query progress error:', error.message);
      return 0;
    }
  }

  /**
   * Verify that a file exists, is in our authorized folder, and has no existing registration
   * @param fileId - The Google Drive file ID to verify
   * @returns Object with isValid flag and file metadata
   */
  async verifyFileForRegistration(fileId: string): Promise<{ isValid: boolean; hasExistingClaim: boolean }> {
    try {
      const drive = await getUncachableGoogleDriveClient();
      
      const file = await drive.files.get({
        fileId: fileId,
        fields: 'id, parents, appProperties'
      });
      
      if (!file.data.parents || file.data.parents.length === 0) {
        console.error('[SECURITY] File has no parents');
        return { isValid: false, hasExistingClaim: false };
      }
      
      // Check if the file is in our designated folder
      if (!file.data.parents.includes(GOOGLE_DRIVE_FOLDER_ID)) {
        console.error('[SECURITY] File not in our folder');
        return { isValid: false, hasExistingClaim: false };
      }

      // Check if file already has a registration claim
      if (file.data.appProperties?.registeredBySession) {
        console.error('[SECURITY] File already registered by another session');
        return { isValid: true, hasExistingClaim: true };
      }

      return { isValid: true, hasExistingClaim: false };
    } catch (error: any) {
      console.error('[SECURITY] Failed to verify file:', error.message);
      return { isValid: false, hasExistingClaim: false };
    }
  }

  /**
   * Atomically register a file to a session by setting appProperties
   * This prevents other sessions from registering the same file
   * @returns true if registration succeeded, false if file was already registered
   */
  async registerFileToSession(fileId: string, sessionToken: string): Promise<boolean> {
    try {
      const drive = await getUncachableGoogleDriveClient();
      
      // First check current state
      const file = await drive.files.get({
        fileId: fileId,
        fields: 'id, appProperties'
      });

      // If already registered, reject
      if (file.data.appProperties?.registeredBySession) {
        console.error('[SECURITY] File already registered');
        return false;
      }

      // Set registration token
      await drive.files.update({
        fileId: fileId,
        requestBody: {
          appProperties: {
            registeredBySession: sessionToken
          }
        }
      });

      // Verify registration was set correctly (race condition check)
      const verifyFile = await drive.files.get({
        fileId: fileId,
        fields: 'id, appProperties'
      });

      if (verifyFile.data.appProperties?.registeredBySession !== sessionToken) {
        console.error('[SECURITY] Registration verification failed - possible race condition');
        return false;
      }

      return true;
    } catch (error: any) {
      console.error('[SECURITY] Failed to register file:', error.message);
      return false;
    }
  }

  /**
   * Verify that a file has the expected registration token
   * @returns true if the file's registeredBySession matches the expected token
   */
  async verifyFileRegistration(fileId: string, expectedToken: string): Promise<boolean> {
    try {
      const drive = await getUncachableGoogleDriveClient();
      
      const file = await drive.files.get({
        fileId: fileId,
        fields: 'id, appProperties'
      });

      return file.data.appProperties?.registeredBySession === expectedToken;
    } catch (error: any) {
      console.error('[SECURITY] Failed to verify file registration:', error.message);
      return false;
    }
  }

  /**
   * Legacy method - verify file is in our folder
   */
  async verifyFileInOurFolder(fileId: string): Promise<boolean> {
    const result = await this.verifyFileForRegistration(fileId);
    return result.isValid;
  }

  /**
   * Claim ownership of a file by setting a session token in its appProperties
   * This uses atomic update to prevent race conditions
   * @param fileId - The Google Drive file ID
   * @param sessionToken - The unique session token
   * @param sessionCreatedAt - When the session was created (to validate file creation time)
   * @returns true if claim succeeded (file had no prior claim and was created recently), false otherwise
   */
  async claimFileOwnership(fileId: string, sessionToken: string, sessionCreatedAt: number): Promise<boolean> {
    try {
      const drive = await getUncachableGoogleDriveClient();
      
      // First check if file already has an ownership claim and verify creation time
      const file = await drive.files.get({
        fileId: fileId,
        fields: 'id, appProperties, createdTime'
      });

      // If file already has a claim token, reject (file already claimed by another session)
      if (file.data.appProperties?.claimedBySession) {
        console.error('[SECURITY] File already claimed by another session');
        return false;
      }

      // Security: Verify file was created STRICTLY AFTER the session was created
      // No grace window - file must be created after session start
      if (file.data.createdTime) {
        const fileCreatedAt = new Date(file.data.createdTime).getTime();
        if (fileCreatedAt < sessionCreatedAt) {
          console.error('[SECURITY] File was created before session started:', {
            fileCreatedAt: new Date(fileCreatedAt).toISOString(),
            sessionCreatedAt: new Date(sessionCreatedAt).toISOString()
          });
          return false;
        }
      }

      // Set our claim token
      await drive.files.update({
        fileId: fileId,
        requestBody: {
          appProperties: {
            claimedBySession: sessionToken
          }
        }
      });

      // Verify the claim was set correctly (race condition check)
      const verifyFile = await drive.files.get({
        fileId: fileId,
        fields: 'id, appProperties'
      });

      if (verifyFile.data.appProperties?.claimedBySession !== sessionToken) {
        console.error('[SECURITY] Claim verification failed - possible race condition');
        return false;
      }

      return true;
    } catch (error: any) {
      console.error('[SECURITY] Failed to claim file ownership:', error.message);
      return false;
    }
  }

  /**
   * Set file permissions to public after upload completes
   */
  async setFilePublic(fileId: string): Promise<void> {
    const drive = await getUncachableGoogleDriveClient();
    
    await drive.permissions.create({
      fileId: fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone'
      }
    });
  }

  /**
   * Upload a file to Google Drive
   * @param fileBuffer - Buffer containing the file data
   * @param fileName - Name for the file
   * @param mimeType - MIME type of the file
   * @param folderId - Optional folder ID (defaults to GOOGLE_DRIVE_FOLDER_ID)
   * @returns Object with fileId and webViewLink
   */
  async uploadFile(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
    folderId?: string
  ): Promise<{ fileId: string; webViewLink: string; webContentLink: string }> {
    const drive = await getUncachableGoogleDriveClient();

    const fileMetadata = {
      name: fileName,
      parents: [folderId || GOOGLE_DRIVE_FOLDER_ID]
    };

    const media = {
      mimeType: mimeType,
      body: Readable.from(fileBuffer)
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, webViewLink, webContentLink'
    });

    if (!response.data.id) {
      throw new Error('Failed to upload file to Google Drive');
    }

    // Make the file publicly accessible
    await drive.permissions.create({
      fileId: response.data.id,
      requestBody: {
        role: 'reader',
        type: 'anyone'
      }
    });

    return {
      fileId: response.data.id,
      webViewLink: response.data.webViewLink || '',
      webContentLink: response.data.webContentLink || ''
    };
  }

  /**
   * Get file metadata from Google Drive
   * @param fileId - Google Drive file ID
   */
  async getFile(fileId: string) {
    const drive = await getUncachableGoogleDriveClient();

    const response = await drive.files.get({
      fileId: fileId,
      fields: 'id, name, mimeType, size, webViewLink, webContentLink'
    });

    return response.data;
  }

  async getThumbnail(fileId: string, size: number = 200): Promise<Buffer> {
    const drive = await getUncachableGoogleDriveClient();
    const accessToken = await getAccessToken();

    const fileMetadata = await drive.files.get({
      fileId: fileId,
      fields: 'thumbnailLink'
    });

    if (!fileMetadata.data.thumbnailLink) {
      throw new Error('No thumbnail available for this file');
    }

    const thumbnailUrl = fileMetadata.data.thumbnailLink.replace(/=s\d+/, `=s${size}`);

    const response = await fetch(thumbnailUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch thumbnail: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Download file content from Google Drive
   * @param fileId - Google Drive file ID
   */
  async downloadFile(fileId: string): Promise<Buffer> {
    const drive = await getUncachableGoogleDriveClient();

    const response = await drive.files.get(
      {
        fileId: fileId,
        alt: 'media'
      },
      { responseType: 'arraybuffer' }
    );

    return Buffer.from(response.data as ArrayBuffer);
  }

  /**
   * Stream file content from Google Drive with proper Range support
   * Uses direct fetch API instead of googleapis client for reliable Range header handling
   * @param fileId - Google Drive file ID
   * @param range - Optional range object with start and end bytes
   */
  async streamFile(fileId: string, range?: { start: number; end: number }): Promise<{
    stream: NodeJS.ReadableStream;
    contentLength: number;
    actualRange?: { start: number; end: number; total: number };
    isPartial: boolean;
  }> {
    const accessToken = await getAccessToken();
    
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${accessToken}`
    };
    
    if (range) {
      headers['Range'] = `bytes=${range.start}-${range.end}`;
    }

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers }
    );

    if (!response.ok && response.status !== 206) {
      throw new Error(`Failed to stream file: ${response.status} ${response.statusText}`);
    }

    const isPartial = response.status === 206;
    let contentLength: number;
    let actualRange: { start: number; end: number; total: number } | undefined;

    if (isPartial) {
      // Parse Content-Range header from Google Drive response
      // Format: "bytes start-end/total"
      const contentRange = response.headers.get('content-range');
      if (contentRange) {
        const match = contentRange.match(/bytes (\d+)-(\d+)\/(\d+)/);
        if (match) {
          actualRange = {
            start: parseInt(match[1], 10),
            end: parseInt(match[2], 10),
            total: parseInt(match[3], 10)
          };
          contentLength = actualRange.end - actualRange.start + 1;
          console.log(`[STREAM] Google Drive returned range: ${contentRange}, contentLength: ${contentLength}`);
        } else {
          // Fallback to requested range
          contentLength = range ? range.end - range.start + 1 : 0;
        }
      } else {
        contentLength = range ? range.end - range.start + 1 : 0;
      }
    } else {
      // Full content response
      contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    }

    // Convert Web ReadableStream to Node.js ReadableStream
    const webStream = response.body;
    if (!webStream) {
      throw new Error('No response body from Google Drive');
    }

    const nodeStream = Readable.fromWeb(webStream as any);
    
    // Track bytes streamed for debugging
    let bytesStreamed = 0;
    nodeStream.on('data', (chunk: Buffer) => {
      bytesStreamed += chunk.length;
    });
    nodeStream.on('end', () => {
      console.log(`[STREAM] Stream ended, total bytes: ${bytesStreamed}, expected: ${contentLength}`);
    });
    nodeStream.on('error', (err: Error) => {
      console.error(`[STREAM] Stream error after ${bytesStreamed} bytes:`, err.message);
    });

    return {
      stream: nodeStream,
      contentLength,
      actualRange,
      isPartial
    };
  }

  /**
   * Delete a file from Google Drive
   * @param fileId - Google Drive file ID
   */
  async deleteFile(fileId: string): Promise<void> {
    const drive = await getUncachableGoogleDriveClient();

    await drive.files.delete({
      fileId: fileId
    });
  }

  /**
   * Search for folders by name in a specific parent folder
   * @param folderName - Name of the folder to search for
   * @param parentFolderId - Parent folder ID (defaults to main reports folder)
   * @returns Array of matching folders with id and name
   */
  async searchFolderByName(
    folderName: string,
    parentFolderId: string = '1lDIYBM5X1hrxnb35xJUNWHb5fLwu7TSa'
  ): Promise<Array<{ id: string; name: string }>> {
    const drive = await getUncachableGoogleDriveClient();

    const query = `mimeType='application/vnd.google-apps.folder' and name='${folderName.replace(/'/g, "\\'")}' and '${parentFolderId}' in parents and trashed=false`;

    const response = await drive.files.list({
      q: query,
      fields: 'files(id, name)',
      spaces: 'drive'
    });

    return response.data.files?.map(file => ({
      id: file.id!,
      name: file.name!
    })) || [];
  }

  /**
   * List all XLS/XLSX files in a specific folder
   * @param folderId - Google Drive folder ID
   * @returns Array of XLS files with id, name, and createdTime
   */
  async listXlsFilesInFolder(
    folderId: string
  ): Promise<Array<{ id: string; name: string; createdTime: string }>> {
    const drive = await getUncachableGoogleDriveClient();

    // Query for Excel files (.xls and .xlsx)
    const query = `'${folderId}' in parents and (mimeType='application/vnd.ms-excel' or mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') and trashed=false`;

    const response = await drive.files.list({
      q: query,
      fields: 'files(id, name, createdTime)',
      orderBy: 'createdTime desc', // Newest first
      spaces: 'drive'
    });

    return response.data.files?.map(file => ({
      id: file.id!,
      name: file.name!,
      createdTime: file.createdTime!
    })) || [];
  }

  /**
   * List all subfolders in a specific folder
   * @param folderId - Google Drive folder ID
   * @returns Array of subfolders with id and name
   */
  async listSubfoldersInFolder(
    folderId: string
  ): Promise<Array<{ id: string; name: string }>> {
    const drive = await getUncachableGoogleDriveClient();

    const query = `'${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;

    let allFolders: Array<{ id: string; name: string }> = [];
    let pageToken: string | undefined;

    do {
      const response = await drive.files.list({
        q: query,
        fields: 'nextPageToken, files(id, name)',
        orderBy: 'name',
        spaces: 'drive',
        pageSize: 1000,
        pageToken,
      });

      const folders = response.data.files?.map(file => ({
        id: file.id!,
        name: file.name!,
      })) || [];

      allFolders = allFolders.concat(folders);
      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    return allFolders;
  }

  async listVideoFilesInFolder(
    folderId: string
  ): Promise<Array<{ id: string; name: string; createdTime: string; thumbnailLink: string | null }>> {
    const query = `'${folderId}' in parents and mimeType contains 'video/' and trashed=false`;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const drive = await getUncachableGoogleDriveClient(attempt > 0);
        const response = await drive.files.list({
          q: query,
          fields: 'files(id, name, createdTime, thumbnailLink)',
          orderBy: 'name',
          spaces: 'drive'
        });

        return response.data.files?.map(file => ({
          id: file.id!,
          name: file.name!,
          createdTime: file.createdTime || '',
          thumbnailLink: file.thumbnailLink || null
        })) || [];
      } catch (err: any) {
        if (attempt === 0 && (err?.code === 401 || err?.status === 401)) {
          console.log('listVideoFilesInFolder: token expired, refreshing...');
          continue;
        }
        throw err;
      }
    }
    return [];
  }

  /**
   * Get a direct download link for a file
   * This creates a publicly accessible direct download URL
   * @param fileId - Google Drive file ID
   */
  getDirectDownloadLink(fileId: string): string {
    // Use Google Drive thumbnail API for reliable image display
    // sz=w1000 provides high quality images
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
  }

  /**
   * Get a download URL that forces file download
   * @param fileId - Google Drive file ID
   */
  getDownloadUrl(fileId: string): string {
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }

  /**
   * Get an embeddable link for images/videos
   * @param fileId - Google Drive file ID
   */
  getEmbedLink(fileId: string): string {
    return `https://drive.google.com/file/d/${fileId}/view`;
  }
}

export const googleDriveStorage = new GoogleDriveStorageService();
