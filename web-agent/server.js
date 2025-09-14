require("dotenv").config();
const http = require('http');
const url = require('url');
const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { analyzeProfileCollage, scrape_image, poi_search, readSystemPrompt, getUserInfo } = require('./agent-functions');
const { MarketingCampaignAgent } = require('./market_agent');

function parse_data(data) {
  return data.map(d => ({ username: d.string_list_data[0].value, url: d.string_list_data[0].href }));
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname)
  }
});
const upload = multer({ storage: storage });

class APIHandler {
  constructor() {
    this.server = http.createServer((req, res) => this.handleRequest(req, res));
    this.marketingAgent = new MarketingCampaignAgent();
    
    // Instagram webhook configuration
    this.appSecret = process.env.INSTAGRAM_APP_SECRET;
    this.verifyToken = process.env.INSTAGRAM_VERIFY_TOKEN;
    this.accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    this.appId = process.env.INSTAGRAM_APP_ID;
    
    // Setup webhook events storage
    this.eventsDir = path.join(__dirname, 'webhook_events');
    this.ensureDir(this.eventsDir);
  }

  ensureDir(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  async handleRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);
    
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
    res.setHeader('Access-Control-Max-Age', '86400');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Instagram webhook verification (GET)
    if (req.method === 'GET' && parsedUrl.pathname === '/webhooks/instagram') {
      return this.handleWebhookVerification(req, res, parsedUrl.query);
    }

    // Instagram webhook events (POST)
    if (req.method === 'POST' && parsedUrl.pathname === '/webhooks/instagram') {
      return this.handleWebhookEvent(req, res);
    }

    // Webhook management endpoints
    if (req.method === 'GET' && parsedUrl.pathname === '/webhooks/subscriptions') {
      return this.getWebhookSubscriptions(req, res);
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/webhooks/subscribe') {
      return this.subscribeToWebhooks(req, res);
    }

    if (req.method === 'DELETE' && parsedUrl.pathname === '/webhooks/subscriptions') {
      return this.deleteWebhookSubscription(req, res);
    }

    // Webhook events dashboard
    if (req.method === 'GET' && parsedUrl.pathname === '/webhook-events') {
      return this.getWebhookEvents(req, res);
    }

    // Instagram post publishing
    if (req.method === 'POST' && parsedUrl.pathname === '/instagram/publish') {
      return this.publishInstagramPost(req, res);
    }

    // Instagram post engagement data
    if (req.method === 'GET' && parsedUrl.pathname === '/instagram/posts') {
      return this.getInstagramPosts(req, res);
    }

