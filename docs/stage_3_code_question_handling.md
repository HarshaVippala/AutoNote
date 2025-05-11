# Stage 3: Code Question Handling

**Objective:**  
This stage aims to implement robust handling of code-related questions within the unified OpenAI Responses API framework. It focuses on integrating three specialized tools—`format_comprehensive_code` for generating full code solutions to new questions, `refine_comprehensive_code` for applying patches or optimizations to previously provided code in follow-up scenarios, and `explain_code_snippet` for providing detailed explanations of specific code portions in follow-up contexts—all invoked through the `openai.responses.create` call.

**Tasks:**  
1. **Define JSON Schemas for Code Tools:**  
   - Create and validate JSON schemas for `format_comprehensive_code`, `refine_comprehensive_code`, and `explain_code_snippet` as per the provided tool definitions. Ensure schemas align with OpenAI API requirements for tool invocation.  
2. **Develop Initial Prompts for Each Tool:**  
   - Craft tailored prompts for `format_comprehensive_code` to generate relevant and complete code solutions.  
   - Design prompts for `refine_comprehensive_code` to interpret patch instructions accurately and modify existing code.  
   - Formulate prompts for `explain_code_snippet` to deliver clear, context-aware explanations of specific code segments.  
3. **Extend or Create Test Endpoint for Code Handling:**  
   - Develop a new test endpoint, `/api/v2/classify_and_handle_code`, or extend an existing one to handle code questions post-classification.  
   - Implement logic to:  
     - Invoke `format_comprehensive_code` if `questionType` is 'code' and `isFollowUp` is 'no'.  
     - Invoke `refine_comprehensive_code` if `questionType` is 'code', `isFollowUp` is 'yes', and `followUpFlavor` is 'code_refine'.  
     - Invoke `explain_code_snippet` if `questionType` is 'code', `isFollowUp` is 'yes', and `followUpFlavor` is 'code_explain'.  
   - Ensure this endpoint operates in parallel to existing logic for isolated testing without disrupting current code handling.  
4. **Implement Parameter Passing Logic:**  
   - For `format_comprehensive_code`, pass the user’s prompt directly as a parameter.  
   - For `refine_comprehensive_code`, retrieve the last code snippet from the conversation context store (assistant’s final output) and pass it as `snippet`, along with user-provided `patchInstructions`.  
   - For `explain_code_snippet`, extract the relevant code portion from the conversation history and pass it as `snippet`, along with the `lineRef` specified by the user.  
5. **Add Logging for Inputs and Outputs:**  
   - Implement detailed logging for inputs (e.g., user prompts, snippets, instructions) and outputs (e.g., generated code, explanations) for all three tools to facilitate debugging and performance evaluation.  
6. **Ensure Isolated Testing Paths:**  
   - Design test cases for each tool invocation path to ensure independent validation of `format_comprehensive_code`, `refine_comprehensive_code`, and `explain_code_snippet` functionalities.  

**Testing Criteria:**  
- **Tool Invocation Accuracy:** Verify that the correct tool is invoked based on classification parameters (`questionType` = 'code', `isFollowUp` status, and `followUpFlavor` value).  
- **Functionality of `format_comprehensive_code`:** Confirm that the tool generates relevant, syntactically correct code for new code questions.  
- **Functionality of `refine_comprehensive_code`:** Ensure patches or optimizations are applied correctly to the provided code snippet without introducing errors.  
- **Functionality of `explain_code_snippet`:** Validate that explanations are accurate, relevant to the specified code lines, and helpful for user understanding.  
- **Endpoint Response Integrity:** Test that the `/api/v2/classify_and_handle_code` endpoint returns the appropriate code or explanation in the expected format.  
- **Logging Completeness:** Check that logs capture all necessary input and output data for each tool invocation without missing critical information.  

**Notes/Decisions:**  
- **Context Management for Snippets:** Following the existing approach in the application overview, only assistant messages (final function call outputs) are stored in the in-memory `conversationContextStore`. For `refine_comprehensive_code` and `explain_code_snippet`, the last relevant code snippet will be retrieved from this store for follow-up handling. No additional persistence of user transcripts or system audio is required beyond the current request.  
- **Fallback for Snippet Retrieval:** If a snippet cannot be retrieved from the context store (e.g., due to session reset), the system will rely on the frontend to pass the relevant snippet or prompt an error to the user for clarification.  
- **Parallel Testing:** The new endpoint logic will run alongside existing code handling to prevent disruption during testing, allowing for iterative refinement before full integration.  

**Decision Flow Diagram:**  
```mermaid
graph TD
    A[User Input] --> B[Classify Question]
    B --> C{questionType?}
    C -->|code| D{isFollowUp?}
    D -->|no| E[Invoke format_comprehensive_code]
    D -->|yes| F{followUpFlavor?}
    F -->|code_refine| G[Invoke refine_comprehensive_code]
    F -->|code_explain| H[Invoke explain_code_snippet]
    E --> I[Return Code Solution]
    G --> J[Return Refined Code]
    H --> K[Return Code Explanation]
    C -->|other| L[Handle via other stages]