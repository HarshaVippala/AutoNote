# ADHD Conversation Assistant - Product Requirements Document

## 1. Executive Summary

The ADHD Conversation Assistant is an AI-powered application designed to help students with ADHD participate more effectively in conversations by tracking context, detecting questions, and providing real-time response assistance. The system will monitor conversations between the student and another person, maintaining separate context for each speaker, and help the student formulate complete, coherent responses based on the conversation history.

## 2. Problem Statement

Students with ADHD often face challenges in conversational settings including:
- Difficulty maintaining focus during conversations
- Struggling to track context when interrupted
- Anxiety about formulating appropriate responses
- Missing key information when multiple topics are discussed
- Difficulty organizing thoughts into coherent responses

This solution aims to provide real-time assistance that builds confidence and improves communication outcomes.

## 3. User Personas

### Primary User: Student with ADHD
- **Name:** Alex
- **Age:** 14-22
- **Challenges:** Difficulty maintaining focus, organizing thoughts, and producing coherent responses in conversations
- **Goals:** Communicate more effectively, reduce anxiety, build confidence in academic and social settings

### Secondary User: Conversation Partner
- **Name:** Professor Taylor
- **Role:** Teacher, interviewer, or other conversation participant
- **Goals:** Effective communication with the student, gaining insight into student's knowledge

## 4. Core Features & Requirements

### 4.1 Speaker Recognition and Context Management

#### Speaker Identification
- **Priority:** High
- **Description:** Distinguish between the student and other participants in the conversation
- **Requirements:**
  - Support multiple audio input configurations (dual microphone, single microphone with diarization)
  - Provide clear UI for configuring audio sources
  - Maintain 90%+ accuracy in speaker identification
  - Handle interruptions and overlapping speech

#### Context Tracking
- **Priority:** Critical
- **Description:** Maintain separate context for each speaker with historical tracking
- **Requirements:**
  - Store full conversation history with speaker attribution
  - Tag questions and answers
  - Maintain topic models for current conversation
  - Index key information mentioned by each speaker

### 4.2 Real-time Response Assistance

#### Question Detection
- **Priority:** Critical
- **Description:** Identify when a question is asked and determine its type and complexity
- **Requirements:**
  - Detect direct and indirect questions with 95%+ accuracy
  - Categorize questions by type (factual, opinion, etc.)
  - Assess complexity and required depth of response
  - Handle follow-up questions with context awareness

#### Response Generation
- **Priority:** Critical
- **Description:** Generate contextually relevant response suggestions based on student's background
- **Requirements:**
  - Incorporate student's previous statements into responses
  - Format responses for easy comprehension
  - Provide appropriate level of detail based on question complexity
  - Support multiple response styles (bullet points, narrative, etc.)

#### Interruption Handling
- **Priority:** High
- **Description:** Seamlessly continue response delivery when interrupted and incorporate new context
- **Requirements:**
  - Continue delivering response when student is interrupted
  - Save new context from interruptions
  - Merge new context into ongoing responses when appropriate
  - Maintain coherence across interruptions

### 4.3 User Interface & Experience

#### Configuration Interface
- **Priority:** Medium
- **Description:** Clear interface for setting up audio sources and preferences
- **Requirements:**
  - Audio source selection with device testing
  - Support for saving configurations
  - Visual indicators showing current speaker

#### Conversation View
- **Priority:** High
- **Description:** Visual representation of the conversation with clear speaker differentiation
- **Requirements:**
  - Real-time transcript with speaker labels
  - Visual highlighting of questions and responses
  - Indicators showing system activity
  - Option to save/export conversation transcripts

#### Response Display
- **Priority:** High
- **Description:** Clear presentation of generated responses
- **Requirements:**
  - Visual differentiation from conversation transcript
  - Support for different response formats
  - Controls for accepting/modifying suggested responses
  - Accessibility features for all users

## 5. Technical Requirements

### 5.1 Audio Processing

```typescript
interface AudioConfig {
  mode: "dual-microphone" | "single-microphone-with-diarization";
  primaryDeviceId?: string; // Student's microphone
  secondaryDeviceId?: string; // Other speaker's microphone
  diarizationProvider?: "assemblyai" | "azure" | "local";
  noiseReduction: boolean;
  echoCancellation: boolean;
}
```

### 5.2 Context Management

```typescript
interface ContextConfig {
  maxHistoryItems: number;
  relevanceThreshold: number;
  contextExpirationTime: number; // in milliseconds
  topicModelingEnabled: boolean;
  keyInformationExtractionEnabled: boolean;
}
```

### 5.3 Response Generation

```typescript
interface ResponseConfig {
  defaultStyle: "narrative" | "bullet-points" | "structured";
  detailLevel: "minimal" | "moderate" | "comprehensive";
  responseDeliverySpeed: "slow" | "moderate" | "fast";
  includeSourcesInResponse: boolean;
  maxResponseLength: number;
}
```

