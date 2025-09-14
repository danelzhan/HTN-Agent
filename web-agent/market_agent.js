require("dotenv").config();
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const pdf = require('pdf-parse');
const axios = require('axios');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

class MarketingCampaignAgent {
    constructor() {
        this.model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
        this.campaignData = null;
        this.suggestions = [];
        this.demographicData = [];
    }

    async analyzeCampaign(campaignFiles) {
        console.log('[AGENT] Starting campaign analysis...');
        
        // Parse all files in the campaign
        this.campaignData = await this.parseCampaignFiles(campaignFiles);
        
        // Research market trends
        const marketResearch = await this.conductMarketResearch(this.campaignData.themes);
        
        // Analyze demographics
        const demographicInsights = await this.analyzeDemographics();
        
        // Generate suggestions using Gemini
        const suggestions = await this.generateSuggestions(this.campaignData, marketResearch, demographicInsights);
        
        return {
            campaignData: this.campaignData,
            marketResearch,
            demographicInsights,
            suggestions,
            hashtags: this.generateHashtags(this.campaignData),
            descriptions: this.generateDescriptions(this.campaignData)
        };
    }

    async parseCampaignFiles(files) {
        const parsedData = {
            pdfs: [],
            images: [],
            videos: [],
            themes: [],
            textContent: '',
            visualElements: []
        };

        for (const file of files) {
            try {
                const fileType = this.getFileType(file.path);
                
                switch (fileType) {
                    case 'pdf':
                        const pdfData = await this.parsePDF(file.path);
                        parsedData.pdfs.push(pdfData);
                        parsedData.textContent += pdfData.text + ' ';
                        break;
                    
                    case 'image':
                        const imageData = await this.parseImage(file.path);
                        parsedData.images.push(imageData);
                        parsedData.visualElements.push(imageData);
                        break;
                    
                    case 'video':
                        const videoData = await this.parseVideo(file.path);
                        parsedData.videos.push(videoData);
                        parsedData.visualElements.push(videoData);
                        break;
                }
            } catch (error) {
                console.error(`[AGENT] Error parsing file ${file.path}:`, error.message);
            }
        }

        // Extract themes from content
        parsedData.themes = await this.extractThemes(parsedData.textContent);
        
        return parsedData;
    }

    async parsePDF(filePath) {
        try {
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdf(dataBuffer);
            
            return {
                type: 'pdf',
                path: filePath,
                text: data.text,
                pages: data.numpages,
                metadata: data.metadata || {},
                suggestions: []
            };
        } catch (error) {
            console.error('[AGENT] PDF parsing error:', error);
            return { type: 'pdf', path: filePath, text: '', error: error.message };
        }
    }

    async parseImage(filePath) {
        try {
            // Use Gemini Vision to analyze image
            const imageBuffer = fs.readFileSync(filePath);
            const base64Image = imageBuffer.toString('base64');
            
            const result = await this.model.generateContent([
                {
                    inlineData: {
                        data: base64Image,
                        mimeType: this.getMimeType(filePath)
                    }
                },
                "Analyze this marketing image. Describe the visual elements, colors, text, branding, target audience, and overall marketing message. Suggest improvements."
            ]);
            
            return {
                type: 'image',
                path: filePath,
                analysis: result.response.text(),
                suggestions: [],
                metadata: {
                    size: imageBuffer.length,
                    format: path.extname(filePath).toLowerCase()
                }
            };
        } catch (error) {
            console.error('[AGENT] Image parsing error:', error);
            return { type: 'image', path: filePath, error: error.message };
        }
    }

    async parseVideo(filePath) {
        try {
            // For video, we'll extract frames and analyze them
            // This is a simplified version - in production you'd use ffmpeg
            const stats = fs.statSync(filePath);
            
            return {
                type: 'video',
                path: filePath,
                duration: 'unknown', // Would need ffmpeg to get actual duration
                analysis: 'Video file detected - manual review recommended',
                suggestions: [],
                metadata: {
                    size: stats.size,
                    format: path.extname(filePath).toLowerCase()
                }
            };
        } catch (error) {
            console.error('[AGENT] Video parsing error:', error);
            return { type: 'video', path: filePath, error: error.message };
        }
    }

    async conductMarketResearch(themes) {
        try {
            console.log('[AGENT] Conducting market research for themes:', themes);
            
            const researchPrompt = `
            Research current market trends for these themes: ${themes.join(', ')}.
            Provide insights on:
            1. Current market sentiment
            2. Trending keywords and hashtags
            3. Competitor strategies
            4. Consumer preferences
            5. Seasonal trends
            6. Platform-specific recommendations (Instagram, TikTok, Facebook, etc.)
            
            Format as JSON with structured data.
            `;
            
            const result = await this.model.generateContent(researchPrompt);
            const researchData = this.parseJSONResponse(result.response.text());
            
            return researchData || {
                trends: [],
                keywords: [],
                recommendations: [],
                platforms: {}
            };
        } catch (error) {
            console.error('[AGENT] Market research error:', error);
            return { error: error.message };
        }
    }

