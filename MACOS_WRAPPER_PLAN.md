# Plan: Native macOS Wrapper for AgentAssist

**Goal:** Create a *self-contained* native macOS wrapper application for the `agentassist` Next.js project that embeds the web app, packages the Node.js server, and makes the window invisible during screen sharing.

**Approach:** WebView Wrapper with Bundled Server

**Key Steps:**

1.  **Native macOS Project Setup:**
    *   Create a new macOS App project in Xcode.
    *   Choose Swift as the language.
    *   Set Storage option to **None**.
2.  **Package Node.js Server:**
    *   **Build Next.js:** Add a script/build phase to the Xcode project that navigates to the `agentassist` directory and runs `npm run build` to create a production build (`.next` directory).
    *   **Create Executable:** Use a tool like `pkg` to package the Node.js runtime and the necessary parts of the built Next.js application (including the server-side API routes like `/api/realtime-token`) into a single executable file. This might require configuration specific to Next.js structure.
    *   **Bundle Executable:** Configure Xcode to copy this generated server executable into the macOS app's `Resources` folder during the build process.
3.  **Manage Server Process from Swift:**
    *   In the Swift application's startup sequence (e.g., `AppDelegate`'s `applicationDidFinishLaunching`), locate the bundled server executable within the app's resources.
    *   Use the `Process` class in Swift to launch this executable.
    *   **Port Management:** The server needs to listen on a specific port (e.g., dynamically find a free one or use a predefined one). The Swift code needs to know this port to configure the WebView. This might involve passing the port as an argument when launching the server process or reading its output.
    *   Keep a reference to the `Process` instance.
    *   Implement logic to terminate this server `Process` gracefully when the macOS application quits (e.g., in `applicationWillTerminate`).
4.  **Embed WKWebView:**
    *   Add and configure a WKWebView in the main window.
    *   Enable JavaScript in the `WKWebViewConfiguration`.
5.  **Load Localhost URL:**
    *   Configure the `WKWebView` to load `http://localhost:<port>`, where `<port>` is the port the bundled Node.js server is listening on. This might require a slight delay or a check to ensure the server is ready before loading.
6.  **Implement Invisibility:**
    *   Access the application's main `NSWindow` instance.
    *   Set the window's `sharingType` property to `.none`.
7.  **Permissions:**
    *   Rely on WebView for mic/audio prompts; user needs BlackHole installed separately.
    *   Add `NSMicrophoneUsageDescription` to `Info.plist` as good practice.
8.  **Testing:**
    *   Build and run the native macOS app from Xcode.
    *   Verify the bundled server starts correctly.
    *   Verify the `agentassist` web interface loads from `localhost:<port>`.
    *   Test invisibility (Zoom, Chime) and WebRTC audio functionality (Mic & BlackHole).

**High-Level Architecture Diagram:**

```mermaid
graph TD
    subgraph Native macOS App
        direction LR
        AppWindow[NSWindow (sharingType=.none)]
        WebView[WKWebView]
        AppProcess[Swift App Logic]
        BundledServer[Bundled Node Server (Executable in Resources)]

        AppWindow --> WebView
        AppProcess -- Manages/Launches --> BundledServer
        AppProcess -- Configures --> WebView
    end

    subgraph "AgentAssist Web App (in WebView)"
        direction TB
        WebAppUI[HTML/CSS/JS (React/Next.js)]
        WebRTC[WebRTC Logic (webRTCConnection-webRTC.ts)]
        WebAppUI --> WebRTC
    end

    subgraph "External Components"
        direction TB
        AudioInput[("Mic / BlackHole")] --> WebRTC
        OpenAI[("OpenAI Realtime API")]
        WebRTC -- "SDP/Events/Audio" --> OpenAI
    end

    WebView -- Loads URL (localhost:port) --> BundledServer
    BundledServer -- "/api/realtime-token" --> WebRTC
    ScreenShare[Screen Sharing Tool] -- Attempts Capture --> AppWindow
    AppWindow -- Hidden --> ScreenShare

    style OpenAI fill:#f9f,stroke:#333,stroke-width:2px
    style AudioInput fill:#ccf,stroke:#333,stroke-width:2px
    style BundledServer fill:#eee,stroke:#333,stroke-width:1px,stroke-dasharray: 5 5