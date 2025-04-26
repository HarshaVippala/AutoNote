# Triple-Pane Code-Chat Interface: UI Design Document

## 1. Overview & Goals

**Purpose:** Create a triple-pane interface where:
- Left pane displays conversation history and handles follow-up questions
- Middle pane shows code implementation
- Right pane presents algorithm thinking, time/space complexity, and planning steps
- Tabbed interface for managing different versions of solutions

**Success Metrics:**
- Reduced context switching for users
- Clear separation of conversation, code, and analysis
- Immediate visibility of thinking process while code generates
- Smooth handling of follow-up questions
- Preservation of solution iterations

## 2. UI Components & Layout

### 2.1 Main Conversation Pane (Left Window)
- Primary conversation display and follow-up questions
- Approximately 1/3 of total width
- Handles concurrent follow-up questions without disrupting code display

### 2.2 Code Implementation Pane (Middle Window)
- Code displayed as proper code blocks with syntax highlighting (without line numbers)
- Tab navigation for different versions of solutions
- Approximately 1/3 of total width
- Compact view focused solely on implementation

### 2.3 Algorithm Analysis Pane (Right Window)
- Displays "thinking out loud" steps when approaching problems
- Shows time and space complexity analysis
- Presents algorithm planning and explanation
- Approximately 1/3 of total width
- Changes in sync with code pane when tabs are switched

### 2.4 Dividers
- Adjustable dividers between all three panes
- Drag to resize
- Double-click to reset to default split

### 2.5 Visual Indicators
- Solution version indicators in tab system
- Active tab highlighting
- Update notifications for new content

## 3. Interaction Patterns

### 3.1 Concurrent Request Strategy
- First request generates "How I'm planning to approach this problem" in right pane
- Second concurrent request generates code implementation in middle pane
- Additional requests update left pane for follow-up questions
- All panes update appropriately when switching solution tabs

### 3.2 Solution Version Management
- Tab interface above code pane for different solution versions
- When a tab is selected, both code and analysis panes update to show relevant content
- New versions created through iterations or alternative approaches

### 3.3 Follow-up Question Handling
- Text responses appear in main left pane
- Code updates appear in middle pane
- Analysis updates appear in right pane
- Context maintained across all windows

### 3.4 Manual Controls
- Collapse/expand buttons for any pane
- Resize handles for adjusting width ratios

## 4. Visual Design

### 4.1 Typography
- Conversation pane: Optimized for readability
- Code pane: Monospaced font with syntax highlighting (no line numbers)
- Analysis pane: Clear headings for different sections (approach, complexity, etc.)
- Consistent font sizing across panes

### 4.2 Color System
- Subtle background difference between panes
- Tab highlighting for active state
- Notification indicators for updates

### 4.3 Layout Specifications
- Default split: 33% for each pane
- Minimum widths: 25% for any pane
- Max width: 50% for any pane

## 5. State Management

### 5.1 Pane States
- All visible: Default state with 3 equal panes
- Adjusted: User has manually resized panes
- Collapsed: One or more panes minimized by user

### 5.2 Content States
- Planning: "Thinking" content appearing in right pane
- Implementing: Code appearing in middle pane
- Discussing: Follow-up content in left pane
- Tabbed: Multiple solution versions available

### 5.3 Context Preservation
- Maintain state across all three panes when switching solution tabs
- Keep history of all interactions in left pane
- Remember tab selection between sessions

## 6. API Strategy

### 6.1 Initial Requests
- Use responses API with reasoning="medium" for planning approach (right pane)
- Concurrent request with file_search for implementation (middle pane)

### 6.2 Follow-up Handling
- Maintain conversation context with previous_response_id 
- Use streaming responses for immediate feedback

### 6.3 Version Management
- Store solution history with unique IDs
- Enable switching between versions while preserving context

## 7. Implementation Plan

### Phase 1: Basic Structure
1. ✅ Create resizable triple-pane container -> Switched to fixed 3-pane layout
2. ✅ Implement basic pane visibility logic
3. ❌ Add resize functionality for all dividers -> Removed in favor of fixed layout

### Phase 2: Content Display
1. ✅ Add syntax highlighting to code pane (without line numbers)
2. ✅ Implement tab interface for solution versions -> Basic structure added
3. ✅ Create automatic content routing to appropriate panes -> Done

### Phase 3: Concurrent Request Strategy
1. ⏳ Implement parallel API request handling -> Frontend logic added, backend pending
2. ⏳ Add planning-first, code-second workflow -> Frontend logic added, backend pending
3. ❌ Set up follow-up question handling in left pane

### Phase 4: Tab Management
1. ✅ Implement solution version tracking -> Done (via tabData state)
2. ✅ Add synchronized updates between code and analysis panes -> Done
3. ✅ Create tab switching interface -> Basic structure added

### Phase 5: Polish & Testing
1. ❌ Refine transitions and animations
2. ❌ Test with various problem types
3. ❌ Optimize for performance with concurrent requests

### Phase 6: Documentation
1. ❌ Document components and interactions
2. ❌ Create usage guidelines
3. ❌ Prepare for handoff/implementation 