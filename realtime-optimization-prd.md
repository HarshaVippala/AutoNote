# AgentAssist Realtime API Optimization PRD

## 1. Executive Summary

This document outlines a plan to optimize the Agent Assist application's realtime transcription and processing pipeline. Key improvements focus on reducing latency and enhancing user experience by implementing dynamic classification of speaker questions directly within the realtime API workflow. This change will streamline the response generation process and reduce overall response time while optimizing cost through intelligent model selection.

## 2. Background

### 2.1 Current Implementation

The current Agent Assist application uses a multi-stage approach:

1. **Dual WebRTC Sessions**: Separate realtime connections for user microphone and speaker audio
2. **Transcription Pipeline**: Audio → OpenAI Realtime API → Transcription
3. **Processing Pipeline**: Transcription → Custom Responses API → Classification → Function Selection → Response Generation
4. **Response Categorization**: Post-processing classification into code responses, behavioral STAR responses, and general text responses

### 2.2 Technical Components

- **Session Token Generation**: `/api/realtime-token/route.ts`
- **WebRTC Connection**: `/api/realtime-assistant-webRTC/webRTCConnection-webRTC.ts`
- **Session Configuration**: Defined in `TopControls.tsx`
- **Response Processing**: Managed in `App.tsx`
- **Custom Responses API**: `/api/responses/`

## 3. Problem Statement

The current implementation has several inefficiencies:

1. **Redundant Classification**: The responses API must first determine question type before applying appropriate tools
2. **Sequential Processing**: Transcription must complete before classification begins
3. **Latency Bottlenecks**: Additional API calls between transcription and response generation
4. **Suboptimal Configurations**: Generic session parameters not optimized for specific question types
5. **Model Selection**: Not leveraging cost-efficient models for different question types
6. **Follow-up Handling**: Inadequate handling of follow-up questions in conversation flow

## 4. Proposed Solution

Implement an integrated transcription and classification approach that:

1. Enhances the realtime API session to simultaneously transcribe and classify query types
2. Uses classification results to directly invoke the appropriate response API with pre-selected functions
3. Optimizes session parameters based on identified question types
4. Dynamically selects the most cost-effective model based on question type
5. Provides proper context handling for follow-up questions

### 4.1 Core Solution Components

#### 4.1.1 Enhanced Realtime API Session

Configure the realtime API to perform dual tasks:
```typescript
const enhancedMicSessionConfig = {
  model: "gpt-4o-mini-realtime-preview-2024-12-17",
  modalities: ["text"],
  instructions: `You have two tasks:
    1. Transcribe the user's speech accurately.
    2. IMMEDIATELY classify the type of question as one of: 
       [CODE_QUESTION, BEHAVIORAL_QUESTION, GENERAL_QUESTION].
    
    After transcribing, respond with JSON in this exact format:
    {"transcript": "full transcription here", "question_type": "CODE_QUESTION|BEHAVIORAL_QUESTION|GENERAL_QUESTION"}`,
  temperature: 0.2,
  input_audio_transcription: {
    model: "whisper-1",
    language: "en"
  },
  turn_detection: {
    type: "server_vad",
    silence_duration_ms: 450,
    create_response: true,
    interrupt_response: false
  },
  input_audio_format: "pcm16"
}
```

#### 4.1.2 Optimized Response Processing with Model Selection

```typescript
// In the WebRTC handler
const handleRealtimeMessage = async (message) => {
  try {
    // Parse the realtime API response with classification
    const { transcript, question_type } = JSON.parse(message.text);
    
    // Select optimal model based on question type
    let model;
    switch(question_type) {
      case "CODE_QUESTION":
      case "BEHAVIORAL_QUESTION":
        // Use more capable but costlier model for complex reasoning
        model = "o4-mini-2025-04-16"; 
        break;
      case "GENERAL_QUESTION":
      default:
        // Use more cost-effective model for general questions
        model = "gpt-4.1-mini-2025-04-14";
        break;
    }
    
    // Send to responses API with classification and selected model
    const response = await fetch('/api/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript,
        questionType: question_type,
        model: model,
        conversationId: currentConversationId
      })
    });
    
    return await response.json();
  } catch (e) {
    // Fallback handling
    return sendToResponsesAPI(message.text, "unknown", allFunctions);
  }
}
```

#### 4.1.3 Follow-up Question Handling

Enhance the responses API to maintain conversation context:

```typescript
// In the responses API
export async function POST(request) {
  const { transcript, questionType, model, conversationId } = await request.json();
  
  // Get or create conversation context
  let context = await getConversationContext(conversationId) || {
    messages: [],
    lastQuestionType: null,
    recentTopics: []
  };
  
  // Check if this might be a follow-up based on topic similarity and patterns
  const isFollowUp = detectFollowUp(transcript, context);
  
  // Add message to context
  context.messages.push({ role: "user", content: transcript });
  context.lastQuestionType = questionType;
  
  // For follow-ups, include contextual information in the prompt
  let systemPrompt = isFollowUp 
    ? generateFollowUpPrompt(context) 
    : getStandardPrompt(questionType);
  
  // Select appropriate function set
  const functions = selectFunctions(questionType, isFollowUp);
  
  // Generate response using selected model and context
  const completion = await openai.chat.completions.create({
    model: model,
    messages: [
      { role: "system", content: systemPrompt },
      ...context.messages.slice(-10) // Use last 10 messages for context window
    ],
    functions: functions
  });
  
  // Save updated context
  await saveConversationContext(conversationId, context);
  
  // Return the response
  return NextResponse.json({ response: completion.choices[0].message });
}
```

## 5. Technical Requirements

### 5.1 API Configuration Changes

