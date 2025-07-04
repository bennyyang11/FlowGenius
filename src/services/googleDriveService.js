const { google } = require('googleapis');
const { BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const Store = require('electron-store');

class GoogleDriveService {
  constructor() {
    this.oauth2Client = null;
    this.drive = null;
    this.isAuthenticated = false;
    this.store = new Store({ name: 'google-drive-auth' });
    this.authWindow = null;
    
    // Load configuration from config.json or environment variables
    let clientId = process.env.GOOGLE_CLIENT_ID;
    let clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    
    // Try to load from config.json if env vars not available
    if (!clientId || !clientSecret) {
      try {
        const configPath = path.join(process.cwd(), 'config.json');
        const config = JSON.parse(require('fs').readFileSync(configPath, 'utf8'));
        clientId = clientId || config.api?.googleDrive?.clientId;
        clientSecret = clientSecret || config.api?.googleDrive?.clientSecret;
      } catch (error) {
        console.log('Could not load config.json for Google Drive credentials');
      }
    }
    
    // OAuth2 configuration
    this.oauth2Config = {
      clientId: clientId || 'your-google-client-id',
      clientSecret: clientSecret || 'your-google-client-secret',
      redirectUri: 'http://localhost:3000/auth/google/callback',
      scopes: [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive.metadata.readonly'
      ]
    };
  }

  async initialize() {
    try {
      // Initialize OAuth2 client
      this.oauth2Client = new google.auth.OAuth2(
        this.oauth2Config.clientId,
        this.oauth2Config.clientSecret,
        this.oauth2Config.redirectUri
      );

      // Initialize Drive API (needs to be done before token validation)
      this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });

      // Check for existing tokens
      const tokens = this.store.get('tokens');
      if (tokens && tokens.access_token) {
        this.oauth2Client.setCredentials(tokens);
        // Set authenticated to true if tokens exist, validation will happen later
        this.isAuthenticated = true;
        // Try to validate tokens, but don't fail initialization if validation fails
        try {
          await this.validateAndRefreshToken();
        } catch (error) {
          console.log('Token validation failed during init, user may need to re-authenticate:', error.message);
          // Keep isAuthenticated as true for now, let the user try to use the tokens
        }
      }

      console.log('🔗 Google Drive Service initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize Google Drive service:', error);
      return false;
    }
  }

  async authenticate() {
    return new Promise((resolve, reject) => {
      try {
        // Create a simple local server to handle the callback
        const http = require('http');
        const server = http.createServer((req, res) => {
          if (req.url.includes('/auth/google/callback')) {
            const url = new URL(req.url, 'http://localhost:3000');
            const authCode = url.searchParams.get('code');
            
            if (authCode) {
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(`
                <html>
                  <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                    <h2>✅ Authentication Successful!</h2>
                    <p>You can close this window and return to FlowGenius.</p>
                    <script>window.close();</script>
                  </body>
                </html>
              `);
              
              // Process the auth code
              this.processAuthCode(authCode, resolve, reject);
            } else {
              res.writeHead(400, { 'Content-Type': 'text/html' });
              res.end('<h2>❌ Authentication Failed</h2><p>No authorization code received.</p>');
              reject(new Error('No authorization code received'));
            }
            
            // Close server after handling the callback
            server.close();
          }
        });

        server.listen(3000, () => {
          console.log('🔐 OAuth callback server started on port 3000');
        });

        // Generate auth URL
        const authUrl = this.oauth2Client.generateAuthUrl({
          access_type: 'offline',
          scope: this.oauth2Config.scopes,
          prompt: 'consent'
        });

        // Create auth window
        this.authWindow = new BrowserWindow({
          width: 600,
          height: 700,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
          },
          show: false,
          title: 'Sign in to Google Drive'
        });

        // Load auth URL
        this.authWindow.loadURL(authUrl);
        this.authWindow.show();

        // Handle window close
        this.authWindow.on('closed', () => {
          this.authWindow = null;
          server.close(); // Close server if window is closed
        });

      } catch (error) {
        console.error('Authentication setup failed:', error);
        reject(error);
      }
    });
  }

  async processAuthCode(authCode, resolve, reject) {
    try {
      console.log('🔐 Exchanging auth code for tokens...');
      const { tokens } = await this.oauth2Client.getToken(authCode);
      this.oauth2Client.setCredentials(tokens);
      
      // Store tokens securely
      this.store.set('tokens', tokens);
      this.isAuthenticated = true;
      console.log('✅ Tokens stored successfully');
      
      // Get user info (with fallback handling)
      console.log('👤 Getting user info...');
      let userInfo;
      try {
        userInfo = await this.getUserInfo();
        this.store.set('userInfo', userInfo);
        console.log('✅ User info stored successfully');
      } catch (userInfoError) {
        console.log('⚠️ User info failed, using fallback data:', userInfoError.message);
        userInfo = {
          name: 'Google User',
          email: 'user@gmail.com',
          photoUrl: null,
          storageQuota: null
        };
        this.store.set('userInfo', userInfo);
      }
      
      if (this.authWindow) {
        this.authWindow.close();
      }
      
      console.log('🎉 Authentication completed successfully');
      resolve({
        success: true,
        user: userInfo,
        message: 'Successfully authenticated with Google Drive'
      });
    } catch (error) {
      console.error('❌ Token exchange failed:', error);
      if (this.authWindow) {
        this.authWindow.close();
      }
      reject(new Error('Authentication failed: ' + error.message));
    }
  }

  async validateAndRefreshToken() {
    try {
      const tokens = this.store.get('tokens');
      if (!tokens || !tokens.access_token) {
        this.isAuthenticated = false;
        return false;
      }

      // Try to validate the token with a simple API call with timeout
      try {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Token validation timeout')), 5000);
        });
        
        await Promise.race([
          this.drive.about.get({ fields: 'user(emailAddress)' }),
          timeoutPromise
        ]);
        
        this.isAuthenticated = true;
        return true;
      } catch (apiError) {
        // Token might be expired, try to refresh if we have a refresh token
        if (tokens.refresh_token) {
          try {
            const { credentials } = await this.oauth2Client.refreshAccessToken();
            this.oauth2Client.setCredentials(credentials);
            this.store.set('tokens', credentials);
            this.isAuthenticated = true;
            return true;
          } catch (refreshError) {
            console.log('Token refresh failed:', refreshError.message);
            this.isAuthenticated = false;
            return false;
          }
        } else {
          console.log('Token expired and no refresh token available');
          this.isAuthenticated = false;
          return false;
        }
      }
    } catch (error) {
      console.log('Token validation failed:', error.message);
      // Don't set isAuthenticated to false here during initialization
      // Let the user try to use existing tokens
      return false;
    }
  }

  async getUserInfo() {
    try {
      console.log('👤 Fetching user info from Google Drive API...');
      
      // Create a timeout promise to prevent hanging
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('getUserInfo timeout after 10 seconds')), 10000);
      });
      
      // Race the API call against the timeout
      const response = await Promise.race([
        this.drive.about.get({
          fields: 'user(displayName,emailAddress,photoLink),storageQuota'
        }),
        timeoutPromise
      ]);
      
      console.log('✅ User info retrieved successfully');
      
      return {
        name: response.data.user?.displayName || 'Google User',
        email: response.data.user?.emailAddress || 'user@gmail.com',
        photoUrl: response.data.user?.photoLink || null,
        storageQuota: response.data.storageQuota || null
      };
    } catch (error) {
      console.error('❌ Failed to get user info:', error.message);
      
      // Return basic fallback user info to prevent authentication from failing
      return {
        name: 'Google User',
        email: 'user@gmail.com',
        photoUrl: null,
        storageQuota: null
      };
    }
  }

  async signOut() {
    let tokenRevocationSuccess = false;
    
    try {
      // Try to revoke tokens (this may fail if token is already expired/invalid)
      const tokens = this.store.get('tokens');
      if (tokens && tokens.access_token) {
        try {
          await this.oauth2Client.revokeToken(tokens.access_token);
          tokenRevocationSuccess = true;
          console.log('✅ Google OAuth token revoked successfully');
        } catch (revokeError) {
          // Token revocation failed, but this is common and non-critical
          console.log('⚠️ Token revocation failed (token may already be expired/invalid):', revokeError.message);
          // Continue with local cleanup regardless
        }
      }

      // Always perform local cleanup regardless of token revocation success
      this.store.clear();
      this.isAuthenticated = false;
      this.oauth2Client.setCredentials({});

      const message = tokenRevocationSuccess 
        ? 'Successfully signed out and revoked Google Drive access'
        : 'Successfully signed out locally (remote token may have already been expired)';

      console.log('✅ Google Drive sign out completed');
      return { success: true, message };
      
    } catch (error) {
      // Only fail if local cleanup fails (very unlikely)
      console.error('Local sign out failed:', error);
      return { success: false, message: 'Local sign out failed: ' + error.message };
    }
  }

  async getAuthStatus() {
    const tokens = this.store.get('tokens');
    const userInfo = this.store.get('userInfo');
    
    if (!tokens || !this.isAuthenticated) {
      return {
        isAuthenticated: false,
        user: null,
        message: 'Not authenticated'
      };
    }

    return {
      isAuthenticated: true,
      user: userInfo,
      message: 'Authenticated with Google Drive'
    };
  }

  async uploadFile(filePath, fileName, parentFolderId = null) {
    if (!this.isAuthenticated) {
      throw new Error('Not authenticated with Google Drive');
    }

    try {
      const fileMetadata = {
        name: fileName,
        parents: parentFolderId ? [parentFolderId] : undefined
      };

      const media = {
        mimeType: 'application/octet-stream',
        body: require('fs').createReadStream(filePath)
      };

      const response = await this.drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id,name,mimeType,size,createdTime'
      });

      return {
        success: true,
        file: response.data,
        message: `Successfully uploaded ${fileName}`
      };
    } catch (error) {
      console.error('File upload failed:', error);
      throw new Error('Upload failed: ' + error.message);
    }
  }

  async createFolder(folderName, parentFolderId = null) {
    if (!this.isAuthenticated) {
      throw new Error('Not authenticated with Google Drive');
    }

    try {
      const fileMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentFolderId ? [parentFolderId] : undefined
      };

      const response = await this.drive.files.create({
        resource: fileMetadata,
        fields: 'id,name'
      });

      return {
        success: true,
        folder: response.data,
        message: `Successfully created folder ${folderName}`
      };
    } catch (error) {
      console.error('Folder creation failed:', error);
      throw new Error('Folder creation failed: ' + error.message);
    }
  }

  async findOrCreateFolder(folderName, parentFolderId = null) {
    try {
      // Search for existing folder
      const query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const searchParams = {
        q: query,
        fields: 'files(id,name)',
        pageSize: 1
      };

      if (parentFolderId) {
        searchParams.q += ` and '${parentFolderId}' in parents`;
      }

      const response = await this.drive.files.list(searchParams);
      
      if (response.data.files && response.data.files.length > 0) {
        return response.data.files[0];
      }

      // Create new folder if not found
      const newFolder = await this.createFolder(folderName, parentFolderId);
      return newFolder.folder;
    } catch (error) {
      console.error('Find or create folder failed:', error);
      throw error;
    }
  }

  async syncFileToGoogleDrive(filePath, organizationSuggestion = null) {
    if (!this.isAuthenticated) {
      throw new Error('Not authenticated with Google Drive');
    }

    try {
      const fileName = path.basename(filePath);
      const stats = await fs.stat(filePath);

      // Create organized folder structure
      let parentFolderId = null;
      if (organizationSuggestion && organizationSuggestion.relativePath) {
        const folderParts = organizationSuggestion.relativePath.split('/');
        
        // Create nested folder structure
        for (const folderName of folderParts) {
          if (folderName.trim()) {
            const folder = await this.findOrCreateFolder(folderName, parentFolderId);
            parentFolderId = folder.id;
          }
        }
      }

      // Upload file
      const uploadResult = await this.uploadFile(filePath, fileName, parentFolderId);
      
      return {
        success: true,
        file: uploadResult.file,
        folderPath: organizationSuggestion ? organizationSuggestion.relativePath : 'Root',
        size: stats.size,
        message: `Successfully synced ${fileName} to Google Drive`
      };
    } catch (error) {
      console.error('Sync to Google Drive failed:', error);
      throw error;
    }
  }

  async bulkSync(files, onProgress = null) {
    if (!this.isAuthenticated) {
      throw new Error('Not authenticated with Google Drive');
    }

    const results = {
      success: 0,
      failed: 0,
      total: files.length,
      errors: [],
      uploadedFiles: []
    };

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      try {
        const syncResult = await this.syncFileToGoogleDrive(file.filePath, file.organizationSuggestion);
        results.success++;
        results.uploadedFiles.push({
          fileName: file.fileName,
          size: syncResult.size,
          folderPath: syncResult.folderPath
        });
      } catch (error) {
        results.failed++;
        results.errors.push({
          fileName: file.fileName,
          error: error.message
        });
      }

      // Report progress
      if (onProgress) {
        onProgress({
          current: i + 1,
          total: files.length,
          fileName: file.fileName,
          success: results.success,
          failed: results.failed
        });
      }
    }

    return results;
  }

  async getStorageInfo() {
    if (!this.isAuthenticated) {
      throw new Error('Not authenticated with Google Drive');
    }

    try {
      const response = await this.drive.about.get({
        fields: 'storageQuota'
      });

      const quota = response.data.storageQuota;
      return {
        total: parseInt(quota.limit),
        used: parseInt(quota.usage),
        available: parseInt(quota.limit) - parseInt(quota.usage),
        usageInDrive: parseInt(quota.usageInDrive)
      };
    } catch (error) {
      console.error('Failed to get storage info:', error);
      throw error;
    }
  }

  isConfigured() {
    return this.oauth2Config.clientId !== 'your-google-client-id' && 
           this.oauth2Config.clientSecret !== 'your-google-client-secret';
  }
}

module.exports = { GoogleDriveService }; 