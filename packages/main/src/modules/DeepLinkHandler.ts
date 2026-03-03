import { AppModule } from '../AppModule.js';
import { ModuleContext } from '../ModuleContext.js';
import { BrowserWindow, app as electronApp } from 'electron';

const PROTOCOL_SCHEME = 'mws-pdmm';

class DeepLinkHandler implements AppModule {
  #pendingUrl: string | null = null;
  #processingTimer: NodeJS.Timeout | null = null;

  enable({ app }: ModuleContext): void {
    // Set as default protocol client for mws-pdmm://
    if (process.defaultApp) {
      // In development mode with electron .
      if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, process.execPath, [process.argv[1]]);
      }
    } else {
      app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);
    }

    // Handle protocol URLs on Windows/Linux (when app is already running)
    app.on('second-instance', (_event, commandLine) => {
      // Find the protocol URL in command line arguments
      const url = commandLine.find(arg => arg.startsWith(`${PROTOCOL_SCHEME}://`));
      if (url) {
        this.handleDeepLink(url);
      }
    });

    // Handle protocol URLs on macOS
    app.on('open-url', (event, url) => {
      event.preventDefault();
      this.handleDeepLink(url);
    });

    // Handle protocol URL passed on app start (Windows/Linux)
    if (process.platform !== 'darwin') {
      const protocolUrl = process.argv.find(arg => arg.startsWith(`${PROTOCOL_SCHEME}://`));
      if (protocolUrl) {
        console.log('Deep link detected on startup:', protocolUrl);
        // Store it to handle after window is ready
        this.#pendingUrl = protocolUrl;
        // Start checking for window availability
        this.#startWindowCheck();
      }
    }
  }

  #startWindowCheck(): void {
    // Check every 100ms if a window is available
    this.#processingTimer = setInterval(() => {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length > 0 && windows[0].webContents.isLoading() === false) {
        this.sendPendingUrl();
        if (this.#processingTimer) {
          clearInterval(this.#processingTimer);
          this.#processingTimer = null;
        }
      }
    }, 100);

    // Also listen for when the app is ready as a fallback
    electronApp.whenReady().then(() => {
      setTimeout(() => {
        if (this.#pendingUrl) {
          this.sendPendingUrl();
          if (this.#processingTimer) {
            clearInterval(this.#processingTimer);
            this.#processingTimer = null;
          }
        }
      }, 1000);
    });
  }

  handleDeepLink(url: string): void {
    console.log('Deep link received:', url);
    
    try {
      const parsedUrl = new URL(url);
      
      // Get the main window
      const mainWindow = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());
      
      if (mainWindow && mainWindow.webContents.isLoading() === false) {
        // Focus the window
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow.show();
        mainWindow.focus();
        
        // Send the deep link to the renderer process
        console.log('Sending deep link to renderer:', {
          url: url,
          protocol: parsedUrl.protocol,
          host: parsedUrl.host,
          pathname: parsedUrl.pathname,
        });
        
        mainWindow.webContents.send('deep-link', {
          url: url,
          protocol: parsedUrl.protocol,
          host: parsedUrl.host,
          pathname: parsedUrl.pathname,
          searchParams: Object.fromEntries(parsedUrl.searchParams)
        });
      } else {
        // Store for when window becomes available
        console.log('Window not ready, storing deep link for later');
        this.#pendingUrl = url;
        if (!this.#processingTimer) {
          this.#startWindowCheck();
        }
      }
    } catch (error) {
      console.error('Error parsing deep link URL:', error);
    }
  }

  // Call this method after the window is created to handle any pending URL
  sendPendingUrl(): void {
    if (this.#pendingUrl) {
      console.log('Processing pending deep link:', this.#pendingUrl);
      const url = this.#pendingUrl;
      this.#pendingUrl = null;
      this.handleDeepLink(url);
    }
  }
}

export function createDeepLinkHandler(...args: ConstructorParameters<typeof DeepLinkHandler>) {
  return new DeepLinkHandler(...args);
}
