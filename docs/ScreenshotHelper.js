// ScreenshotHelper.js

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { v4: uuidv4 } = require('uuid');
const { execFile } = require('child_process');
const { promisify } = require('util');
const screenshot = require('screenshot-desktop');
const os = require('os');

const execFileAsync = promisify(execFile);

class ScreenshotHelper {
  constructor() {
    // Screenshot queues for storing paths
    this.screenshotQueue = [];
    this.extraScreenshotQueue = [];
    this.MAX_SCREENSHOTS = 5;

    // Initialize directories
    this.screenshotDir = path.join(app.getPath('userData'), 'screenshots');
    this.extraScreenshotDir = path.join(app.getPath('userData'), 'extra_screenshots');
    this.tempDir = path.join(os.tmpdir(), 'AgentAssistScreenshots');

    // Create directories if they don't exist
    this.ensureDirectoriesExist();
    
    // Clean existing screenshot directories when starting the app
    this.cleanScreenshotDirectories();
    
    console.log('ScreenshotHelper initialized with directories:');
    console.log(`- Main: ${this.screenshotDir}`);
    console.log(`- Extra: ${this.extraScreenshotDir}`);
    console.log(`- Temp: ${this.tempDir}`);
  }
  
  ensureDirectoriesExist() {
    const directories = [this.screenshotDir, this.extraScreenshotDir, this.tempDir];
    
    for (const dir of directories) {
      if (!fs.existsSync(dir)) {
        try {
          fs.mkdirSync(dir, { recursive: true });
          console.log(`Created directory: ${dir}`);
        } catch (err) {
          console.error(`Error creating directory ${dir}:`, err);
        }
      }
    }
  }
  
  cleanScreenshotDirectories() {
    try {
      // Clean main screenshots directory
      if (fs.existsSync(this.screenshotDir)) {
        const files = fs.readdirSync(this.screenshotDir)
          .filter(file => file.endsWith('.png'))
          .map(file => path.join(this.screenshotDir, file));
        
        // Delete each screenshot file
        for (const file of files) {
          try {
            fs.unlinkSync(file);
            console.log(`Deleted existing screenshot: ${file}`);
          } catch (err) {
            console.error(`Error deleting screenshot ${file}:`, err);
          }
        }
      }
      
      // Clean extra screenshots directory
      if (fs.existsSync(this.extraScreenshotDir)) {
        const files = fs.readdirSync(this.extraScreenshotDir)
          .filter(file => file.endsWith('.png'))
          .map(file => path.join(this.extraScreenshotDir, file));
        
        // Delete each screenshot file
        for (const file of files) {
          try {
            fs.unlinkSync(file);
            console.log(`Deleted existing extra screenshot: ${file}`);
          } catch (err) {
            console.error(`Error deleting extra screenshot ${file}:`, err);
          }
        }
      }
      
      console.log("Screenshot directories cleaned successfully");
    } catch (err) {
      console.error("Error cleaning screenshot directories:", err);
    }
  }

  getScreenshotQueue() {
    return this.screenshotQueue;
  }

  getExtraScreenshotQueue() {
    console.log("Getting extra screenshot queue:", this.extraScreenshotQueue);
    return this.extraScreenshotQueue;
  }

  clearQueues() {
    // Clear screenshotQueue
    this.screenshotQueue.forEach((screenshotPath) => {
      if (fs.existsSync(screenshotPath)) {
        fs.unlink(screenshotPath, (err) => {
          if (err)
            console.error(`Error deleting screenshot at ${screenshotPath}:`, err);
        });
      }
    });
    this.screenshotQueue = [];

    // Clear extraScreenshotQueue
    this.extraScreenshotQueue.forEach((screenshotPath) => {
      if (fs.existsSync(screenshotPath)) {
        fs.unlink(screenshotPath, (err) => {
          if (err)
            console.error(`Error deleting extra screenshot at ${screenshotPath}:`, err);
        });
      }
    });
    this.extraScreenshotQueue = [];
    
    console.log("All screenshot queues cleared");
  }

