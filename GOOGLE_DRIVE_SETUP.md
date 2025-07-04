# Google Drive Integration Setup Guide

This guide will walk you through setting up Google Drive integration for FlowGenius.

## Prerequisites

- A Google account
- Google Cloud Console access
- FlowGenius application installed

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Make note of your project ID

## Step 2: Enable Google Drive API

1. In the Google Cloud Console, navigate to "APIs & Services" > "Library"
2. Search for "Google Drive API"
3. Click on it and press "Enable"

## Step 3: Create OAuth 2.0 Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth 2.0 Client IDs"
3. Choose "Desktop application" as the application type
4. Give it a name (e.g., "FlowGenius Desktop")
5. Add the following redirect URI:
   ```
   http://localhost:3000/auth/google/callback
   ```
6. Click "Create"
7. Download the JSON file or copy the Client ID and Client Secret

## Step 4: Configure FlowGenius

### Option A: Environment Variables (Recommended)

Create a `.env` file in your FlowGenius root directory:

```bash
# Google Drive API Configuration
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here

# Other configuration
OPENAI_API_KEY=your_openai_api_key_here
```

### Option B: Config File

Update your `config.json` file:

```json
{
  "api": {
    "openai": {
      "apiKey": "your_openai_api_key_here"
    },
    "googleDrive": {
      "clientId": "your_client_id_here",
      "clientSecret": "your_client_secret_here"
    }
  }
}
```

## Step 5: Test the Integration

1. Start FlowGenius
2. Go to Settings > Cloud Sync
3. Click "Sign in with Google"
4. Complete the OAuth flow in your browser
5. You should see your Google account connected

## Features Available After Setup

✅ **Direct Google Drive Authentication**
- Secure OAuth 2.0 flow
- User profile display
- Sign in/out functionality

✅ **Automatic Cloud Sync**
- Files are automatically uploaded after AI organization
- Organized folder structure in Google Drive
- Real-time sync progress

✅ **Manual Bulk Sync**
- Sync all files from Desktop, Documents, Downloads
- Progress tracking and error reporting
- Batch processing for optimal performance

✅ **Smart Organization**
- AI determines optimal folder structure
- Nested folders based on file classification
- Duplicate handling

## Troubleshooting

### Error: "Google Drive API credentials not configured"
- Check that your environment variables or config file are properly set
- Restart FlowGenius after making configuration changes
- Verify that your Client ID and Secret are correct

### Error: "Authentication failed"
- Ensure the redirect URI is exactly: `http://localhost:3000/auth/google/callback`
- Check that Google Drive API is enabled in your project
- Verify your OAuth 2.0 credentials are for "Desktop application" type

### Error: "Access denied"
- Make sure you granted all requested permissions during OAuth flow
- Try signing out and signing in again
- Check Google account security settings

### Demo Mode Limitations
- Google Drive authentication is disabled in demo mode
- Switch to real file mode to test Google Drive features

## Security Notes

- Your Google credentials are stored securely using Electron's built-in storage
- Tokens are automatically refreshed when needed
- You can revoke access anytime from your [Google Account settings](https://myaccount.google.com/permissions)

## Need Help?

If you encounter issues:
1. Check the console for detailed error messages
2. Verify your Google Cloud Console configuration
3. Ensure all prerequisites are met
4. Try the troubleshooting steps above

For additional support, please check the FlowGenius documentation or community forums. 