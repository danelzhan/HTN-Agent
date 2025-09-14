const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class InstagramWebhookHandler {
  constructor(options = {}) {
    this.appSecret = options.appSecret || process.env.INSTAGRAM_APP_SECRET;
    this.verifyToken = options.verifyToken || process.env.INSTAGRAM_VERIFY_TOKEN;
    this.accessToken = options.accessToken || process.env.INSTAGRAM_ACCESS_TOKEN;
    this.appId = options.appId || process.env.INSTAGRAM_APP_ID;
    
    if (!this.appSecret || !this.verifyToken || !this.accessToken || !this.appId) {
      throw new Error('Missing required Instagram API credentials');
    }
    
    this.eventHandlers = new Map();
    this.subscriptions = new Set();
    
    // Setup event storage
    this.eventsDir = path.join(__dirname, 'webhook_events');
    this.ensureDir(this.eventsDir);
  }

  ensureDir(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Verify webhook signature from Instagram
   */
  verifySignature(payload, signature) {
    if (!signature) return false;
    
    const expectedSignature = crypto
      .createHmac('sha256', this.appSecret)
      .update(payload, 'utf8')
      .digest('hex');
    
    const receivedSignature = signature.replace('sha256=', '');
    
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(receivedSignature, 'hex')
    );
  }

  /**
   * Handle webhook verification challenge
   */
  handleVerification(req, res) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log('[WEBHOOK] Verification request:', { mode, token });

    if (mode === 'subscribe' && token === this.verifyToken) {
      console.log('[WEBHOOK] Verification successful');
      res.status(200).send(challenge);
      return true;
    } else {
      console.log('[WEBHOOK] Verification failed');
      res.status(403).send('Forbidden');
      return false;
    }
  }

  /**
   * Process incoming webhook events
   */
  async processWebhookEvent(req, res) {
    const signature = req.headers['x-hub-signature-256'];
    const payload = JSON.stringify(req.body);

    // Verify signature
    if (!this.verifySignature(payload, signature)) {
      console.log('[WEBHOOK] Invalid signature');
      res.status(401).send('Unauthorized');
      return;
    }

    const data = req.body;
    console.log('[WEBHOOK] Received event:', JSON.stringify(data, null, 2));

    // Save event to file
    await this.saveEvent(data);

    // Process each entry
    if (data.entry && Array.isArray(data.entry)) {
      for (const entry of data.entry) {
        await this.processEntry(entry);
      }
    }

    res.status(200).send('OK');
  }

  /**
   * Save webhook event to file
   */
  async saveEvent(eventData) {
    const timestamp = new Date().toISOString();
    const filename = `event_${Date.now()}.json`;
    const filepath = path.join(this.eventsDir, filename);
    
    const eventRecord = {
      timestamp,
      data: eventData,
      processed: false
    };
    
    fs.writeFileSync(filepath, JSON.stringify(eventRecord, null, 2));
    console.log('[WEBHOOK] Event saved:', filepath);
  }

  /**
   * Process individual entry from webhook
   */
  async processEntry(entry) {
    console.log('[WEBHOOK] Processing entry:', entry.id);

    // Handle different types of changes
    if (entry.changes) {
      for (const change of entry.changes) {
        await this.handleChange(entry.id, change);
      }
    }

    // Handle messaging events
    if (entry.messaging) {
      for (const message of entry.messaging) {
        await this.handleMessage(entry.id, message);
      }
    }
  }

  /**
   * Handle different types of changes
   */
  async handleChange(userId, change) {
    const { field, value } = change;
    
    console.log(`[WEBHOOK] Change detected - Field: ${field}, User: ${userId}`);
    
    switch (field) {
      case 'media':
        await this.handleMediaChange(userId, value);
        break;
      case 'comments':
        await this.handleCommentChange(userId, value);
        break;
      case 'mentions':
        await this.handleMentionChange(userId, value);
        break;
      case 'story_insights':
        await this.handleStoryInsights(userId, value);
        break;
      default:
        console.log(`[WEBHOOK] Unhandled field type: ${field}`);
    }

    // Trigger custom event handlers
    await this.triggerEventHandlers(field, { userId, value });
  }

  /**
   * Handle media changes (new posts, updates)
   */
  async handleMediaChange(userId, value) {
    console.log('[WEBHOOK] Media change:', value);
    
    if (value.media_id) {
      try {
        // Fetch detailed media information
        const mediaDetails = await this.getMediaDetails(value.media_id);
        console.log('[WEBHOOK] Media details fetched:', mediaDetails.id);
        
        // Save media info
        await this.saveMediaEvent(userId, mediaDetails);
        
      } catch (error) {
        console.error('[WEBHOOK] Error fetching media details:', error.message);
      }
    }
  }

  /**
   * Handle comment changes
   */
  async handleCommentChange(userId, value) {
    console.log('[WEBHOOK] Comment change:', value);
    
    if (value.comment_id) {
      try {
        const commentDetails = await this.getCommentDetails(value.comment_id);
        console.log('[WEBHOOK] Comment details:', commentDetails);
        
        await this.saveCommentEvent(userId, commentDetails);
        
      } catch (error) {
        console.error('[WEBHOOK] Error fetching comment details:', error.message);
      }
    }
  }

  /**
   * Handle mention changes
   */
  async handleMentionChange(userId, value) {
    console.log('[WEBHOOK] Mention change:', value);
    
    if (value.media_id) {
      try {
        const mentionDetails = await this.getMentionDetails(value.media_id);
        await this.saveMentionEvent(userId, mentionDetails);
        
      } catch (error) {
        console.error('[WEBHOOK] Error fetching mention details:', error.message);
      }
    }
  }

  /**
   * Handle story insights
   */
  async handleStoryInsights(userId, value) {
    console.log('[WEBHOOK] Story insights:', value);
    await this.saveStoryInsightsEvent(userId, value);
  }

  /**
   * Handle messaging events
   */
  async handleMessage(userId, message) {
    console.log('[WEBHOOK] Message event:', message);
    await this.saveMessageEvent(userId, message);
  }

  /**
   * Fetch media details from Instagram Graph API
   */
  async getMediaDetails(mediaId) {
    const url = `https://graph.facebook.com/v18.0/${mediaId}`;
    const params = {
      fields: 'id,media_type,media_url,permalink,thumbnail_url,timestamp,caption,like_count,comments_count,insights.metric(impressions,reach,engagement)',
      access_token: this.accessToken
    };

    const response = await axios.get(url, { params });
    return response.data;
  }

  /**
   * Fetch comment details
   */
  async getCommentDetails(commentId) {
    const url = `https://graph.facebook.com/v18.0/${commentId}`;
    const params = {
      fields: 'id,text,timestamp,from,media,like_count,replies',
      access_token: this.accessToken
    };

    const response = await axios.get(url, { params });
    return response.data;
  }

  /**
   * Fetch mention details
   */
  async getMentionDetails(mediaId) {
    const url = `https://graph.facebook.com/v18.0/${mediaId}`;
    const params = {
      fields: 'id,media_type,media_url,permalink,timestamp,caption,username',
      access_token: this.accessToken
    };

    const response = await axios.get(url, { params });
    return response.data;
  }

  /**
   * Save different types of events
   */
  async saveMediaEvent(userId, mediaData) {
    const filename = `media_${mediaData.id}_${Date.now()}.json`;
    const filepath = path.join(this.eventsDir, filename);
    
    const event = {
      type: 'media',
      userId,
      timestamp: new Date().toISOString(),
      data: mediaData
    };
    
    fs.writeFileSync(filepath, JSON.stringify(event, null, 2));
  }

  async saveCommentEvent(userId, commentData) {
    const filename = `comment_${commentData.id}_${Date.now()}.json`;
    const filepath = path.join(this.eventsDir, filename);
    
    const event = {
      type: 'comment',
      userId,
      timestamp: new Date().toISOString(),
      data: commentData
    };
    
    fs.writeFileSync(filepath, JSON.stringify(event, null, 2));
  }

  async saveMentionEvent(userId, mentionData) {
    const filename = `mention_${mentionData.id}_${Date.now()}.json`;
    const filepath = path.join(this.eventsDir, filename);
    
    const event = {
      type: 'mention',
      userId,
      timestamp: new Date().toISOString(),
      data: mentionData
    };
    
    fs.writeFileSync(filepath, JSON.stringify(event, null, 2));
  }

  async saveStoryInsightsEvent(userId, insightsData) {
    const filename = `story_insights_${Date.now()}.json`;
    const filepath = path.join(this.eventsDir, filename);
    
    const event = {
      type: 'story_insights',
      userId,
      timestamp: new Date().toISOString(),
      data: insightsData
    };
    
    fs.writeFileSync(filepath, JSON.stringify(event, null, 2));
  }

  async saveMessageEvent(userId, messageData) {
    const filename = `message_${Date.now()}.json`;
    const filepath = path.join(this.eventsDir, filename);
    
    const event = {
      type: 'message',
      userId,
      timestamp: new Date().toISOString(),
      data: messageData
    };
    
    fs.writeFileSync(filepath, JSON.stringify(event, null, 2));
  }

  /**
   * Register custom event handlers
   */
  onEvent(eventType, handler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType).push(handler);
  }

  /**
   * Trigger custom event handlers
   */
  async triggerEventHandlers(eventType, data) {
    const handlers = this.eventHandlers.get(eventType) || [];
    
    for (const handler of handlers) {
      try {
        await handler(data);
      } catch (error) {
        console.error(`[WEBHOOK] Error in event handler for ${eventType}:`, error.message);
      }
    }
  }

  /**
   * Subscribe to webhook events
   */
  async subscribeToWebhooks(fields = ['media', 'comments', 'mentions']) {
    const url = `https://graph.facebook.com/v18.0/${this.appId}/subscriptions`;
    
    const params = {
      object: 'instagram',
      callback_url: process.env.WEBHOOK_CALLBACK_URL,
      fields: fields.join(','),
      verify_token: this.verifyToken,
      access_token: this.accessToken
    };

    try {
      const response = await axios.post(url, null, { params });
      console.log('[WEBHOOK] Subscription successful:', response.data);
      
      fields.forEach(field => this.subscriptions.add(field));
      return response.data;
      
    } catch (error) {
      console.error('[WEBHOOK] Subscription failed:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get current webhook subscriptions
   */
  async getSubscriptions() {
    const url = `https://graph.facebook.com/v18.0/${this.appId}/subscriptions`;
    const params = {
      access_token: this.accessToken
    };

    try {
      const response = await axios.get(url, { params });
      return response.data;
    } catch (error) {
      console.error('[WEBHOOK] Error fetching subscriptions:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Delete webhook subscription
   */
  async deleteSubscription(object = 'instagram') {
    const url = `https://graph.facebook.com/v18.0/${this.appId}/subscriptions`;
    const params = {
      object,
      access_token: this.accessToken
    };

    try {
      const response = await axios.delete(url, { params });
      console.log('[WEBHOOK] Subscription deleted:', response.data);
      this.subscriptions.clear();
      return response.data;
    } catch (error) {
      console.error('[WEBHOOK] Error deleting subscription:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Setup Express routes for webhooks
   */
  setupRoutes(app) {
    // Webhook verification endpoint
    app.get('/webhooks/instagram', (req, res) => {
      this.handleVerification(req, res);
    });

    // Webhook event endpoint
    app.post('/webhooks/instagram', express.raw({ type: 'application/json' }), (req, res) => {
      // Parse JSON manually since we need raw body for signature verification
      req.body = JSON.parse(req.body.toString());
      this.processWebhookEvent(req, res);
    });

    // Management endpoints
    app.get('/webhooks/instagram/subscriptions', async (req, res) => {
      try {
        const subscriptions = await this.getSubscriptions();
        res.json(subscriptions);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.post('/webhooks/instagram/subscribe', async (req, res) => {
      try {
        const { fields } = req.body;
        const result = await this.subscribeToWebhooks(fields);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.delete('/webhooks/instagram/subscriptions', async (req, res) => {
      try {
        const result = await this.deleteSubscription();
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    console.log('[WEBHOOK] Routes setup complete');
  }
}

module.exports = { InstagramWebhookHandler };
