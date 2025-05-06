// Test script for validating previous_response_id feature
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');

async function testFollowUps() {
  const apiUrl = 'http://localhost:3000/api/responses';
  const conversationId = uuidv4(); // Generate unique conversation ID
  
  console.log('=== TESTING PREVIOUS_RESPONSE_ID IMPLEMENTATION ===');
  console.log(`Conversation ID: ${conversationId}`);
  
  // 1. Initial Question
  console.log('\n1. SENDING INITIAL QUESTION...\n');
  const initialQuestion = 'Tell me about a time you resolved a conflict in a team';
  let responseId = null;
  
  try {
    // Send initial behavioral question
    const initialResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: initialQuestion,
        conversationId
      }),
    });
    
    if (!initialResponse.ok) {
      throw new Error(`HTTP error: ${initialResponse.status}`);
    }
    
    // Process streamed response
    const reader = initialResponse.body.getReader();
    let accumulatedData = '';
    
    console.log('INITIAL RESPONSE:');
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = new TextDecoder().decode(value);
      accumulatedData += chunk;
      
      // Extract response ID from completed event
      try {
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.trim() && line.includes('"type":"completed"')) {
            const parsed = JSON.parse(line);
            if (parsed.response && parsed.response.id) {
              responseId = parsed.response.id;
              console.log(`\nExtracted response ID: ${responseId}\n`);
            }
          }
        }
      } catch (e) {
        // Ignore JSON parse errors in partial chunks
      }
    }
    
    // 2. Follow-up Question using previous_response_id
    console.log('\n2. SENDING FOLLOW-UP QUESTION WITH PREVIOUS_RESPONSE_ID...\n');
    
    if (!responseId) {
      throw new Error('Did not receive a response ID from initial question');
    }
    
    const followUpResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: 'What was the exact percentage improvement from that?',
        conversationId,
        previousResponseId: responseId
      }),
    });
    
    if (!followUpResponse.ok) {
      throw new Error(`HTTP error: ${followUpResponse.status}`);
    }
    
    // Process streamed follow-up response
    const followUpReader = followUpResponse.body.getReader();
    let followUpData = '';
    
    console.log('FOLLOW-UP RESPONSE:');
    while (true) {
      const { done, value } = await followUpReader.read();
      if (done) break;
      
      const chunk = new TextDecoder().decode(value);
      console.log(chunk);
      followUpData += chunk;
    }
    
    // 3. Third question without previous_response_id (for comparison)
    console.log('\n3. SENDING THIRD QUESTION WITHOUT PREVIOUS_RESPONSE_ID...\n');
    
    const thirdResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: 'How did you measure success?',
        conversationId
      }),
    });
    
    if (!thirdResponse.ok) {
      throw new Error(`HTTP error: ${thirdResponse.status}`);
    }
    
    // Process streamed third response
    const thirdReader = thirdResponse.body.getReader();
    
    console.log('THIRD RESPONSE:');
    while (true) {
      const { done, value } = await thirdReader.read();
      if (done) break;
      
      const chunk = new TextDecoder().decode(value);
      console.log(chunk);
    }
    
    console.log('\n=== TEST COMPLETED SUCCESSFULLY ===');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testFollowUps();
