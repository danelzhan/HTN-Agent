#!/usr/bin/env node

/**
 * Test Instagram Business Account ID directly
 */

const axios = require('axios');
require('dotenv').config();

async function testDirectIgApi() {
  console.log('🔍 Testing Instagram Business Account ID directly...\n');
  
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const igAccountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  
  if (!accessToken || !igAccountId) {
    console.error('❌ Missing access token or Instagram Business Account ID');
    return;
  }

  console.log('📋 Testing with:');
  console.log('   Access Token:', accessToken.substring(0, 20) + '...');
  console.log('   IG Business Account ID:', igAccountId);
  console.log('');

  try {
    // Test 1: Get basic account info
    console.log('🔄 Test 1: Getting basic account info...');
    const accountResponse = await axios.get(`https://graph.facebook.com/v18.0/${igAccountId}`, {
      params: {
        fields: 'id,username,account_type,media_count,followers_count,follows_count',
        access_token: accessToken
      }
    });

    console.log('✅ Account info retrieved:');
    console.log('   ID:', accountResponse.data.id);
    console.log('   Username:', accountResponse.data.username || 'N/A');
    console.log('   Account Type:', accountResponse.data.account_type || 'N/A');
    console.log('   Media Count:', accountResponse.data.media_count || 'N/A');
    console.log('   Followers:', accountResponse.data.followers_count || 'N/A');
    console.log('   Following:', accountResponse.data.follows_count || 'N/A');

    // Test 2: Try to get media
    console.log('\n🔄 Test 2: Getting media posts...');
    const mediaResponse = await axios.get(`https://graph.facebook.com/v18.0/${igAccountId}/media`, {
      params: {
        fields: 'id,media_type,media_url,caption,timestamp,like_count,comments_count',
        limit: 5,
        access_token: accessToken
      }
    });

    console.log('✅ Media retrieved successfully!');
    console.log(`   Found ${mediaResponse.data.data.length} posts`);
    
    if (mediaResponse.data.data.length > 0) {
      const firstPost = mediaResponse.data.data[0];
      console.log('\n📝 Sample post:');
      console.log('   Post ID:', firstPost.id);
      console.log('   Type:', firstPost.media_type);
      console.log('   Likes:', firstPost.like_count || 0);
      console.log('   Comments:', firstPost.comments_count || 0);
      console.log('   Caption:', (firstPost.caption || '').substring(0, 50) + '...');
    }

    console.log('\n🎉 Instagram Business Account ID is working correctly!');
    console.log('🚀 The /instagram/posts endpoint should work now');

  } catch (error) {
    console.error('❌ Error testing Instagram Business Account:');
    if (error.response?.data?.error) {
      console.error('   Message:', error.response.data.error.message);
      console.error('   Type:', error.response.data.error.type);
      console.error('   Code:', error.response.data.error.code);
      
      if (error.response.data.error.message.includes('does not exist')) {
        console.log('\n💡 The Instagram Business Account ID is incorrect or does not exist');
        console.log('   Try getting the correct ID from Graph API Explorer:');
        console.log('   GET /me?fields=accounts{instagram_business_account,name}');
      } else if (error.response.data.error.message.includes('permissions')) {
        console.log('\n💡 Permission issue - your access token may not have the right permissions');
        console.log('   Required permissions: instagram_basic, instagram_content_publish');
      }
    } else {
      console.error('   Error:', error.message);
    }
  }
}

if (require.main === module) {
  testDirectIgApi();
}

module.exports = { testDirectIgApi };
