// Simple test script for the new username-only API
const http = require('http');

async function testGetUserInfo(username) {
  const data = JSON.stringify({ username });
  
  const options = {
    hostname: 'localhost',
    port: 13732,
    path: '/get-user-info',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          resolve(response);
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('Testing the simplified API that only needs a username...\n');
  
  // Test with a sample username
  const testUsername = 'natgeo'; // Using National Geographic as a test case
  
  try {
    console.log(`Requesting user info for: ${testUsername}`);
    console.log('This will either return cached data or scrape and analyze the profile...\n');
    
    const result = await testGetUserInfo(testUsername);
    
    console.log('API Response:');
    console.log(JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

if (require.main === module) {
  main();
}

module.exports = { testGetUserInfo };