    async analyzeDemographics() {
        try {
            // This would typically connect to your demographic database
            // For now, we'll simulate with common demographic insights
            const demographicPrompt = `
            Provide demographic analysis for modern marketing campaigns including:
            1. Age group preferences
            2. Platform usage by demographics
            3. Content format preferences
            4. Engagement patterns
            5. Conversion factors
            
            Format as JSON.
            `;
            
            const result = await this.model.generateContent(demographicPrompt);
            return this.parseJSONResponse(result.response.text()) || {
                ageGroups: {},
                platforms: {},
                preferences: {}
            };
        } catch (error) {
            console.error('[AGENT] Demographic analysis error:', error);
            return { error: error.message };
        }
    }

    async generateSuggestions(campaignData, marketResearch, demographicInsights) {
        try {
            const systemPrompt = this.getSystemPrompt();
            
            const analysisPrompt = `
            ${systemPrompt}
            
            Campaign Data:
            ${JSON.stringify(campaignData, null, 2)}
            
            Market Research:
            ${JSON.stringify(marketResearch, null, 2)}
            
            Demographic Insights:
            ${JSON.stringify(demographicInsights, null, 2)}
            
            Provide specific, actionable suggestions for:
            1. Text improvements for PDFs
            2. Image optimization recommendations
            3. Video content suggestions
            4. Hashtag strategies
            5. Platform-specific adaptations
            
            Format as JSON with clear action items and rationale.
            `;
            
            const result = await this.model.generateContent(analysisPrompt);
            return this.parseJSONResponse(result.response.text()) || { suggestions: [] };
        } catch (error) {
            console.error('[AGENT] Suggestion generation error:', error);
            return { error: error.message };
        }
    }

    generateHashtags(campaignData) {
        const themes = campaignData.themes || [];
        const baseHashtags = [
            '#marketing', '#campaign', '#brand', '#digital',
            '#socialmedia', '#content', '#engagement'
        ];
        
        const themeHashtags = themes.map(theme => `#${theme.toLowerCase().replace(/\s+/g, '')}`);
        
        return [...baseHashtags, ...themeHashtags].slice(0, 30);
    }

    generateDescriptions(campaignData) {
        return {
            short: `Discover our latest campaign featuring ${campaignData.themes.slice(0, 2).join(' and ')}`,
            medium: `Explore our innovative marketing campaign that combines ${campaignData.themes.join(', ')} to create engaging content for your audience.`,
            long: `Our comprehensive marketing campaign leverages cutting-edge insights and creative storytelling to deliver impactful content across multiple platforms. Featuring ${campaignData.themes.join(', ')}, this campaign is designed to maximize engagement and drive conversions.`
        };
    }

    // Utility functions
    getFileType(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        if (['.pdf'].includes(ext)) return 'pdf';
        if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) return 'image';
        if (['.mp4', '.avi', '.mov', '.wmv'].includes(ext)) return 'video';
        return 'unknown';
    }

    getMimeType(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp'
        };
        return mimeTypes[ext] || 'application/octet-stream';
    }

    async extractThemes(text) {
        try {
            const themePrompt = `Extract 3-5 main themes from this marketing content: "${text.substring(0, 1000)}...". Return as a simple array of theme words.`;
            const result = await this.model.generateContent(themePrompt);
            const themes = result.response.text().match(/\b\w+\b/g) || [];
            return themes.slice(0, 5);
        } catch (error) {
            return ['marketing', 'brand', 'campaign'];
        }
    }

    parseJSONResponse(text) {
        try {
            // Clean up the response to extract JSON
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            return null;
        } catch (error) {
            console.error('[AGENT] JSON parsing error:', error);
            return null;
        }
    }

    getSystemPrompt() {
        return `
        You are an expert marketing campaign analyst with deep knowledge of:
        - Digital marketing trends and best practices
        - Consumer psychology and behavior
        - Platform-specific content optimization
        - Brand messaging and positioning
        - Visual design principles
        - Engagement optimization strategies
        
        Your role is to analyze marketing campaigns and provide specific, actionable recommendations
        that will improve performance, engagement, and conversion rates.
        
        Focus on:
        1. Data-driven insights
        2. Practical implementation
        3. Platform-specific optimization
        4. Target audience alignment
        5. Competitive differentiation
        `;
    }

    // Approval and implementation system
    async approveSuggestion(suggestionId, approved = true) {
        const suggestion = this.suggestions.find(s => s.id === suggestionId);
        if (suggestion) {
            suggestion.approved = approved;
            suggestion.timestamp = new Date().toISOString();
            
            if (approved && suggestion.type === 'text') {
                await this.implementTextChange(suggestion);
            } else if (approved && ['image', 'video'].includes(suggestion.type)) {
                await this.prepareFileReplacement(suggestion);
            }
        }
        return suggestion;
    }

    async implementTextChange(suggestion) {
        // Implementation logic for text changes
        console.log('[AGENT] Implementing text change:', suggestion.description);
        return { status: 'implemented', suggestion };
    }

    async prepareFileReplacement(suggestion) {
        // Prepare file for re-upload
        console.log('[AGENT] Preparing file replacement:', suggestion.description);
        return { status: 'ready_for_upload', suggestion };
    }
}

// Export the class and utility functions
module.exports = {
    MarketingCampaignAgent,
    
    // Convenience function to create and run analysis
    async analyzeCampaign(campaignFiles) {
        const agent = new MarketingCampaignAgent();
        return await agent.analyzeCampaign(campaignFiles);
    }
};
