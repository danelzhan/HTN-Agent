#!/usr/bin/env node

/**
 * Script to find your Instagram Business Account ID without pages_show_list permission
 */

const axios = require('axios');
require('dotenv').config();

async function getInstagramAccountId() {
  console.log('🔍 Finding Instagram Business Account ID...\n');
  
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!accessToken) {
    console.error('❌ No access token found. Set INSTAGRAM_ACCESS_TOKEN in .env');
    return;
  }

  try {
    // Method 1: Try to get user info with accounts
    console.log('🔄 Method 1: Checking user accounts...');
    try {
      const response = await axios.get('https://graph.facebook.com/v18.0/me', {
        params: {
          fields: 'accounts{instagram_business_account,name}',
          access_token: accessToken
        }
      });

      if (response.data.accounts && response.data.accounts.data.length > 0) {
        console.log('✅ Found accounts:');
        response.data.accounts.data.forEach((account, index) => {
          console.log(`   ${index + 1}. ${account.name}`);
          if (account.instagram_business_account) {
            console.log(`      Instagram Business Account ID: ${account.instagram_business_account.id}`);
            console.log(`\n🎯 Add this to your .env file:`);
            console.log(`INSTAGRAM_BUSINESS_ACCOUNT_ID=${account.instagram_business_account.id}`);
          } else {
            console.log('      No Instagram Business account connected');
          }
        });
        return;
      }
    } catch (error) {
      console.log('⚠️  Method 1 failed (likely missing pages permission)');
    }

    // Method 2: Try direct Instagram account lookup
    console.log('🔄 Method 2: Direct Instagram account lookup...');
    try {
      // This requires knowing the Instagram account ID already, so we'll provide instructions
      console.log('💡 To find your Instagram Business Account ID manually:');
      console.log('');
      console.log('1. Go to: https://developers.facebook.com/tools/explorer');
      console.log('2. Select your app');
      console.log('3. Generate access token with instagram_basic permission');
      console.log('4. Make this request:');
      console.log('   GET /me?fields=accounts{instagram_business_account,name}');
      console.log('');
      console.log('5. Look for the instagram_business_account.id in the response');
      console.log('');
      console.log('Alternative: If you know your Instagram username, try:');
      console.log('   GET /instagram_oembed?url=https://www.instagram.com/YOUR_USERNAME');
      
    } catch (error) {
      console.log('❌ Method 2 also failed');
    }

    // Method 3: Instructions for manual lookup
    console.log('\n📋 Manual Steps:');
    console.log('1. Go to your Instagram Business account');
    console.log('2. Go to Settings → Account → Website');
    console.log('3. The account ID is often visible in Facebook Business Manager');
    console.log('4. Or use Facebook Graph API Explorer with a fresh token');

  } catch (error) {
    console.error('❌ Error:', error.response?.data?.error?.message || error.message);
    
    console.log('\n💡 Quick fix:');
    console.log('1. Generate new access token at: https://developers.facebook.com/tools/explorer');
    console.log('2. Only need: instagram_basic, instagram_content_publish');
    console.log('3. Use Graph API Explorer to find your Instagram Business Account ID');
    console.log('4. Add INSTAGRAM_BUSINESS_ACCOUNT_ID to your .env file');
  }
}

if (require.main === module) {
  getInstagramAccountId();
}

module.exports = { getInstagramAccountId };
