# Instagram Agent API

A Node.js API for analyzing Instagram profiles using AI-powered image analysis with Google Gemini.

## Features

- **Simple Username API**: Get comprehensive user analysis with just a username
- **Profile Scraping**: Automated Instagram profile and post data extraction
- **AI Analysis**: Gemini-powered analysis of profile content and images
- **Profile Collages**: Automatic generation of visual profile summaries
- **Caching**: Smart caching system to avoid redundant processing

## API Endpoints

### GET /
Health check endpoint

### POST /get-user-info
Get user information by username only.

**Request:**
```json
{
  "username": "example_user"
}
```

**Response:**
```json
{
  "success": true,
  "username": "example_user",
  "labels": ["nature", "wildlife", "photography"],
  "data": {
    "text": "Profile analysis description..."
  },
  "stats": {
    "posts": 1234,
    "followers": 567890,
    "following": 123
  },
  "collage_path": "profile_screenshots/example_user/profile_collage.jpg",
  "post_images_count": 24,
  "timestamp": "2025-09-13T21:37:23.437Z"
}
```

## Deployment to Render

### Prerequisites
1. GitHub repository with your code
2. Render account
3. Google Gemini API key

### Steps

1. **Push your code to GitHub**
2. **Create a new Web Service on Render**
   - Connect your GitHub repository
   - Select the `web-agent` directory as root
3. **Set Environment Variables**
   - `GEMINI_API_KEY`: Your Google Gemini API key
   - `NODE_ENV`: production
   - `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD`: true
   - `PUPPETEER_EXECUTABLE_PATH`: /usr/bin/google-chrome-stable
4. **Deploy**

### Environment Variables Required

- `GEMINI_API_KEY`: Your Google Gemini API key for image analysis
- `PORT`: Automatically set by Render
- `NODE_ENV`: Set to "production"

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Copy environment file:
```bash
cp .env.example .env
```

3. Add your Gemini API key to `.env`

4. Start the server:
```bash
npm start
```

## Usage Examples

### Test locally:
```bash
curl -X POST http://localhost:13732/get-user-info \
  -H "Content-Type: application/json" \
  -d '{"username": "natgeo"}'
```

### Test on Render (replace with your deployed URL):
```bash
curl -X POST https://your-app-name.onrender.com/get-user-info \
  -H "Content-Type: application/json" \
  -d '{"username": "natgeo"}'
```

## Dependencies

- **puppeteer**: Web scraping and automation
- **@google/generative-ai**: Google Gemini AI integration
- **canvas**: Image processing and collage creation
- **dotenv**: Environment variable management
