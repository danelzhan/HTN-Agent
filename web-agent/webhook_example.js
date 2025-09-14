const express = require('express');
const { InstagramWebhookHandler } = require('./instagram_webhooks');

// Example implementation of Instagram webhooks
async function setupInstagramWebhooks() {
  const app = express();
  
  // Middleware
  app.use(express.json());
  
  // Initialize webhook handler
  const webhookHandler = new InstagramWebhookHandler({
    appSecret: process.env.INSTAGRAM_APP_SECRET,
    verifyToken: process.env.INSTAGRAM_VERIFY_TOKEN,
    accessToken: process.env.INSTAGRAM_ACCESS_TOKEN,
    appId: process.env.INSTAGRAM_APP_ID
  });

  // Setup webhook routes
  webhookHandler.setupRoutes(app);

  // Custom event handlers
  webhookHandler.onEvent('media', async (data) => {
    console.log('🎬 New media event:', data.userId);
    
    // Example: Trigger engagement analysis for new posts
    if (data.value.media_id) {
      console.log('📊 Analyzing engagement for new post:', data.value.media_id);
      // You could integrate with your existing engagement analysis here
      // await analyzeEngagementPatterns(data.userId, data.value.media_id);
    }
  });

  webhookHandler.onEvent('comments', async (data) => {
    console.log('💬 New comment event:', data.userId);
    
    // Example: Analyze comment sentiment
    if (data.value.comment_id) {
      console.log('🔍 Analyzing comment sentiment:', data.value.comment_id);
      // You could integrate sentiment analysis here
      // await analyzeCommentSentiment(data.value.comment_id);
    }
  });

  webhookHandler.onEvent('mentions', async (data) => {
    console.log('📢 New mention event:', data.userId);
    
    // Example: Track brand mentions
    if (data.value.media_id) {
      console.log('🏷️ Processing brand mention:', data.value.media_id);
      // You could track mentions for campaign analysis
      // await trackBrandMention(data.userId, data.value.media_id);
    }
  });

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      subscriptions: Array.from(webhookHandler.subscriptions)
    });
  });

  // Dashboard endpoint to view recent events
  app.get('/webhook-events', (req, res) => {
    const fs = require('fs');
    const path = require('path');
    
    try {
      const eventsDir = path.join(__dirname, 'webhook_events');
      const files = fs.readdirSync(eventsDir)
        .filter(file => file.endsWith('.json'))
        .sort((a, b) => b.localeCompare(a)) // Most recent first
        .slice(0, 20); // Last 20 events
      
      const events = files.map(file => {
        const filepath = path.join(eventsDir, file);
        return JSON.parse(fs.readFileSync(filepath, 'utf8'));
      });
      
      res.json({ events, total: files.length });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Start server
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Instagram Webhook server running on port ${PORT}`);
    console.log(`📡 Webhook endpoint: http://localhost:${PORT}/webhooks/instagram`);
    console.log(`🔍 Health check: http://localhost:${PORT}/health`);
    console.log(`📊 Events dashboard: http://localhost:${PORT}/webhook-events`);
  });

  return { app, webhookHandler };
}

// Example: Subscribe to webhooks programmatically
async function subscribeToInstagramWebhooks() {
  try {
    const webhookHandler = new InstagramWebhookHandler();
    
    console.log('📝 Subscribing to Instagram webhooks...');
    
    // Subscribe to media, comments, and mentions
    const result = await webhookHandler.subscribeToWebhooks([
      'media',
      'comments', 
      'mentions',
      'story_insights'
    ]);
    
    console.log('✅ Webhook subscription successful:', result);
    
    // Check current subscriptions
    const subscriptions = await webhookHandler.getSubscriptions();
    console.log('📋 Current subscriptions:', subscriptions);
    
  } catch (error) {
    console.error('❌ Webhook subscription failed:', error.message);
  }
}

// Example: Integration with existing engagement analysis
async function integrateWithEngagementAnalysis() {
  const webhookHandler = new InstagramWebhookHandler();
  
  // Import your existing engagement agent
  // const { EngagementPatternAgent } = require('./engagement_agent');
  // const engagementAgent = new EngagementPatternAgent();
  
  webhookHandler.onEvent('media', async (data) => {
    try {
      console.log('🔄 Processing new media for engagement analysis...');
      
      // Example integration with your existing engagement analysis
      // const analysis = await engagementAgent.analyzePost({
      //   userId: data.userId,
      //   mediaId: data.value.media_id,
      //   timestamp: new Date().toISOString()
      // });
      
      // console.log('📊 Engagement analysis complete:', analysis);
      
    } catch (error) {
      console.error('❌ Error in engagement analysis:', error.message);
    }
  });
}

// Example: Integration with marketing campaign analysis
async function integrateWithCampaignAnalysis() {
  const webhookHandler = new InstagramWebhookHandler();
  
  // Import your marketing campaign agent
  // const { MarketingCampaignAgent } = require('./market_agent');
  // const campaignAgent = new MarketingCampaignAgent();
  
  webhookHandler.onEvent('mentions', async (data) => {
    try {
      console.log('🎯 Processing mention for campaign analysis...');
      
      // Example: Track campaign mentions and engagement
      // const campaignData = await campaignAgent.analyzeMention({
      //   userId: data.userId,
      //   mediaId: data.value.media_id,
      //   timestamp: new Date().toISOString()
      // });
      
      // console.log('📈 Campaign mention analyzed:', campaignData);
      
    } catch (error) {
      console.error('❌ Error in campaign analysis:', error.message);
    }
  });
}

// Run the webhook server if this file is executed directly
if (require.main === module) {
  setupInstagramWebhooks().catch(console.error);
}

module.exports = {
  setupInstagramWebhooks,
  subscribeToInstagramWebhooks,
  integrateWithEngagementAnalysis,
  integrateWithCampaignAnalysis
};