  async captureScreenshot() {
    try {
      console.log("Starting screenshot capture...");
      
      // For Windows, try multiple methods
      if (process.platform === 'win32') {
        return await this.captureWindowsScreenshot();
      }
      
      // For macOS, use native screencapture command if available
      if (process.platform === 'darwin') {
        try {
          return await this.captureMacOSScreenshot();
        } catch (macError) {
          console.warn("macOS native screenshot failed, falling back to screenshot-desktop:", macError);
        }
      }
      
      // Default for Linux or fallback for other platforms: use screenshot-desktop
      console.log("Taking screenshot with screenshot-desktop package");
      const buffer = await screenshot({ format: 'png' });
      console.log(`Screenshot captured successfully, size: ${buffer.length} bytes`);
      return buffer;
    } catch (error) {
      console.error("Error capturing screenshot:", error);
      throw new Error(`Failed to capture screenshot: ${error.message}`);
    }
  }

  async captureMacOSScreenshot() {
    console.log("Attempting macOS screenshot with native screencapture command");
    const tempFile = path.join(this.tempDir, `mac-temp-${uuidv4()}.png`);
    
    // Use the macOS screencapture command
    await execFileAsync('/usr/sbin/screencapture', ['-x', '-C', tempFile]);
    
    if (fs.existsSync(tempFile)) {
      const buffer = fs.readFileSync(tempFile);
      console.log(`macOS native screenshot successful, size: ${buffer.length} bytes`);
      
      // Clean up the temp file
      try {
        fs.unlinkSync(tempFile);
      } catch (cleanupErr) {
        console.warn("Failed to clean up macOS temp file:", cleanupErr);
      }
      
      return buffer;
    } else {
      throw new Error("macOS screencapture command did not create file");
    }
  }

  async captureWindowsScreenshot() {
    console.log("Attempting Windows screenshot with multiple methods");
    
    // Method 1: Try screenshot-desktop with filename first
    try {
      const tempFile = path.join(this.tempDir, `temp-${uuidv4()}.png`);
      console.log(`Taking Windows screenshot to temp file (Method 1): ${tempFile}`);
      
      await screenshot({ filename: tempFile });
      
      if (fs.existsSync(tempFile)) {
        const buffer = fs.readFileSync(tempFile);
        console.log(`Method 1 successful, screenshot size: ${buffer.length} bytes`);
        
        // Cleanup temp file
        try {
          fs.unlinkSync(tempFile);
        } catch (cleanupErr) {
          console.warn("Failed to clean up temp file:", cleanupErr);
        }
        
        return buffer;
      } else {
        console.log("Method 1 failed: File not created");
        throw new Error("Screenshot file not created");
      }
    } catch (error) {
      console.warn("Windows screenshot Method 1 failed:", error);
      
      // Method 2: Try using PowerShell
      try {
        console.log("Attempting Windows screenshot with PowerShell (Method 2)");
        const tempFile = path.join(this.tempDir, `ps-temp-${uuidv4()}.png`);
        
        // PowerShell command to take screenshot using .NET classes
        const psScript = `
        Add-Type -AssemblyName System.Windows.Forms,System.Drawing
        $screens = [System.Windows.Forms.Screen]::AllScreens
        $top = ($screens | ForEach-Object {$_.Bounds.Top} | Measure-Object -Minimum).Minimum
        $left = ($screens | ForEach-Object {$_.Bounds.Left} | Measure-Object -Minimum).Minimum
        $width = ($screens | ForEach-Object {$_.Bounds.Right} | Measure-Object -Maximum).Maximum
        $height = ($screens | ForEach-Object {$_.Bounds.Bottom} | Measure-Object -Maximum).Maximum
        $bounds = [System.Drawing.Rectangle]::FromLTRB($left, $top, $width, $height)
        $bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
        $graphics = [System.Drawing.Graphics]::FromImage($bmp)
        $graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bounds.Size)
        $bmp.Save('${tempFile.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
        $graphics.Dispose()
        $bmp.Dispose()
        `;
        
        // Execute PowerShell
        await execFileAsync('powershell', [
          '-NoProfile', 
          '-ExecutionPolicy', 'Bypass',
          '-Command', psScript
        ]);
        
        // Check if file exists and read it
        if (fs.existsSync(tempFile)) {
          const buffer = fs.readFileSync(tempFile);
          console.log(`Method 2 successful, screenshot size: ${buffer.length} bytes`);
          
          // Cleanup
          try {
            fs.unlinkSync(tempFile);
          } catch (err) {
            console.warn("Failed to clean up PowerShell temp file:", err);
          }
          
          return buffer;
        } else {
          throw new Error("PowerShell screenshot file not created");
        }
      } catch (psError) {
        console.warn("Windows PowerShell screenshot failed:", psError);
        
        // Method 3: Last resort - create a tiny placeholder image
        console.log("All screenshot methods failed, creating placeholder image");
        
        // Create a 1x1 transparent PNG as fallback
        const fallbackBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
        console.log("Created placeholder image as fallback");
        
        // Show the error but return a valid buffer so the app doesn't crash
        throw new Error("Could not capture screenshot with any method. Please check your Windows security settings and try again.");
      }
    }
  }

