#!/usr/bin/env node

/**
 * Debug script to test Instagram API credentials step by step
 */

const axios = require('axios');
require('dotenv').config();

async function debugCredentials() {
  console.log('🔍 Debugging Instagram API Credentials...\n');
  
  // Check what we have in environment
  console.log('📋 Environment Variables:');
  console.log('   INSTAGRAM_APP_ID:', process.env.INSTAGRAM_APP_ID ? '✅ Set' : '❌ Missing');
  console.log('   INSTAGRAM_APP_SECRET:', process.env.INSTAGRAM_APP_SECRET ? '✅ Set' : '❌ Missing');
  console.log('   INSTAGRAM_ACCESS_TOKEN:', process.env.INSTAGRAM_ACCESS_TOKEN ? '✅ Set' : '❌ Missing');
  console.log('   INSTAGRAM_BUSINESS_ACCOUNT_ID:', process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID ? '✅ Set' : '❌ Missing');
  console.log('');
  
  if (!process.env.INSTAGRAM_ACCESS_TOKEN) {
    console.error('❌ No access token found. Please set INSTAGRAM_ACCESS_TOKEN in .env');
    return;
  }
  
  try {
    // Test 1: Basic token validation
    console.log('🔄 Step 1: Testing access token validity...');
    const response = await axios.get('https://graph.facebook.com/v18.0/me', {
      params: {
        access_token: process.env.INSTAGRAM_ACCESS_TOKEN,
        fields: 'id,name'
      }
    });
    
    console.log('✅ Token is valid');
    console.log('   User ID:', response.data.id);
    console.log('   User Name:', response.data.name);
    console.log('');
    
    // Test 2: Check token permissions
    console.log('🔄 Step 2: Checking token permissions...');
    const permissionsResponse = await axios.get('https://graph.facebook.com/v18.0/me/permissions', {
      params: {
        access_token: process.env.INSTAGRAM_ACCESS_TOKEN
      }
    });
    
    const permissions = permissionsResponse.data.data
      .filter(p => p.status === 'granted')
      .map(p => p.permission);
    
    console.log('✅ Granted permissions:', permissions.join(', '));
    
    const requiredPerms = ['pages_show_list', 'instagram_basic', 'instagram_content_publish'];
    const missingPerms = requiredPerms.filter(perm => !permissions.includes(perm));
    
    if (missingPerms.length > 0) {
      console.log('⚠️  Missing required permissions:', missingPerms.join(', '));
      console.log('💡 You need to regenerate your token with these permissions');
    } else {
      console.log('✅ All required permissions granted');
    }
    console.log('');
    
    // Test 3: Check pages (this is where it failed before)
    console.log('🔄 Step 3: Checking Facebook pages...');
    const pagesResponse = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
      params: {
        access_token: process.env.INSTAGRAM_ACCESS_TOKEN,
        fields: 'id,name,access_token'
      }
    });
    
    if (!pagesResponse.data.data || pagesResponse.data.data.length === 0) {
      console.log('❌ No Facebook pages found');
      console.log('');
      console.log('🔧 To fix this:');
      console.log('   1. Create a Facebook Page at facebook.com/pages/create');
      console.log('   2. Make sure you are an admin of the page');
      console.log('   3. Regenerate your access token to include page permissions');
      return;
    }
    
    console.log('✅ Found Facebook pages:');
    pagesResponse.data.data.forEach((page, index) => {
      console.log(`   ${index + 1}. ${page.name} (ID: ${page.id})`);
    });
    console.log('');
    
    // Test 4: Check Instagram connection for each page
    console.log('🔄 Step 4: Checking Instagram Business accounts...');
    for (const page of pagesResponse.data.data) {
      try {
        const igResponse = await axios.get(`https://graph.facebook.com/v18.0/${page.id}`, {
          params: {
            fields: 'instagram_business_account',
            access_token: process.env.INSTAGRAM_ACCESS_TOKEN
          }
        });
        
        if (igResponse.data.instagram_business_account) {
          console.log(`✅ Page "${page.name}" has Instagram Business account: ${igResponse.data.instagram_business_account.id}`);
          
          // Get Instagram account details
          const igDetailsResponse = await axios.get(`https://graph.facebook.com/v18.0/${igResponse.data.instagram_business_account.id}`, {
            params: {
              fields: 'username,account_type',
              access_token: process.env.INSTAGRAM_ACCESS_TOKEN
            }
          });
          
          console.log(`   Instagram: @${igDetailsResponse.data.username} (${igDetailsResponse.data.account_type})`);
        } else {
          console.log(`⚠️  Page "${page.name}" has no Instagram Business account connected`);
        }
      } catch (error) {
        console.log(`❌ Error checking Instagram for page "${page.name}":`, error.response?.data?.error?.message || error.message);
      }
    }
    
    console.log('\n🎉 Credential debugging completed!');
    
  } catch (error) {
    console.error('❌ Error during debugging:');
    if (error.response?.data?.error) {
      console.error('   Message:', error.response.data.error.message);
      console.error('   Type:', error.response.data.error.type);
      console.error('   Code:', error.response.data.error.code);
    } else {
      console.error('   Error:', error.message);
    }
  }
}

if (require.main === module) {
  debugCredentials();
}

module.exports = { debugCredentials };
