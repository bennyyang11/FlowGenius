# OpenAI API Setup for Enhanced Rule Parsing

FlowGenius uses OpenAI's GPT models to provide intelligent natural language rule parsing. This allows you to create file automation rules using natural, conversational language.

## 🚀 Features with OpenAI

With OpenAI integration, you can write rules like:
- `"Delete all empty folders"`
- `"Move screenshots to Desktop/Screenshots folder"`
- `"Archive files older than 3 months"`
- `"Sync work documents to Google Drive daily"`
- `"Organize music files by artist and album"`
- `"Remove duplicate files from Downloads"`

## 🔑 Setting Up Your API Key

### Option 1: Configuration File (Recommended)

1. **Copy the example config:**
   ```bash
   cp config.example.json config.json
   ```

2. **Edit config.json and add your OpenAI API key:**
   ```json
   {
     "api": {
       "openai": {
         "apiKey": "sk-your-actual-openai-api-key-here",
         "model": "gpt-3.5-turbo",
         "temperature": 0.1
       }
     }
   }
   ```

### Option 2: Environment Variable

Set the environment variable:
```bash
export OPENAI_API_KEY="sk-your-actual-openai-api-key-here"
```

## 🔐 Getting Your OpenAI API Key

1. **Sign up at OpenAI:** https://platform.openai.com/
2. **Navigate to API Keys:** Go to your account settings
3. **Create a new key:** Click "Create new secret key"
4. **Copy the key:** Save it securely (you won't see it again)
5. **Add billing:** Add a payment method to your OpenAI account

## 💰 Cost Information

- **Model Used:** GPT-3.5-turbo (cost-effective)
- **Typical Cost:** ~$0.001-0.002 per rule parsing
- **Monthly Usage:** Usually under $5/month for normal use
- **Fallback:** Works without API key using pattern matching

## 🔧 Configuration Options

In your `config.json`, you can customize:

```json
{
  "api": {
    "openai": {
      "apiKey": "your-key-here",
      "model": "gpt-3.5-turbo",  // or "gpt-4" for better accuracy
      "temperature": 0.1         // Lower = more consistent parsing
    }
  }
}
```

### Model Options:
- **gpt-3.5-turbo**: Fast, cost-effective, good accuracy
- **gpt-4**: Higher accuracy, slower, more expensive

## 🛡️ Security Best Practices

1. **Never commit your API key** to version control
2. **Keep config.json in .gitignore** (already included)
3. **Use environment variables** in production
4. **Rotate your key** if compromised
5. **Monitor usage** on OpenAI dashboard

## 🧪 Testing the Integration

1. **Start FlowGenius** with your API key configured
2. **Go to Settings** → Smart Automation Features
3. **Enter a rule** like "Delete all empty folders"
4. **Click Parse Rule** and see the AI analysis
5. **Look for the 🤖 AI badge** in the results

## 🔄 Fallback Behavior

If OpenAI is unavailable, FlowGenius will:
- Use pattern-matching for basic rules
- Show clear feedback about fallback mode
- Continue working with reduced functionality
- Log helpful setup instructions

## 🆘 Troubleshooting

### "Could not understand the rule" error:
- ✅ Check your API key is correct
- ✅ Verify you have billing set up
- ✅ Try a simpler rule format
- ✅ Check the console logs for details

### API key not working:
- ✅ Ensure the key starts with "sk-"
- ✅ Check for extra spaces/characters
- ✅ Verify the key in OpenAI dashboard
- ✅ Restart FlowGenius after adding the key

### Rate limiting:
- ✅ OpenAI has generous rate limits
- ✅ FlowGenius uses minimal tokens
- ✅ Consider upgrading your OpenAI tier

## 📝 Example Rules to Try

Once configured, test these examples:

**Basic Operations:**
- `"Move all PDFs to Documents"`
- `"Copy photos to backup folder"`
- `"Delete files larger than 1GB"`

**Time-Based:**
- `"Archive files older than 30 days"`
- `"Backup documents daily"`
- `"Clean temp files weekly"`

**Cloud Sync:**
- `"Sync work files to Google Drive"`
- `"Upload photos to Dropbox"`
- `"Backup to OneDrive monthly"`

**Advanced:**
- `"Organize downloads by file type"`
- `"Rename files with today's date"`
- `"Classify documents by content"`

## 🎯 Without OpenAI

FlowGenius still works without OpenAI API:
- Basic pattern matching for common rules
- Manual rule configuration
- All other features remain functional
- Consider upgrading for better natural language support

---

**Ready to get started?** Copy `config.example.json` to `config.json` and add your OpenAI API key! 