### 5.4 Integration Requirements

- **Browser Compatibility:** Chrome 80+, Firefox 78+, Safari 14+, Edge 80+
- **Device Support:** Desktop (primary), Tablet (secondary)
- **Network:** Works offline after initial setup with degraded capabilities
- **Security:** End-to-end encryption for all conversation data, local-first processing where possible

## 6. Implementation Plan

### Phase 1: Core Infrastructure (4 weeks)

#### Week 1-2: Audio Processing & Speaker Identification
- Implement dual microphone support
- Create device selection UI
- Integrate with AssemblyAI/Azure for diarization fallback
- Build speaker identification pipeline
- Develop tests for accuracy and edge cases

#### Week 3-4: Context Management & Basic UI
- Implement conversation context storage
- Develop speaker-specific context tracking
- Build question detection system
- Create basic conversation view UI
- Implement basic response generation

### Phase 2: Response Generation & Enhancement (4 weeks)

#### Week 5-6: Advanced Response Generation
- Implement detailed response generation
- Develop interruption handling
- Create response formatting options
- Build relevance scoring for context retrieval
- Integrate with LLM for response quality

#### Week 7-8: UI Refinement & User Testing
- Enhance conversation view
- Implement response display controls
- Add configuration saving
- Conduct initial user testing
- Refine based on feedback

### Phase 3: Optimization & Finalization (2 weeks)

#### Week 9-10: Performance Optimization & Final Testing
- Optimize audio processing for lower latency
- Improve response generation speed
- Conduct comprehensive user testing
- Fix bugs and polish UI
- Prepare for deployment

## 7. Success Metrics

### 7.1 Technical Performance

- **Speaker Identification Accuracy:** >90% correct speaker attribution
- **Question Detection Rate:** >95% of questions correctly identified
- **Response Latency:** <1.5 seconds from question completion to response generation
- **Context Relevance:** >85% of generated responses incorporate relevant context
- **System Reliability:** <1% failure rate during typical usage sessions

### 7.2 User Experience

- **Comprehension Improvement:** >30% improvement in response completeness and relevance
- **Anxiety Reduction:** >40% self-reported reduction in conversation anxiety
- **User Satisfaction:** >4.2/5 average rating from users
- **Session Completion:** >90% of started conversations completed without system abandonment
- **Repeat Usage:** >70% of users return for multiple sessions

## 8. Risks & Mitigation Strategies

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Inaccurate speaker identification | High | Medium | Provide manual correction UI, multi-algorithm approach |
| High latency in response generation | High | Medium | Optimize LLM calls, precompute common responses |
| Privacy concerns with conversation data | High | Low | Local-first processing, explicit consent model |
| Limited value for certain conversation types | Medium | Medium | Focus on academic/structured conversations initially |
| Technical setup too complex for users | Medium | High | Create guided setup, preset configurations |

## 9. Future Enhancements

- Mobile device support
- Integration with video conferencing platforms
- Personalized response style learning
- Offline LLM for full privacy preservation
- Specialized modes for different conversational contexts (interviews, classroom, social)
- Multi-language support
- Non-verbal cue detection (pauses, tone)

## 10. Appendix

### API & Integration Requirements

#### AssemblyAI Integration (Speaker Diarization)
```typescript
interface AssemblyAIConfig {
  apiKey: string;
  sampleRate: number;
  language: string;
  speakerLabels: boolean;
  punctuate: boolean;
  formatText: boolean;
}
```

#### OpenAI Integration (Response Generation)
```typescript
interface OpenAIConfig {
  apiKey: string;
  model: "gpt-4" | "gpt-3.5-turbo";
  temperature: number;
  maxTokens: number;
  frequencyPenalty: number;
  presencePenalty: number;
}
```

### Integration with Existing OpenAI Realtime Agents Framework

#### File Modifications

1. **Agent Configuration**
   - Create new agent configuration in `src/app/agentConfigs/adhdAssistant.ts`
   - Extend `AgentConfig` interface to support dual-speaker context

2. **UI Enhancements**
   - Modify `src/app/components/Transcript.tsx` to support speaker differentiation
   - Add configuration panel in `src/app/components/BottomToolbar.tsx`

3. **Audio Pipeline**
   - Enhance `src/app/lib/realtimeConnection.ts` to support multiple audio inputs
   - Add speaker identification logic in new module

4. **Context Management**
   - Extend `TranscriptContext` in `src/app/contexts/TranscriptContext.tsx`
   - Add speaker-specific context tracking

5. **Response Generation**
   - Create new response management system
   - Implement question detection and response formulation

This PRD provides a comprehensive blueprint for implementing the ADHD Conversation Assistant, with clear specifications for features, technical requirements, and implementation plans. 