#!/usr/bin/env node

/**
 * Test script for Instagram engagement data fetching
 * This will test the endpoints once you have proper credentials
 */

const axios = require('axios');
require('dotenv').config();

async function testEngagementFetch() {
  console.log('🔍 Testing Instagram Engagement Data Fetching...\n');
  
  const baseUrl = 'http://localhost:13732';
  
  try {
    // Test 1: Fetch all posts
    console.log('🔄 Test 1: Fetching all Instagram posts...');
    const postsResponse = await axios.get(`${baseUrl}/instagram/posts`);
    
    if (postsResponse.data.success) {
      console.log('✅ Posts fetched successfully!');
      console.log(`📊 Found ${postsResponse.data.total} posts`);
      
      if (postsResponse.data.posts.length > 0) {
        const firstPost = postsResponse.data.posts[0];
        console.log('\n📝 Sample post:');
        console.log(`   ID: ${firstPost.id}`);
        console.log(`   Type: ${firstPost.media_type}`);
        console.log(`   Likes: ${firstPost.like_count || 0}`);
        console.log(`   Comments: ${firstPost.comments_count || 0}`);
        console.log(`   Caption: ${(firstPost.caption || '').substring(0, 50)}...`);
        
        // Test 2: Get detailed engagement for first post
        console.log('\n🔄 Test 2: Fetching detailed engagement for first post...');
        const engagementResponse = await axios.get(`${baseUrl}/instagram/posts/${firstPost.id}`);
        
        if (engagementResponse.data.success) {
          console.log('✅ Detailed engagement data fetched!');
          const summary = engagementResponse.data.engagement_summary;
          console.log('\n📈 Engagement Summary:');
          console.log(`   Likes: ${summary.likes}`);
          console.log(`   Comments: ${summary.comments}`);
          console.log(`   Shares: ${summary.shares}`);
          console.log(`   Saves: ${summary.saves}`);
          console.log(`   Impressions: ${summary.impressions}`);
          console.log(`   Reach: ${summary.reach}`);
          console.log(`   Engagement Rate: ${summary.engagement_rate}`);
          
          if (engagementResponse.data.comments.length > 0) {
            console.log(`\n💬 Found ${engagementResponse.data.comments.length} comments`);
          }
          
          if (engagementResponse.data.insights) {
            console.log(`\n📊 Additional insights available: ${engagementResponse.data.insights.length} metrics`);
          }
        }
      } else {
        console.log('📭 No posts found in the account');
      }
    }
    
    console.log('\n🎉 Engagement data fetching test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:');
    if (error.response?.data) {
      console.error('   Error:', error.response.data.error);
      console.error('   Details:', error.response.data.details);
      
      if (error.response.data.details?.includes('INSTAGRAM_BUSINESS_ACCOUNT_ID')) {
        console.log('\n💡 Next steps:');
        console.log('1. Go to: https://developers.facebook.com/tools/explorer');
        console.log('2. Generate access token with instagram_basic permission');
        console.log('3. Make request: GET /me?fields=accounts{instagram_business_account,name}');
        console.log('4. Copy the instagram_business_account.id to your .env file');
        console.log('5. Add: INSTAGRAM_BUSINESS_ACCOUNT_ID=your_account_id_here');
      }
    } else {
      console.error('   Error:', error.message);
    }
  }
}

if (require.main === module) {
  testEngagementFetch();
}

module.exports = { testEngagementFetch };
