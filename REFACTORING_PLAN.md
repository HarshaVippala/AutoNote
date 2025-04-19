# Refactoring Heist Plan: Operation "Untangle App.tsx"

**Objective:** Refactor `src/app/App.tsx` to improve code structure, maintainability, readability, and potentially performance, without breaking existing functionality.

**Branch:** `refactor/untangle-app-tsx`

---

## Progress Tracker

### Phase 1: Extraction & Isolation (Break the Monolith)

- [x] **Step 1.1:** Extract `TopControls` into `src/app/components/TopControls.tsx`.
  - [x] Create new file and define props interface.
  - [x] Move component code (function, internal state/effects, JSX).
  - [x] Update component to use props.
  - [x] Add necessary imports.
  - [x] Update `App.tsx` to import and render the new component, passing props.
- [x] **Step 1.2:** Extract mobile swipe container logic/JSX into `src/app/components/MobileSwipeContainer.tsx`.
  - [x] Identify relevant JSX and logic in `App.tsx`.
  - [x] Create new file and define props/hooks needed.
  - [x] Move code to the new component.
  - [x] Update `App.tsx` to use the new container.

### Phase 2: Reintegration & Cleanup

- [x] **Step 2.1:** Optimize Performance.
  - [x] Apply `React.memo` to extracted components (`TopControls`, `MobileSwipeContainer`, etc.).
  - [x] Apply `useCallback` to handlers passed as props from hooks/`App.tsx` to memoized children.
- [x] **Step 2.2:** Refactor API Key Status Logic.
  - [x] Modify `TopControls` / `useRealtimeConnection` for a cleaner API key status signal.

### Phase 4: Deeper Dive & Verification

- [ ] **Step 4.1:** Analyze Other Areas (`useHandleServerEvent`, Contexts, Components, Lib, API).
  - [ ] Review `useHandleServerEvent` for clarity and potential optimizations.
  - [ ] Review Context providers (`TranscriptProvider`, `EventProvider`) for efficiency.
  - [ ] Review other components (`Transcript`, `Dashboard`, `AgentAnswers`) for complexity or prop issues.
  - [ ] Review `lib/realtimeConnection.ts`.
  - [ ] Review `api/session.ts`.
- [ ] **Step 4.2:** Testing.
  - [ ] Perform thorough functional testing (desktop/mobile) after each major step/phase.
  - [ ] Check browser console for errors/warnings.
- [ ] **Step 4.3:** (Optional) Hunt for Unused Code/Files.
  - [ ] Use tooling (e.g., `ts-prune`, IDE features) or manual analysis to find and remove dead code.
- [ ] **Step 4.4:** Final Review & Cleanup.
  - [ ] Read through all changed files.
  - [ ] Ensure consistency and readability. 