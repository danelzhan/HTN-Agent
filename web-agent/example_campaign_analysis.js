const { MarketingCampaignAgent } = require('./market_agent');
const path = require('path');

// Example usage of the Marketing Campaign Agent
async function runCampaignAnalysis() {
    console.log('🚀 Starting Marketing Campaign Analysis...\n');
    
    // Create agent instance
    const agent = new MarketingCampaignAgent();
    
    // Example campaign files (replace with actual file paths)
    const campaignFiles = [
        { path: './sample_files/campaign_brief.pdf' },
        { path: './sample_files/hero_image.jpg' },
        { path: './sample_files/product_video.mp4' },
        { path: './sample_files/social_post.png' }
    ];
    
    try {
        // Analyze the campaign
        const analysis = await agent.analyzeCampaign(campaignFiles);
        
        console.log('📊 Campaign Analysis Results:');
        console.log('=====================================\n');
        
        // Display parsed campaign data
        console.log('📁 Campaign Data:');
        console.log(`- PDFs: ${analysis.campaignData.pdfs.length}`);
        console.log(`- Images: ${analysis.campaignData.images.length}`);
        console.log(`- Videos: ${analysis.campaignData.videos.length}`);
        console.log(`- Themes: ${analysis.campaignData.themes.join(', ')}\n`);
        
        // Display hashtags
        console.log('🏷️  Generated Hashtags:');
        console.log(analysis.hashtags.join(' '));
        console.log();
        
        // Display descriptions
        console.log('📝 Generated Descriptions:');
        console.log('Short:', analysis.descriptions.short);
        console.log('Medium:', analysis.descriptions.medium);
        console.log('Long:', analysis.descriptions.long);
        console.log();
        
        // Display suggestions (if any)
        if (analysis.suggestions && analysis.suggestions.suggestions) {
            console.log('💡 AI Suggestions:');
            analysis.suggestions.suggestions.forEach((suggestion, index) => {
                console.log(`${index + 1}. ${suggestion.title || 'Suggestion'}`);
                console.log(`   ${suggestion.description || suggestion}`);
            });
        }
        
        // Example of approving a suggestion
        if (agent.suggestions.length > 0) {
            console.log('\n✅ Approving first suggestion...');
            const approved = await agent.approveSuggestion(agent.suggestions[0].id, true);
            console.log('Approval result:', approved);
        }
        
        console.log('\n🎉 Campaign analysis complete!');
        
    } catch (error) {
        console.error('❌ Error during campaign analysis:', error.message);
    }
}

// Example of creating a simple campaign analysis API endpoint
function createCampaignAPI() {
    const express = require('express');
    const multer = require('multer');
    const app = express();
    
    // Configure multer for file uploads
    const upload = multer({ dest: 'uploads/' });
    
    app.use(express.json());
    
    // Campaign analysis endpoint
    app.post('/analyze-campaign', upload.array('files'), async (req, res) => {
        try {
            const agent = new MarketingCampaignAgent();
            const files = req.files.map(file => ({ path: file.path }));
            
            const analysis = await agent.analyzeCampaign(files);
            
            res.json({
                success: true,
                analysis,
                message: 'Campaign analyzed successfully'
            });
            
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    // Suggestion approval endpoint
    app.post('/approve-suggestion', async (req, res) => {
        try {
            const { suggestionId, approved } = req.body;
            const agent = new MarketingCampaignAgent();
            
            const result = await agent.approveSuggestion(suggestionId, approved);
            
            res.json({
                success: true,
                result,
                message: approved ? 'Suggestion approved' : 'Suggestion rejected'
            });
            
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
        console.log(`🌐 Campaign Analysis API running on port ${PORT}`);
        console.log(`📡 POST /analyze-campaign - Upload and analyze campaign files`);
        console.log(`✅ POST /approve-suggestion - Approve/reject suggestions`);
    });
}

// Run example if this file is executed directly
if (require.main === module) {
    console.log('Choose an option:');
    console.log('1. Run campaign analysis example');
    console.log('2. Start campaign analysis API server');
    
    const option = process.argv[2] || '1';
    
    if (option === '1' || option === 'example') {
        runCampaignAnalysis();
    } else if (option === '2' || option === 'api') {
        createCampaignAPI();
    } else {
        console.log('Invalid option. Use: node example_campaign_analysis.js [1|example|2|api]');
    }
}

module.exports = {
    runCampaignAnalysis,
    createCampaignAPI
};
