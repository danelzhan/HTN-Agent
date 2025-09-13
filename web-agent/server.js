require("dotenv").config();
const http = require('http');
const url = require('url');
const { analyzeProfileCollage, scrape_image, poi_search, readSystemPrompt } = require('./agent-functions');

function parse_data(data) {
  return data.map(d => ({ username: d.string_list_data[0].value, url: d.string_list_data[0].href }));
}

class APIHandler {
  constructor() {
    this.server = http.createServer((req, res) => this.handleRequest(req, res));
  }

  async handleRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);
    
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/analyze-profiles') {
      await this.handleAnalyzeProfiles(req, res);
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
      console.log(`[SERVER] Example: curl -X POST http://${localIPs[0] || 'localhost'}:${port}/analyze-profiles -H "Content-Type: application/json" -d '{"pre_campaign_data": [...], "post_campaign_data": [...], "limit": 3}'`);
    });
  }
}

// Start server
const api = new APIHandler();
api.listen(13732);