  async takeScreenshot(hideMainWindow, showMainWindow) {
    console.log("Taking screenshot");
    hideMainWindow();
    
    // Increased delay for window hiding
    const hideDelay = process.platform === 'win32' ? 500 : 300;
    await new Promise((resolve) => setTimeout(resolve, hideDelay));

    try {
      // Get screenshot buffer using cross-platform method
      const screenshotBuffer = await this.captureScreenshot();
      
      if (!screenshotBuffer || screenshotBuffer.length === 0) {
        throw new Error("Screenshot capture returned empty buffer");
      }

      // Save to main screenshot queue
      const screenshotPath = path.join(this.screenshotDir, `${uuidv4()}.png`);
      fs.writeFileSync(screenshotPath, screenshotBuffer);
      console.log("Adding screenshot to main queue:", screenshotPath);
      
      this.screenshotQueue.push(screenshotPath);
      if (this.screenshotQueue.length > this.MAX_SCREENSHOTS) {
        const removedPath = this.screenshotQueue.shift();
        if (removedPath && fs.existsSync(removedPath)) {
          try {
            fs.unlinkSync(removedPath);
            console.log("Removed old screenshot from main queue:", removedPath);
          } catch (error) {
            console.error("Error removing old screenshot:", error);
          }
        }
      }
      
      return screenshotPath;
    } catch (error) {
      console.error("Screenshot error:", error);
      throw error;
    } finally {
      // Delay before showing window again
      await new Promise((resolve) => setTimeout(resolve, 200));
      showMainWindow();
    }
  }

  async getImagePreview(filepath) {
    try {
      if (!fs.existsSync(filepath)) {
        console.error(`Image file not found: ${filepath}`);
        return '';
      }
      
      const data = fs.readFileSync(filepath);
      return `data:image/png;base64,${data.toString("base64")}`;
    } catch (error) {
      console.error("Error reading image:", error);
      return '';
    }
  }

  async deleteScreenshot(path) {
    try {
      if (fs.existsSync(path)) {
        fs.unlinkSync(path);
      }
      
      this.screenshotQueue = this.screenshotQueue.filter(
        (filePath) => filePath !== path
      );
      this.extraScreenshotQueue = this.extraScreenshotQueue.filter(
        (filePath) => filePath !== path
      );
      
      return { success: true };
    } catch (error) {
      console.error("Error deleting file:", error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = ScreenshotHelper; 