# Instagram Graph API Integration Guide

## Overview
This server provides comprehensive Instagram Graph API integration including webhook handling and post publishing capabilities.

## Features
- ✅ Instagram webhook verification and event processing
- ✅ Real-time Instagram event monitoring (comments, mentions, media)
- ✅ Instagram post publishing (images with captions)
- ✅ Webhook subscription management
- ✅ Event storage and retrieval

## Setup Requirements

### 1. Facebook App Configuration
1. Create a Facebook App at [developers.facebook.com](https://developers.facebook.com)
2. Add Instagram Graph API product to your app
3. Configure webhook subscriptions for Instagram
4. Get your App ID and App Secret

### 2. Instagram Business Account
- Must have an Instagram Business or Creator account
- Instagram account must be connected to a Facebook Page
- Page must have appropriate permissions

### 3. Access Token
Generate a long-lived access token with the following permissions:
- `instagram_basic`
- `instagram_content_publish`
- `pages_show_list`
- `pages_read_engagement`

### 4. Environment Variables
Create a `.env` file with the following variables:

```env
# Instagram API Configuration
INSTAGRAM_APP_ID=your_app_id
INSTAGRAM_APP_SECRET=your_app_secret
INSTAGRAM_ACCESS_TOKEN=your_long_lived_access_token

# Webhook Configuration
INSTAGRAM_VERIFY_TOKEN=htntoken2
WEBHOOK_CALLBACK_URL=https://your-ngrok-url.ngrok.io/webhooks/instagram

# Server Configuration
PORT=13732
GEMINI_API_KEY=your_gemini_api_key

# Optional
DATABASE_URL=your_database_url
LOG_LEVEL=info
```

## API Endpoints

### 1. Instagram Post Publishing

**Endpoint:** `POST /instagram/publish`

**Description:** Publishes an image post to Instagram with a caption.

**Request Body:**
```json
{
  "image_url": "https://example.com/image.jpg",
  "caption": "Your post caption with #hashtags",
  "access_token": "optional_override_token"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Post published successfully",
  "post_id": "instagram_post_id",
  "container_id": "media_container_id",
  "instagram_account_id": "ig_business_account_id"
}
```

**Response (Error):**
```json
{
  "error": "Failed to publish post",
  "details": "Specific error message"
}
```

**Requirements:**
- Image URL must be publicly accessible
- Image must be in JPEG or PNG format
- Image dimensions: minimum 320px, maximum 1440px
- Caption maximum length: 2200 characters

### 2. Webhook Endpoints

#### Webhook Verification
**Endpoint:** `GET /webhooks/instagram`
- Used by Facebook to verify webhook subscription
- Responds with challenge token if verification is successful

#### Webhook Event Processing
**Endpoint:** `POST /webhooks/instagram`
- Receives real-time Instagram events
- Validates webhook signature
- Processes and stores events

#### Webhook Management
**Endpoint:** `POST /webhooks/instagram/subscribe`
- Subscribe to Instagram webhook events

**Endpoint:** `DELETE /webhooks/instagram/unsubscribe`
- Unsubscribe from Instagram webhook events

**Endpoint:** `GET /webhooks/instagram/events`
- Retrieve recent webhook events

## Usage Examples

### Publishing a Post

```bash
curl -X POST http://localhost:13732/instagram/publish \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://example.com/my-image.jpg",
    "caption": "Check out this amazing photo! #photography #instagram"
  }'
```

### JavaScript Example

```javascript
async function publishInstagramPost(imageUrl, caption) {
  try {
    const response = await fetch('http://localhost:13732/instagram/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image_url: imageUrl,
        caption: caption
      })
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('Post published successfully!', result.post_id);
    } else {
      console.error('Failed to publish post:', result.error);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

// Usage
publishInstagramPost(
  'https://example.com/image.jpg',
  'My awesome post! #instagram #api'
);
```

## Publishing Workflow

The Instagram post publishing process follows these steps:

1. **Validation**: Validates required fields (image_url, caption)
2. **Account Resolution**: Gets Instagram Business Account ID from Facebook Page
3. **Media Container Creation**: Creates a media container with the image and caption
4. **Container Status Check**: Waits for the container to be processed (up to 20 seconds)
5. **Publishing**: Publishes the media container as an Instagram post
6. **Response**: Returns the published post ID and metadata

## Error Handling

Common errors and solutions:

### Authentication Errors
- **Error**: "Access token is required"
- **Solution**: Ensure `INSTAGRAM_ACCESS_TOKEN` is set in environment variables

### Account Setup Errors
- **Error**: "No Facebook pages found"
- **Solution**: Connect a Facebook Page to your account

- **Error**: "No Instagram Business account connected"
- **Solution**: Connect an Instagram Business account to your Facebook Page

### Media Errors
- **Error**: "Failed to create media container"
- **Solution**: Ensure image URL is publicly accessible and in correct format

- **Error**: "Container not ready after 10 attempts"
- **Solution**: Image processing failed, check image format and size

### Rate Limiting
Instagram API has rate limits:
- 200 requests per hour per user
- 4800 requests per hour per app

## Webhook Events

The server automatically processes these Instagram webhook events:

### Media Events
- New posts published
- Media updates

### Comments Events
- New comments on posts
- Comment replies
- Comment deletions

### Mentions Events
- User mentions in stories
- User mentions in posts

All events are automatically saved to the `webhook_events/` directory for later analysis.

## Testing

### 1. Test Webhook Setup
```bash
# Check webhook verification
curl "http://localhost:13732/webhooks/instagram?hub.mode=subscribe&hub.verify_token=htntoken2&hub.challenge=test123"
```

### 2. Test Post Publishing
```bash
# Test with a sample image
curl -X POST http://localhost:13732/instagram/publish \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://picsum.photos/800/600",
    "caption": "Test post from API! #test #api"
  }'
```

## Security Considerations

1. **Webhook Signature Verification**: All webhook requests are verified using HMAC SHA-256
2. **Access Token Security**: Store access tokens securely in environment variables
3. **HTTPS Required**: Webhook URLs must use HTTPS (use ngrok for local development)
4. **Rate Limiting**: Implement rate limiting for production use

## Troubleshooting

### Server Won't Start
- Check that all required environment variables are set
- Ensure port 13732 is available
- Verify `.env` file exists and is properly formatted

### Webhook Not Receiving Events
- Verify webhook URL is accessible from the internet
- Check that verify token matches in Facebook App settings
- Ensure webhook subscriptions are active

### Publishing Fails
- Verify Instagram Business account is properly connected
- Check image URL accessibility
- Ensure access token has required permissions
- Check Instagram API rate limits

## Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables in `.env`
4. Start ngrok: `ngrok http 13732`
5. Update `WEBHOOK_CALLBACK_URL` with ngrok URL
6. Start the server: `node server.js`
7. Configure webhook in Facebook App settings

## Support

For issues related to:
- **Instagram Graph API**: Check [Instagram Graph API documentation](https://developers.facebook.com/docs/instagram-api)
- **Webhook setup**: Review [Facebook Webhooks documentation](https://developers.facebook.com/docs/graph-api/webhooks)
- **Server issues**: Check server logs and ensure all dependencies are installed
