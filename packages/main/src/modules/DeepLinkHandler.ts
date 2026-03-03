import { AppModule } from '../AppModule.js';
import { ModuleContext } from '../ModuleContext.js';
import { BrowserWindow, app as electronApp, dialog } from 'electron';

const PROTOCOL_SCHEME = 'mws-pdmm';

class DeepLinkHandler implements AppModule {
  #pendingUrl: string | null = null;
  #processingTimer: NodeJS.Timeout | null = null;

  enable({ app }: ModuleContext): void {
    // Set as default protocol client for mws-pdmm://
    if (process.defaultApp) {
      // In development mode - need to register with Electron and the entry point
      const entryPoint = process.argv[1];
      if (entryPoint && entryPoint !== '.' && !entryPoint.startsWith('--')) {
        // Use the entry point file
        app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, process.execPath, [entryPoint]);
        console.log('Registering protocol in dev mode:', {
          scheme: PROTOCOL_SCHEME,
          executable: process.execPath,
          args: [entryPoint]
        });
      } else {
        // Fallback - use current working directory
        const cwdEntry = 'packages/entry-point.js';
        app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, process.execPath, [cwdEntry]);
        console.log('Registering protocol in dev mode (fallback):', {
          scheme: PROTOCOL_SCHEME,
          executable: process.execPath,
          args: [cwdEntry]
        });
      }
    } else {
      app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);
      console.log('Registering protocol in production mode:', PROTOCOL_SCHEME);
    }

    // Handle protocol URLs on Windows/Linux (when app is already running)
    // This is the main way to handle deep links when clicking them while app is open
    app.on('second-instance', (_event, commandLine, workingDirectory) => {
      console.log('===== SECOND INSTANCE DETECTED =====');
      console.log('Command line:', commandLine);
      console.log('Working directory:', workingDirectory);
      console.log('====================================');
      
      // Find the protocol URL in command line arguments
      const url = commandLine.find(arg => arg.startsWith(`${PROTOCOL_SCHEME}://`));
      if (url) {
        console.log('★★★ DEEP LINK FOUND:', url);
        this.handleDeepLink(url);
      } else {
        console.log('No deep link found, just focusing window');
        // Just focus the window if no deep link
        const mainWindow = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());
        if (mainWindow) {
          if (mainWindow.isMinimized()) {
            mainWindow.restore();
          }
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });

    // Handle protocol URLs on macOS
    app.on('open-url', (event, url) => {
      event.preventDefault();
      this.handleDeepLink(url);
    });

    // Handle protocol URL passed on app start (Windows/Linux)
    // This is ONLY for the first launch with a deep link
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
    console.log('▶▶▶ handleDeepLink called with URL:', url);
    
    try {
      const parsedUrl = new URL(url);
      console.log('Parsed URL:', {
        protocol: parsedUrl.protocol,
        host: parsedUrl.host,
        pathname: parsedUrl.pathname,
      });
      
      // Get the main window
      const mainWindow = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());
      console.log('Main window found:', !!mainWindow);
      console.log('Window loading:', mainWindow?.webContents.isLoading());
      
      if (mainWindow && mainWindow.webContents.isLoading() === false) {
        // Focus the window
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow.show();
        mainWindow.focus();
        
        // Send the deep link to the renderer process
        const deepLinkData = {
          url: url,
          protocol: parsedUrl.protocol,
          host: parsedUrl.host,
          pathname: parsedUrl.pathname,
          searchParams: Object.fromEntries(parsedUrl.searchParams)
        };
        
        console.log('★★★ SENDING TO RENDERER:', deepLinkData);
        mainWindow.webContents.send('deep-link', deepLinkData);
        console.log('★★★ SENT TO RENDERER successfully');
      } else {
        // Store for when window becomes available
        console.log('Window not ready, storing deep link for later');
        this.#pendingUrl = url;
        if (!this.#processingTimer) {
          this.#startWindowCheck();
        }
      }
    } catch (error) {
      console.error('ERROR parsing deep link URL:', error);
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
