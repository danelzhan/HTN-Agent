#!/usr/bin/env node

/**
 * Test script to verify Instagram API configuration
 * This will check if your credentials are properly set up
 */

const axios = require('axios');
require('dotenv').config();

async function testInstagramConfig() {
  console.log('🔍 Testing Instagram API Configuration...\n');
  
  // Check environment variables
  const requiredVars = [
    'INSTAGRAM_APP_ID',
    'INSTAGRAM_APP_SECRET', 
    'INSTAGRAM_ACCESS_TOKEN'
  ];
  
  const missing = requiredVars.filter(varName => !process.env[varName]);
  if (missing.length > 0) {
    console.error('❌ Missing environment variables:', missing.join(', '));
    console.log('💡 Make sure these are set in your .env file');
    return;
  }
  
  console.log('✅ Environment variables found');
  
  try {
    // Test 1: Validate access token
    console.log('🔄 Testing access token...');
    const tokenResponse = await axios.get('https://graph.facebook.com/v18.0/me', {
      params: {
        access_token: process.env.INSTAGRAM_ACCESS_TOKEN
      }
    });
    console.log('✅ Access token valid for user:', tokenResponse.data.name);
    
    // Test 2: Get Facebook pages
    console.log('🔄 Checking Facebook pages...');
    const pagesResponse = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
      params: {
        access_token: process.env.INSTAGRAM_ACCESS_TOKEN
      }
    });
    
    if (!pagesResponse.data.data || pagesResponse.data.data.length === 0) {
      console.error('❌ No Facebook pages found');
      console.log('💡 You need a Facebook page connected to an Instagram Business account');
      return;
    }
    
    console.log('✅ Found', pagesResponse.data.data.length, 'Facebook page(s)');
    
    // Test 3: Check Instagram Business account
    const pageId = pagesResponse.data.data[0].id;
    const pageName = pagesResponse.data.data[0].name;
    console.log('🔄 Checking Instagram connection for page:', pageName);
    
    const igResponse = await axios.get(`https://graph.facebook.com/v18.0/${pageId}`, {
      params: {
        fields: 'instagram_business_account',
        access_token: process.env.INSTAGRAM_ACCESS_TOKEN
      }
    });
    
    if (!igResponse.data.instagram_business_account) {
      console.error('❌ No Instagram Business account connected to page:', pageName);
      console.log('💡 Connect an Instagram Business account to your Facebook page');
      return;
    }
    
    const igAccountId = igResponse.data.instagram_business_account.id;
    console.log('✅ Instagram Business account found:', igAccountId);
    
    // Test 4: Get Instagram account info
    console.log('🔄 Getting Instagram account details...');
    const igInfoResponse = await axios.get(`https://graph.facebook.com/v18.0/${igAccountId}`, {
      params: {
        fields: 'username,account_type,media_count',
        access_token: process.env.INSTAGRAM_ACCESS_TOKEN
      }
    });
    
    console.log('✅ Instagram account details:');
    console.log('   Username:', igInfoResponse.data.username);
    console.log('   Account type:', igInfoResponse.data.account_type);
    console.log('   Media count:', igInfoResponse.data.media_count);
    
    console.log('\n🎉 Configuration test completed successfully!');
    console.log('🚀 Your Instagram publishing endpoint is ready to use');
    console.log('\n📝 Test the publishing endpoint with:');
    console.log('curl -X POST http://localhost:13732/instagram/publish \\');
    console.log('  -H "Content-Type: application/json" \\');
    console.log('  -d \'{"image_url": "https://picsum.photos/800/600", "caption": "Test post! #api"}\'');
    
  } catch (error) {
    console.error('❌ Configuration test failed:');
    if (error.response?.data?.error) {
      console.error('   Error:', error.response.data.error.message);
      console.error('   Type:', error.response.data.error.type);
      console.error('   Code:', error.response.data.error.code);
    } else {
      console.error('   Error:', error.message);
    }
    
    console.log('\n💡 Common solutions:');
    console.log('   • Regenerate your access token');
    console.log('   • Check token permissions (instagram_basic, instagram_content_publish)');
    console.log('   • Ensure Instagram Business account is connected to Facebook page');
    console.log('   • Verify app is in live mode (not development)');
  }
}

if (require.main === module) {
  testInstagramConfig();
}

module.exports = { testInstagramConfig };