    if (req.method === 'GET' && parsedUrl.pathname.startsWith('/instagram/posts/')) {
      const postId = parsedUrl.pathname.split('/')[3];
      return this.getPostEngagement(req, res, postId);
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        status: 'Instagram Agent API with Webhooks is running',
        endpoints: {
          'POST /get-user-info': 'Get user analysis by username',
          'POST /analyze-profiles': 'Compare follower lists',
          'POST /analyze-campaign': 'Analyze marketing campaign files',
          'POST /approve-suggestion': 'Approve/reject campaign suggestions',
          'POST /upload-campaign-files': 'Upload campaign files for analysis',
          'POST /analyze-engagement-patterns': 'Analyze user engagement patterns and detect anomalies',
          'GET /webhooks/instagram': 'Instagram webhook verification',
          'POST /webhooks/instagram': 'Instagram webhook events',
          'GET /webhooks/subscriptions': 'Get current webhook subscriptions',
          'POST /webhooks/subscribe': 'Subscribe to Instagram webhooks',
          'DELETE /webhooks/subscriptions': 'Delete webhook subscriptions',
          'GET /webhook-events': 'View recent webhook events',
          'POST /instagram/publish': 'Publish image post to Instagram'
        },
        usage: {
          'get-user-info': 'curl -X POST http://YOUR_IP:13732/get-user-info -H "Content-Type: application/json" -d \'{"username": "example_user"}\'',
          'analyze-profiles': 'curl -X POST http://YOUR_IP:13732/analyze-profiles -H "Content-Type: application/json" -d \'{"pre_campaign_data": [...], "post_campaign_data": [...]}\'',
          'analyze-campaign': 'curl -X POST http://YOUR_IP:13732/analyze-campaign -H "Content-Type: application/json" -d \'{"files": [{"path": "file1.pdf"}, {"path": "image1.jpg"}]}\'',
          'upload-campaign-files': 'curl -X POST http://YOUR_IP:13732/upload-campaign-files -F "files=@campaign.pdf" -F "files=@image.jpg"',
          'analyze-engagement-patterns': 'curl -X POST http://YOUR_IP:13732/analyze-engagement-patterns -H "Content-Type: application/json" -d \'{"username": "target_user", "numberOfPosts": 10}\''
        }
      }));
    } else if (req.method === 'POST' && parsedUrl.pathname === '/analyze-profiles') {
      await this.handleAnalyzeProfiles(req, res);
    } else if (req.method === 'POST' && parsedUrl.pathname === '/get-user-info') {
      await this.handleGetUserInfo(req, res);
    } else if (req.method === 'POST' && parsedUrl.pathname === '/analyze-campaign') {
      await this.handleCampaignAnalysis(req, res);
    } else if (req.method === 'POST' && parsedUrl.pathname === '/approve-suggestion') {
      await this.handleSuggestionApproval(req, res);
    } else if (req.method === 'POST' && parsedUrl.pathname === '/upload-campaign-files') {
      await this.handleFileUpload(req, res);
    } else if (req.method === 'POST' && parsedUrl.pathname === '/analyze-engagement-patterns') {
      await this.handleEngagementAnalysis(req, res);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
    }
  }

  async handleAnalyzeProfiles(req, res) {
    try {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          const requestData = JSON.parse(body);
          const { pre_campaign_data, post_campaign_data, limit = 3 } = requestData;

          if (!pre_campaign_data || !post_campaign_data) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing pre_campaign_data or post_campaign_data' }));
            return;
          }

          console.log(`[API] Starting profile analysis with limit: ${limit}`);

          const pre = parse_data(pre_campaign_data);
          const post = parse_data(post_campaign_data);
          const poi = poi_search(pre, post);
          
          console.log(`[API] Found ${poi.new.length} new, ${poi.lost.length} lost followers`);
          
          const toProcess = [...poi.new, ...poi.lost].slice(0, limit);
          const SYSTEM_PROMPT = readSystemPrompt();
          
          const users = [];
          
          for (const u of toProcess) {
            try {
              console.log(`[API] Processing user: ${u.username}`);
              await scrape_image(u.url, u.username, 800);
              const result = await analyzeProfileCollage(u.username, SYSTEM_PROMPT);
              users.push(result);
            } catch (error) {
              console.error(`[API] Error processing ${u.username}:`, error.message);
              users.push({
                user_name: u.username,
                ok: false,
                error: error.message,
                timestamp: new Date().toISOString()
              });
            }
          }

          // Format response similar to mock server
          const response = {
            success: true,
            processed: users.length,
            users: users.map(u => {
              if (u.ok && u.analysis) {
                try {
                  const analysis = JSON.parse(u.analysis.replace(/```json\n?|\n?```/g, ''));
                  return {
                    username: u.user_name,
                    labels: analysis.labels || [],
                    data: {
                      text: analysis.data || "No analysis available"
                    },
                    stats: analysis.stats || {},
                    collage_path: u.collage_path
                  };
                } catch (e) {
                  return {
                    username: u.user_name,
                    labels: [],
                    data: { text: "Failed to parse analysis" },
                    error: e.message
                  };
                }
              } else {
                return {
                  username: u.user_name,
                  labels: [],
                  data: { text: "Analysis failed" },
                  error: u.error
                };
              }
            })
          };

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response, null, 2));

        } catch (error) {
          console.error('[API] Error processing request:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error', details: error.message }));
        }
      });

    } catch (error) {
      console.error('[API] Error handling request:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  async handleGetUserInfo(req, res) {
    console.log("[API] Getting user info")
    try {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          const requestData = JSON.parse(body);
          const { username } = requestData;

          if (!username) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing username' }));
            return;
          }

          console.log(`[API] Getting user info for: ${username}`);

          const result = await getUserInfo(username);
          
          // Format response
          let response;
          if (result.ok && result.analysis) {
            try {
              const analysis = JSON.parse(result.analysis.replace(/```json\n?|\n?```/g, ''));
              response = {
                success: true,
                username: result.user_name,
                labels: analysis.labels || [],
                data: {
                  text: analysis.data || "No analysis available"
                },
                stats: analysis.stats || {},
                collage_path: result.collage_path,
                profile_screenshot: result.profile_screenshot,
                post_images_count: result.post_images_count,
                timestamp: result.timestamp
              };
            } catch (e) {
              response = {
                success: false,
                username: result.user_name,
                error: "Failed to parse analysis",
                raw_analysis: result.analysis,
                timestamp: result.timestamp
              };
            }
          } else {
            response = {
              success: false,
              username: result.user_name,
              error: result.error || "Analysis failed",
              timestamp: result.timestamp
            };
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response, null, 2));

        } catch (error) {
          console.error('[API] Error processing user info request:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error', details: error.message }));
        }
      });

    } catch (error) {
      console.error('[API] Error handling user info request:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  async handleCampaignAnalysis(req, res) {
    try {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          const requestData = JSON.parse(body);
          const { files } = requestData;

          if (!files || !Array.isArray(files)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing files array' }));
            return;
          }

          console.log(`[API] Starting campaign analysis for ${files.length} files`);

          const analysis = await this.marketingAgent.analyzeCampaign(files);

          const response = {
            success: true,
            analysis,
            message: 'Campaign analyzed successfully'
          };

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response, null, 2));

        } catch (error) {
          console.error('[API] Error processing campaign analysis:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error', details: error.message }));
        }
      });

    } catch (error) {
      console.error('[API] Error handling campaign analysis:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  async handleSuggestionApproval(req, res) {
    try {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          const requestData = JSON.parse(body);
          const { suggestionId, approved = true } = requestData;

          if (!suggestionId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing suggestionId' }));
            return;
          }

          console.log(`[API] ${approved ? 'Approving' : 'Rejecting'} suggestion: ${suggestionId}`);

          const result = await this.marketingAgent.approveSuggestion(suggestionId, approved);

          const response = {
            success: true,
            result,
            message: approved ? 'Suggestion approved' : 'Suggestion rejected'
          };

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response, null, 2));

        } catch (error) {
          console.error('[API] Error processing suggestion approval:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error', details: error.message }));
        }
      });

    } catch (error) {
      console.error('[API] Error handling suggestion approval:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  async handleFileUpload(req, res) {
    try {
      // Since we're using raw HTTP server, we need to handle multipart manually
      // For now, return instructions for using the analyze-campaign endpoint
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        message: 'File upload endpoint - use analyze-campaign with file paths instead',
        instructions: {
          step1: 'Upload files to the uploads/ directory',
          step2: 'Call /analyze-campaign with file paths',
          example: {
            endpoint: '/analyze-campaign',
            payload: {
              files: [
                { path: './uploads/campaign.pdf' },
                { path: './uploads/image.jpg' }
              ]
            }
          }
        }
      }));
    } catch (error) {
      console.error('[API] Error handling file upload:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  async handleEngagementAnalysis(req, res) {
    try {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          const requestData = JSON.parse(body);
          const { username, numberOfPosts = 10 } = requestData;

          if (!username) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing username parameter' }));
            return;
          }

          console.log(`[API] Starting engagement pattern analysis for @${username} with ${numberOfPosts} posts`);

          // Engagement analysis functionality would go here
          const analysis = { message: "Engagement analysis not yet implemented" };

          const response = {
            success: true,
            analysis,
            message: 'Engagement pattern analysis completed successfully'
          };

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response, null, 2));

        } catch (error) {
          console.error('[API] Error processing engagement analysis:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error', details: error.message }));
        }
      });

    } catch (error) {
      console.error('[API] Error handling engagement analysis:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  // Instagram Webhook Methods
  handleWebhookVerification(req, res, query) {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    console.log('[WEBHOOK] Verification request:', { mode, token });

    if (mode === 'subscribe' && token === this.verifyToken) {
      console.log('[WEBHOOK] Verification successful');
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(challenge);
    } else {
      console.log('[WEBHOOK] Verification failed');
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
    }
  }

  async handleWebhookEvent(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const signature = req.headers['x-hub-signature-256'];
        
        // Verify signature
        if (!this.verifySignature(body, signature)) {
          console.log('[WEBHOOK] Invalid signature');
          res.writeHead(401, { 'Content-Type': 'text/plain' });
          res.end('Unauthorized');
          return;
        }

        const data = JSON.parse(body);
        console.log('[WEBHOOK] Received event:', JSON.stringify(data, null, 2));

        // Save event
        await this.saveWebhookEvent(data);

        // Process entries
        if (data.entry && Array.isArray(data.entry)) {
          for (const entry of data.entry) {
            await this.processWebhookEntry(entry);
          }
        }

        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
      } catch (error) {
        console.error('[WEBHOOK] Error processing event:', error.message);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      }
    });
  }

  verifySignature(payload, signature) {
    if (!signature || !this.appSecret) return false;
    
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

  async saveWebhookEvent(eventData) {
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

  async processWebhookEntry(entry) {
    console.log('[WEBHOOK] Processing entry:', entry.id);

    if (entry.changes) {
      for (const change of entry.changes) {
        await this.handleWebhookChange(entry.id, change);
      }
    }
  }

  async handleWebhookChange(userId, change) {
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
      default:
        console.log(`[WEBHOOK] Unhandled field type: ${field}`);
    }
  }

  async handleMediaChange(userId, value) {
    console.log('[WEBHOOK] Media change:', value);
    
    if (value.media_id) {
      try {
        // Auto-trigger engagement analysis for new posts
        console.log(`[WEBHOOK] Triggering engagement analysis for new media: ${value.media_id}`);
        // You can integrate with your existing engagement analysis here
        // await this.engagementAgent.analyzeEngagementPatterns(userId, 1);
        
        // Save media event
        const filename = `media_${value.media_id}_${Date.now()}.json`;
        const filepath = path.join(this.eventsDir, filename);
        const event = {
          type: 'media',
          userId,
          timestamp: new Date().toISOString(),
          data: value
        };
        fs.writeFileSync(filepath, JSON.stringify(event, null, 2));
        
      } catch (error) {
        console.error('[WEBHOOK] Error handling media change:', error.message);
      }
    }
  }

  async handleCommentChange(userId, value) {
    console.log('[WEBHOOK] Comment change:', value);
    
    // Save comment event
    const filename = `comment_${value.comment_id || Date.now()}_${Date.now()}.json`;
    const filepath = path.join(this.eventsDir, filename);
    const event = {
      type: 'comment',
      userId,
      timestamp: new Date().toISOString(),
      data: value
    };
    fs.writeFileSync(filepath, JSON.stringify(event, null, 2));
  }

  async handleMentionChange(userId, value) {
    console.log('[WEBHOOK] Mention change:', value);
    
    // Save mention event
    const filename = `mention_${value.media_id || Date.now()}_${Date.now()}.json`;
    const filepath = path.join(this.eventsDir, filename);
    const event = {
      type: 'mention',
      userId,
      timestamp: new Date().toISOString(),
      data: value
    };
    fs.writeFileSync(filepath, JSON.stringify(event, null, 2));
  }

  async getWebhookSubscriptions(req, res) {
    try {
      const url = `https://graph.facebook.com/v18.0/${this.appId}/subscriptions`;
      const response = await axios.get(url, {
        params: { access_token: this.accessToken }
      });
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.error('[WEBHOOK] Error fetching subscriptions:', error.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  async subscribeToWebhooks(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { fields = ['media', 'comments', 'mentions'] } = JSON.parse(body);
        
        const url = `https://graph.facebook.com/v18.0/${this.appId}/subscriptions`;
        const response = await axios.post(url, null, {
          params: {
            object: 'instagram',
            callback_url: process.env.WEBHOOK_CALLBACK_URL,
            fields: fields.join(','),
            verify_token: this.verifyToken,
            access_token: this.accessToken
          }
        });
        
        console.log('[WEBHOOK] Subscription successful:', response.data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response.data, null, 2));
      } catch (error) {
        console.error('[WEBHOOK] Subscription failed:', error.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  }

  async deleteWebhookSubscription(req, res) {
    try {
      const url = `https://graph.facebook.com/v18.0/${this.appId}/subscriptions`;
      const response = await axios.delete(url, {
        params: {
          object: 'instagram',
          access_token: this.accessToken
        }
      });
      
      console.log('[WEBHOOK] Subscription deleted:', response.data);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.error('[WEBHOOK] Error deleting subscription:', error.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  getWebhookEvents(req, res) {
    try {
      const files = fs.readdirSync(this.eventsDir)
        .filter(file => file.endsWith('.json'))
        .sort((a, b) => b.localeCompare(a))
        .slice(0, 20);
      
      const events = files.map(file => {
        const filepath = path.join(this.eventsDir, file);
        return JSON.parse(fs.readFileSync(filepath, 'utf8'));
      });
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ events, total: files.length }, null, 2));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  // Instagram Post Publishing Methods
  async publishInstagramPost(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const postData = JSON.parse(body);
        const { image_url, caption, access_token } = postData;

        if (!image_url || !caption) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            error: 'Missing required fields: image_url and caption are required' 
          }));
          return;
        }

        const token = access_token || this.accessToken;
        if (!token) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            error: 'Access token is required' 
          }));
          return;
        }

        console.log('[INSTAGRAM] Starting post publication process...');
        console.log('[INSTAGRAM] Image URL:', image_url);
        console.log('[INSTAGRAM] Caption:', caption.substring(0, 50) + '...');

        // Step 1: Get Instagram Business Account ID
        const igAccountId = await this.getInstagramAccountId(token);
        
        // Step 2: Create media container
        const containerId = await this.createMediaContainer(igAccountId, image_url, caption, token);
        
        // Step 3: Publish the post
        const publishResult = await this.publishMedia(igAccountId, containerId, token);
        
        console.log('[INSTAGRAM] Post published successfully:', publishResult.id);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Post published successfully',
          post_id: publishResult.id,
          container_id: containerId,
          instagram_account_id: igAccountId
        }, null, 2));

      } catch (error) {
        console.error('[INSTAGRAM] Error publishing post:', error.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: 'Failed to publish post',
          details: error.message 
        }));
      }
    });
  }

  async getInstagramAccountId(accessToken) {
    try {
      // Try direct Instagram Business Account ID from environment first
      if (process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID) {
        console.log('[INSTAGRAM] Using Instagram Business Account ID from environment:', process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID);
        return process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
      }

      // Fallback: Try to get pages (may fail without pages_show_list permission)
      try {
        const pagesResponse = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
          params: {
            access_token: accessToken
          }
        });

        if (pagesResponse.data.data && pagesResponse.data.data.length > 0) {
          const pageId = pagesResponse.data.data[0].id;
          console.log('[INSTAGRAM] Using Facebook Page ID:', pageId);

          // Get Instagram account connected to the page
          const igResponse = await axios.get(`https://graph.facebook.com/v18.0/${pageId}`, {
            params: {
              fields: 'instagram_business_account',
              access_token: accessToken
            }
          });

          if (igResponse.data.instagram_business_account) {
            const igAccountId = igResponse.data.instagram_business_account.id;
            console.log('[INSTAGRAM] Instagram Business Account ID:', igAccountId);
            return igAccountId;
          }
        }
      } catch (pagesError) {
        console.log('[INSTAGRAM] Cannot access pages (missing pages_show_list permission)');
      }

      // If we can't get pages, provide helpful error message
      throw new Error('Cannot access Instagram Business Account. Please add INSTAGRAM_BUSINESS_ACCOUNT_ID to your .env file or ensure your access token has pages_show_list permission.');

    } catch (error) {
      console.error('[INSTAGRAM] Error getting Instagram account ID:', error.response?.data || error.message);
      throw new Error(`Failed to get Instagram account: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async createMediaContainer(igAccountId, imageUrl, caption, accessToken) {
    try {
      console.log('[INSTAGRAM] Creating media container...');
      
      const response = await axios.post(`https://graph.facebook.com/v18.0/${igAccountId}/media`, null, {
        params: {
          image_url: imageUrl,
          caption: caption,
          access_token: accessToken
        }
      });

      const containerId = response.data.id;
      console.log('[INSTAGRAM] Media container created:', containerId);
      
      // Wait for container to be ready
      await this.waitForContainerReady(containerId, accessToken);
      
      return containerId;

    } catch (error) {
      console.error('[INSTAGRAM] Error creating media container:', error.response?.data || error.message);
      throw new Error(`Failed to create media container: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async waitForContainerReady(containerId, accessToken, maxAttempts = 10) {
    console.log('[INSTAGRAM] Waiting for container to be ready...');
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await axios.get(`https://graph.facebook.com/v18.0/${containerId}`, {
          params: {
            fields: 'status_code',
            access_token: accessToken
          }
        });

        const statusCode = response.data.status_code;
        console.log(`[INSTAGRAM] Container status (attempt ${attempt}):`, statusCode);

        if (statusCode === 'FINISHED') {
          console.log('[INSTAGRAM] Container is ready!');
          return;
        } else if (statusCode === 'ERROR') {
          throw new Error('Media container processing failed');
        }

        // Wait before next attempt
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        if (attempt === maxAttempts) {
          throw new Error(`Container not ready after ${maxAttempts} attempts: ${error.message}`);
        }
        console.log(`[INSTAGRAM] Attempt ${attempt} failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    throw new Error('Container did not become ready within timeout period');
  }

  async publishMedia(igAccountId, containerId, accessToken) {
    try {
      console.log('[INSTAGRAM] Publishing media...');
      
      const response = await axios.post(`https://graph.facebook.com/v18.0/${igAccountId}/media_publish`, null, {
        params: {
          creation_id: containerId,
          access_token: accessToken
        }
      });

      console.log('[INSTAGRAM] Media published successfully!');
      return response.data;

    } catch (error) {
      console.error('[INSTAGRAM] Error publishing media:', error.response?.data || error.message);
      throw new Error(`Failed to publish media: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // Instagram Post Engagement Methods
  async getInstagramPosts(req, res) {
    try {
      const token = this.accessToken;
      if (!token) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Access token is required' }));
        return;
      }

      console.log('[INSTAGRAM] Fetching Instagram posts...');
      
      // Get Instagram Business Account ID
      const igAccountId = await this.getInstagramAccountId(token);
      
      // Get recent posts with engagement metrics
      const response = await axios.get(`https://graph.facebook.com/v18.0/${igAccountId}/media`, {
        params: {
          fields: 'id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count,shares_count,impressions,reach,saved',
          limit: 25,
          access_token: token
        }
      });

      const posts = response.data.data || [];
      console.log(`[INSTAGRAM] Found ${posts.length} posts`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        posts: posts,
        total: posts.length,
        instagram_account_id: igAccountId
      }, null, 2));

    } catch (error) {
      console.error('[INSTAGRAM] Error fetching posts:', error.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Failed to fetch posts',
        details: error.response?.data?.error?.message || error.message
      }));
    }
  }

  async getPostEngagement(req, res, postId) {
    try {
      const token = this.accessToken;
      if (!token) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Access token is required' }));
        return;
      }

      if (!postId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Post ID is required' }));
        return;
      }

      console.log('[INSTAGRAM] Fetching engagement data for post:', postId);
      
      // Get detailed post information with engagement metrics
      const postResponse = await axios.get(`https://graph.facebook.com/v18.0/${postId}`, {
        params: {
          fields: 'id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count,shares_count,impressions,reach,saved,video_views',
          access_token: token
        }
      });

      const post = postResponse.data;

      // Get insights (additional engagement metrics)
      let insights = null;
      try {
        const insightsResponse = await axios.get(`https://graph.facebook.com/v18.0/${postId}/insights`, {
          params: {
            metric: 'impressions,reach,profile_visits,website_clicks,follows,email_contacts,phone_call_clicks,text_message_clicks,get_directions_clicks,likes,comments,shares,saves,video_views',
            access_token: token
          }
        });
        insights = insightsResponse.data.data;
      } catch (insightsError) {
        console.log('[INSTAGRAM] Insights not available for this post (may be too old or not a business post)');
      }

      // Get comments if available
      let comments = [];
      try {
        const commentsResponse = await axios.get(`https://graph.facebook.com/v18.0/${postId}/comments`, {
          params: {
            fields: 'id,text,timestamp,username,like_count,replies{id,text,timestamp,username}',
            limit: 50,
            access_token: token
          }
        });
        comments = commentsResponse.data.data || [];
      } catch (commentsError) {
        console.log('[INSTAGRAM] Comments not accessible for this post');
      }

      console.log(`[INSTAGRAM] Post engagement data retrieved successfully`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        post: post,
        insights: insights,
        comments: comments,
        engagement_summary: {
          likes: post.like_count || 0,
          comments: post.comments_count || 0,
          shares: post.shares_count || 0,
          saves: post.saved || 0,
          video_views: post.video_views || 0,
          impressions: post.impressions || 0,
          reach: post.reach || 0,
          engagement_rate: post.reach > 0 ? ((post.like_count + post.comments_count + post.shares_count) / post.reach * 100).toFixed(2) + '%' : 'N/A'
        }
      }, null, 2));

    } catch (error) {
      console.error('[INSTAGRAM] Error fetching post engagement:', error.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Failed to fetch post engagement',
        details: error.response?.data?.error?.message || error.message
      }));
    }
  }

  listen(port = 13732) {
    this.server.listen(port, '0.0.0.0', () => {
      const networkInterfaces = require('os').networkInterfaces();
      const localIPs = [];
      
      Object.keys(networkInterfaces).forEach(interfaceName => {
        networkInterfaces[interfaceName].forEach(iface => {
          if (iface.family === 'IPv4' && !iface.internal) {
            localIPs.push(iface.address);
          }
        });
      });
      
      console.log(`[SERVER] Instagram Profile Analysis API running on port ${port}`);
      console.log(`[SERVER] Local access: http://localhost:${port}`);
      if (localIPs.length > 0) {
        console.log(`[SERVER] Network access:`);
        localIPs.forEach(ip => {
          console.log(`[SERVER]   http://${ip}:${port}`);
        });
      }
      console.log(`[SERVER] POST /analyze-profiles - Analyze Instagram profiles`);
      console.log(`[SERVER] POST /get-user-info - Get user info by username`);
      console.log(`[SERVER] Example: curl -X POST http://${localIPs[0] || 'localhost'}:${port}/get-user-info -H "Content-Type: application/json" -d '{"username": "example_user"}'`);
    });
  }
}

// Start server
const api = new APIHandler();
api.listen(13732);
