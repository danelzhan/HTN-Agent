#!/usr/bin/env node

/**
 * Alternative methods to find Instagram Business Account ID
 */

const axios = require('axios');
require('dotenv').config();

async function findRealIgId() {
  console.log('🔍 Finding your real Instagram Business Account ID...\n');
  
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!accessToken) {
    console.error('❌ No access token found');
    return;
  }

  try {
    // Method 1: Check if you have any Instagram accounts linked to your user
    console.log('🔄 Method 1: Checking for Instagram accounts linked to your user...');
    try {
      const userResponse = await axios.get('https://graph.facebook.com/v18.0/me', {
        params: {
          fields: 'id,name,accounts{id,name,instagram_business_account{id,username}}',
          access_token: accessToken
        }
      });

      console.log('✅ User info:');
      console.log('   User ID:', userResponse.data.id);
      console.log('   Name:', userResponse.data.name);

      if (userResponse.data.accounts?.data?.length > 0) {
        console.log('\n📄 Found accounts:');
        userResponse.data.accounts.data.forEach((account, index) => {
          console.log(`   ${index + 1}. ${account.name} (${account.id})`);
          if (account.instagram_business_account) {
            console.log(`      ✅ Instagram Business Account: ${account.instagram_business_account.id}`);
            console.log(`      Username: @${account.instagram_business_account.username}`);
            console.log(`\n🎯 Use this ID: ${account.instagram_business_account.id}`);
            return;
          }
        });
      }
    } catch (error) {
      console.log('⚠️  Method 1 failed:', error.response?.data?.error?.message || error.message);
    }

    // Method 2: Try to use your User ID as Instagram account (sometimes works)
    console.log('\n🔄 Method 2: Testing if your User ID is also an Instagram account...');
    const userId = '762138606846626'; // From previous debug
    try {
      const testResponse = await axios.get(`https://graph.facebook.com/v18.0/${userId}`, {
        params: {
          fields: 'id,username,account_type,instagram_business_account',
          access_token: accessToken
        }
      });

      if (testResponse.data.username) {
        console.log('✅ Your User ID has Instagram data:');
        console.log('   Username:', testResponse.data.username);
        console.log('   Account Type:', testResponse.data.account_type);
        if (testResponse.data.instagram_business_account) {
          console.log('   Business Account:', testResponse.data.instagram_business_account.id);
        }
      }
    } catch (error) {
      console.log('⚠️  Method 2 failed:', error.response?.data?.error?.message || error.message);
    }

    // Method 3: Try common Instagram Business Account ID patterns
    console.log('\n🔄 Method 3: Testing common Instagram Business Account patterns...');
    const testIds = [
      '17841405309211844', // Common format
      '17841405822211844', // Variation
      '17841405822305971', // Another variation
      userId // Your user ID
    ];

    for (const testId of testIds) {
      try {
        const response = await axios.get(`https://graph.facebook.com/v18.0/${testId}`, {
          params: {
            fields: 'id,username,account_type',
            access_token: accessToken
          }
        });

        if (response.data.account_type === 'BUSINESS' || response.data.username) {
          console.log(`✅ Found working ID: ${testId}`);
          console.log('   Username:', response.data.username || 'N/A');
          console.log('   Account Type:', response.data.account_type || 'N/A');
          
          // Test media access
          try {
            const mediaTest = await axios.get(`https://graph.facebook.com/v18.0/${testId}/media`, {
              params: {
                fields: 'id',
                limit: 1,
                access_token: accessToken
              }
            });
            console.log('   ✅ Media access works!');
            console.log(`\n🎯 Use this ID in your .env: INSTAGRAM_BUSINESS_ACCOUNT_ID=${testId}`);
            return testId;
          } catch (mediaError) {
            console.log('   ❌ Media access failed');
          }
        }
      } catch (error) {
        // Silent fail for test IDs
      }
    }

    console.log('\n❌ Could not find a working Instagram Business Account ID');
    console.log('\n💡 Next steps:');
    console.log('1. Create a Facebook Page at: https://facebook.com/pages/create');
    console.log('2. Connect an Instagram Business account to that page');
    console.log('3. Use Graph API Explorer to find the correct ID');
    console.log('4. Or contact Facebook support for help with your app setup');

  } catch (error) {
    console.error('❌ Error:', error.response?.data?.error?.message || error.message);
  }
}

if (require.main === module) {
  findRealIgId();
}

module.exports = { findRealIgId };
