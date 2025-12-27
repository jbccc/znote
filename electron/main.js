const { app, BrowserWindow, shell, protocol } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");

const isDev = process.env.NODE_ENV === "development";

let mainWindow;

function log(...args) {
  console.log("[znote]", ...args);
}

function waitForServer(url, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const check = () => {
      http.get(url, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 400) resolve();
        else retry();
      }).on("error", retry);
    };
    const retry = () => {
      if (Date.now() - startTime > timeout) reject(new Error("Server timeout"));
      else setTimeout(check, 200);
    };
    check();
  });
}

function getStaticPath() {
  if (isDev) {
    return null; // Use dev server in development
  }
  // In production, static files are in Resources/standalone
  return path.join(process.resourcesPath, "standalone");
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 900,
    minWidth: 400,
    minHeight: 300,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: "#fafafa",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  try {
    if (isDev) {
      // In dev, connect to the running Vite dev server
      await waitForServer("http://localhost:3000");
      mainWindow.loadURL("http://localhost:3000");
    } else {
      // In production, load static files
      const staticPath = getStaticPath();
      const indexPath = path.join(staticPath, "index.html");

      if (!fs.existsSync(indexPath)) {
        throw new Error(`Build files not found at: ${staticPath}`);
      }

      mainWindow.loadFile(indexPath);
    }
  } catch (err) {
    log("Error loading app:", err.message);
    mainWindow.loadURL(`data:text/html;charset=utf-8,
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, system-ui, sans-serif; padding: 60px 40px; background: #fafafa; }
            h1 { font-size: 20px; font-weight: 500; margin-bottom: 16px; }
            p { color: #666; line-height: 1.6; }
            code { background: #e5e5e5; padding: 3px 8px; border-radius: 4px; font-size: 14px; }
            .error { color: #c00; font-size: 13px; margin-top: 24px; padding: 12px; background: #fee; border-radius: 6px; }
          </style>
        </head>
        <body>
          <h1>Could not start znote</h1>
          <p>Please make sure Node.js is installed:</p>
          <p><code>brew install node</code></p>
          <div class="error">${err.message}</div>
        </body>
      </html>
    `);
  }

  mainWindow.on("closed", () => { mainWindow = null; });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (!mainWindow) createWindow();
});
