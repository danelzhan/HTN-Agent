# Instagram Graph API Webhooks Setup Guide

## Overview
This guide helps you set up Instagram Graph API webhooks to receive real-time notifications about Instagram events like new posts, comments, and mentions.

## Prerequisites

1. **Instagram Business Account** connected to a Facebook Page
2. **Facebook App** with Instagram Graph API permissions
3. **HTTPS endpoint** for webhook callbacks (required by Facebook)

## Setup Steps

### 1. Facebook App Configuration

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create a new app or use existing app
3. Add Instagram Graph API product
4. Configure Instagram permissions:
   - `instagram_graph_user_profile`
   - `instagram_graph_user_media`
   - `pages_show_list`
   - `pages_read_engagement`

### 2. Environment Configuration

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Required variables:
- `INSTAGRAM_APP_ID`: Your Facebook App ID
- `INSTAGRAM_APP_SECRET`: Your Facebook App Secret
- `INSTAGRAM_ACCESS_TOKEN`: Long-lived access token
- `INSTAGRAM_VERIFY_TOKEN`: Custom token for webhook verification
- `WEBHOOK_CALLBACK_URL`: Your public HTTPS webhook endpoint

### 3. Deploy Webhook Endpoint

Your webhook endpoint must be publicly accessible via HTTPS. Options:

#### Option A: Use ngrok for testing
```bash
npm install -g ngrok
ngrok http 3000
# Use the HTTPS URL as your WEBHOOK_CALLBACK_URL
```

#### Option B: Deploy to cloud service
- Heroku, Vercel, Railway, etc.
- Make sure to set environment variables

### 4. Start the Webhook Server

```bash
npm install express axios
node webhook_example.js
```

### 5. Subscribe to Webhooks

#### Method 1: Programmatic subscription
```javascript
const { subscribeToInstagramWebhooks } = require('./webhook_example');
await subscribeToInstagramWebhooks();
```

#### Method 2: Manual API call
```bash
curl -X POST "https://graph.facebook.com/v18.0/{app-id}/subscriptions" \
  -d "object=instagram" \
  -d "callback_url=https://yourdomain.com/webhooks/instagram" \
  -d "fields=media,comments,mentions" \
  -d "verify_token=your_verify_token" \
  -d "access_token=your_access_token"
```

#### Method 3: Facebook App Dashboard
1. Go to your Facebook App
2. Navigate to Webhooks
3. Add webhook subscription for Instagram
4. Enter your callback URL and verify token

## Webhook Events

### Media Events
Triggered when:
- New post is published
- Post is updated or deleted
- Media insights are available

### Comment Events
Triggered when:
- New comment on your media
- Comment is updated or deleted
- Reply to comment

### Mention Events
Triggered when:
- Your account is mentioned in stories
- Your account is tagged in posts

### Story Insights
Triggered when:
- Story insights become available
- Story expires

## Testing Webhooks

### 1. Verify Webhook Setup
```bash
curl "http://localhost:3000/health"
```

### 2. Check Subscriptions
```bash
curl "http://localhost:3000/webhooks/instagram/subscriptions"
```

### 3. View Recent Events
```bash
curl "http://localhost:3000/webhook-events"
```

### 4. Test with Real Instagram Activity
1. Post something on your Instagram account
2. Check webhook events endpoint
3. Look for saved event files in `webhook_events/` directory

## Integration Examples

### With Engagement Analysis
```javascript
const { integrateWithEngagementAnalysis } = require('./webhook_example');
await integrateWithEngagementAnalysis();
```

### With Campaign Analysis
```javascript
const { integrateWithCampaignAnalysis } = require('./webhook_example');
await integrateWithCampaignAnalysis();
```

## Troubleshooting

### Common Issues

1. **Webhook verification fails**
   - Check `INSTAGRAM_VERIFY_TOKEN` matches what you set in Facebook
   - Ensure endpoint is accessible via HTTPS

2. **Signature verification fails**
   - Verify `INSTAGRAM_APP_SECRET` is correct
   - Check raw body is being used for signature calculation

3. **No events received**
   - Confirm webhook subscription is active
   - Check Instagram account is connected to Facebook Page
   - Verify permissions are granted

4. **403 Forbidden errors**
   - Check access token is valid and not expired
   - Verify app has necessary permissions

### Debug Mode
Set `LOG_LEVEL=debug` in your `.env` file for detailed logging.

### Webhook Validation
Facebook provides a webhook testing tool in the App Dashboard under Webhooks section.

## Security Best Practices

1. **Always verify signatures** - Implemented in `InstagramWebhookHandler`
2. **Use HTTPS only** - Required by Facebook
3. **Validate verify token** - Prevents unauthorized webhook calls
4. **Rate limiting** - Consider implementing rate limits
5. **Error handling** - Graceful handling of malformed requests

## API Limits

- **Webhook calls**: No specific limit, but should respond within 20 seconds
- **Graph API calls**: Standard rate limits apply
- **Event retention**: Store events locally as needed

## Next Steps

1. Integrate with your existing engagement analysis
2. Set up monitoring and alerting
3. Implement data persistence (database)
4. Add webhook event filtering
5. Create dashboard for webhook analytics

## Support

- [Instagram Graph API Documentation](https://developers.facebook.com/docs/instagram-api/)
- [Webhooks Documentation](https://developers.facebook.com/docs/graph-api/webhooks/)
- [Facebook Developer Community](https://developers.facebook.com/community/)
