// Test script for the OpenAI Responses API
const fetch = require('node-fetch');

async function testResponsesAPI() {
  const apiUrl = 'http://localhost:3000/api/responses';
  
  // Simple test query
  const simpleQuery = {
    messages: [
      { role: 'user', content: 'What is JavaScript hoisting?' }
    ]
  };
  
  // Complex coding test query
  const complexQuery = {
    messages: [
      { role: 'user', content: 'Write a function to find the longest substring without repeating characters in JavaScript.' }
    ]
  };
  
  // Test with the simple query
  console.log('Testing with simple query...');
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(simpleQuery),
    });
    console.log('Response:', response);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    // Handle the streamed response 
    const reader = response.body.getReader();
    let accumulatedData = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      // Convert the chunk to text
      const chunk = new TextDecoder().decode(value);
      console.log('Received chunk:', chunk);
      accumulatedData += chunk;
    }
    
    console.log('\nSimple query - Complete accumulated response:');
    try {
      console.log(JSON.parse(accumulatedData));
    } catch (e) {
      console.log('Raw response (not valid JSON):', accumulatedData);
    }
  } catch (error) {
    console.error('Error testing simple query:', error);
  }
  
  console.log('\n' + '-'.repeat(50) + '\n');
  
  // Test with the complex query (reusing previous_response_id if available)
  console.log('Testing with complex query...');
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(complexQuery),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    // Handle the streamed response
    const reader = response.body.getReader();
    let accumulatedData = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      // Convert the chunk to text
      const chunk = new TextDecoder().decode(value);
      console.log('Received chunk:', chunk);
      accumulatedData += chunk;
    }
    
    console.log('\nComplex query - Complete accumulated response:');
    try {
      console.log(JSON.parse(accumulatedData));
    } catch (e) {
      console.log('Raw response (not valid JSON):', accumulatedData);
    }
  } catch (error) {
    console.error('Error testing complex query:', error);
  }
}

// Run the test
testResponsesAPI(); 