1. **Token Endpoint**: Update `/api/realtime-token/route.ts` to support enhanced session configurations for dual-purpose transcription and classification
2. **WebRTC Connection**: Modify the message handling in `/api/realtime-assistant-webRTC/webRTCConnection-webRTC.ts` to parse structured responses
3. **Response Processing**: Update `App.tsx` to handle structured response formats
4. **Responses API**: Enhance `/api/responses/` to support model selection and conversation context

### 5.2 Type-Specific Function Sets

1. **Code Question Functions**:
   - `format_comprehensive_code`
   - Code analysis and execution tools

2. **Behavioral Question Functions**:
   - `format_behavioral_star_answer`
   - Follow-up detection tools

3. **General Question Functions**:
   - Basic explanation tools
   - Simple formatting functions

### 5.3 Model Selection Strategy

| Question Type | Recommended Model | Rationale |
|---------------|-------------------|-----------|
| Code Questions | o4-mini-2025-04-16 | Better for technical content and code generation, despite higher cost |
| Behavioral Questions | o4-mini-2025-04-16 | Superior reasoning capabilities for structured STAR responses |
| General Questions | gpt-4.1-mini-2025-04-14 | Cost-effective for general information, 70% cost savings |
| Follow-up Questions | Same as original question | Maintain reasoning consistency across related questions |

### 5.4 Optimized VAD Settings

Customize Voice Activity Detection parameters by question type:
- **Code Questions**: 400ms silence threshold (faster turnaround)
- **Behavioral Questions**: 650ms (allow for more complete thoughts)
- **General Questions**: 350ms (quick back-and-forth)

### 5.5 Follow-up Detection Criteria

The follow-up detection algorithm should consider:
1. **Lexical Patterns**: Presence of follow-up indicators like "What about", "How did you", "Tell me more"
2. **Pronouns**: Use of pronouns that refer to previous content ("it", "that", "this", "they")
3. **Topic Continuity**: Semantic similarity to recent conversation topics
4. **Temporal Proximity**: Follow-ups typically occur within a short timeframe of previous exchanges

## 6. Implementation Plan

### 6.1 Phase 1: Session Configuration Updates

1. Create enhanced session configuration templates for dual-purpose transcription and classification
2. Update token endpoint to accept and use these configurations
3. Add structured response parsing to WebRTC handler
4. Implement model selection logic based on question classification

### 6.2 Phase 2: Response Pipeline Integration

1. Implement question type routing logic
2. Create function sets for each question type
3. Update responses API to accept model selection parameter
4. Implement conversation context maintenance for follow-ups

### 6.3 Phase 3: Follow-up Handling

1. Develop follow-up detection algorithm
2. Implement context storage mechanism
3. Create specialized prompts and function sets for follow-ups
4. Test with various conversation patterns

### 6.4 Phase 4: Testing and Optimization

1. Test classification accuracy with various question types
2. Fine-tune instructions and temperature settings
3. Optimize silence thresholds based on real-world usage
4. Compare model performance and cost across question types

### 6.5 Phase 5: Rollout and Monitoring

1. Deploy changes with fallback options
2. Monitor latency improvements and classification accuracy
3. Track cost savings from dynamic model selection
4. Gather user feedback for further refinements

## 7. Success Metrics

### 7.1 Performance Metrics

- **End-to-End Latency**: 30% reduction in time from speech to response
- **Classification Accuracy**: >90% correct classification of question types
- **Processing Pipeline Steps**: Reduction from 4+ steps to 2 steps
- **Cost Efficiency**: 25-40% reduction in overall API costs through intelligent model selection

### 7.2 User Experience Metrics

- **Perceived Responsiveness**: Improved ratings in user feedback
- **Error Rate**: <5% misclassification requiring rerouting
- **Response Quality**: Equal or improved relevance compared to current system
- **Follow-up Handling**: >85% accurate detection and appropriate handling of follow-up questions

## 8. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Classification errors | Incorrect response type | Implement confidence threshold with fallback to full classification |
| Increased token usage | Higher costs | Monitor and optimize prompt engineering, balance with model selection savings |
| Parsing failures | Processing errors | Robust error handling with graceful fallback to current pipeline |
| Follow-up misidentification | Contextual disconnects | Progressive confidence scoring, allow manual override of classification |
| Model performance variance | Inconsistent quality | A/B test models for each question type before finalizing selection matrix |

## 9. Cost Analysis

| Current Approach | Optimized Approach | Savings |
|------------------|-------------------|---------|
| Using o4-mini for all question types | Using gpt-4.1-mini for general questions (~60% of volume) | 40-45% cost reduction for general questions |
| Sequential classification + processing | Integrated classification during transcription | Reduced token usage by eliminating redundant processing |
| Fixed model selection | Dynamic model selection | Optimized price/performance ratio |

**Estimated Monthly Savings**: With 100,000 queries per month and 60% being general questions, savings could reach approximately $3,000 to $5,000 per month.

## 10. Conclusion

The proposed optimizations leverage the capabilities of OpenAI's realtime API to perform dual tasks of transcription and classification, eliminating redundant steps in the response pipeline. By implementing intelligent model selection and proper follow-up handling, we can significantly reduce both latency and costs while maintaining or improving response quality. This approach creates a more responsive, intelligent, and cost-effective user experience.

## 11. References

- [OpenAI Realtime API Documentation](https://platform.openai.com/docs/api-reference/realtime)
- [Latency Optimization - OpenAI API](https://openai.com/blog/optimizing-latency)
- [WebRTC Connection Standards](https://webrtc.org/)
- [Voice Activity Detection Best Practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
- [OpenAI Model Pricing](https://openai.com/pricing)
- [Conversation Context Management](https://platform.openai.com/docs/guides/conversation-state) 