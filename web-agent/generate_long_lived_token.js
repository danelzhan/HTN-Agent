#!/usr/bin/env node

/**
 * Script to generate a long-lived Instagram access token
 * Run this script to convert your short-lived token to a long-lived one
 */

const axios = require('axios');
require('dotenv').config();

async function generateLongLivedToken() {
  try {
    const shortLivedToken = process.argv[2] || process.env.INSTAGRAM_ACCESS_TOKEN;
    const appSecret = process.env.INSTAGRAM_APP_SECRET;
    
    if (!shortLivedToken || !appSecret) {
      console.error('❌ Missing required parameters');
      console.log('Usage: node generate_long_lived_token.js [short_lived_token]');
      console.log('Or set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_APP_SECRET in .env');
      process.exit(1);
    }

    console.log('🔄 Generating long-lived access token...');
    
    const response = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.INSTAGRAM_APP_ID,
        client_secret: appSecret,
        fb_exchange_token: shortLivedToken
      }
    });

    const longLivedToken = response.data.access_token;
    const expiresIn = response.data.expires_in;
    
    console.log('✅ Long-lived token generated successfully!');
    console.log('📋 Token:', longLivedToken);
    console.log('⏰ Expires in:', Math.floor(expiresIn / 86400), 'days');
    console.log('');
    console.log('🔧 Update your .env file with:');
    console.log(`INSTAGRAM_ACCESS_TOKEN=${longLivedToken}`);
    
  } catch (error) {
    console.error('❌ Error generating long-lived token:');
    console.error(error.response?.data || error.message);
  }
}

if (require.main === module) {
  generateLongLivedToken();
}

module.exports = { generateLongLivedToken };
