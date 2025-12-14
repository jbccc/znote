const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const http = require("http");

const isDev = process.env.NODE_ENV === "development";
const PORT = 3456;

let mainWindow;
let serverProcess;

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

async function startProdServer() {
  const standaloneDir = path.join(process.resourcesPath, "standalone");
  const dbPath = path.join(app.getPath("userData"), "znote.db");

  log("Starting server...");
  log("Standalone dir:", standaloneDir);
  log("DB path:", dbPath);
  log("Resources path:", process.resourcesPath);

  // Check if standalone exists
  if (!fs.existsSync(standaloneDir)) {
    throw new Error(`Standalone dir not found: ${standaloneDir}`);
  }

  if (!fs.existsSync(path.join(standaloneDir, "server.js"))) {
    throw new Error("server.js not found in standalone dir");
  }

  // Find node - check common locations
  const nodePaths = [
    "/opt/homebrew/bin/node",
    "/usr/local/bin/node",
    "/usr/bin/node",
  ];

  let nodePath = null;
  for (const p of nodePaths) {
    if (fs.existsSync(p)) {
      nodePath = p;
      log("Found node at:", p);
      break;
    }
  }

  if (!nodePath) {
    throw new Error("Node.js not found. Please install with: brew install node");
  }

  const env = {
    ...process.env,
    PORT: PORT.toString(),
    DATABASE_URL: `file:${dbPath}`,
    NODE_ENV: "production",
    AUTH_SECRET: "znote-local-desktop-secret",
    AUTH_TRUST_HOST: "true",
    AUTH_URL: `http://localhost:${PORT}`,
  };

  log("Spawning server with:", nodePath, "server.js");

  serverProcess = spawn(nodePath, ["server.js"], {
    cwd: standaloneDir,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  serverProcess.stdout.on("data", (data) => log("[server stdout]", data.toString()));
  serverProcess.stderr.on("data", (data) => log("[server stderr]", data.toString()));
  serverProcess.on("error", (err) => log("[server error]", err));
  serverProcess.on("exit", (code) => log("[server exit]", code));

  log("Waiting for server to be ready...");
  await waitForServer(`http://localhost:${PORT}`);
  log("Server ready!");
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
      // In dev, just connect to the running Next.js dev server
      await waitForServer("http://localhost:3000");
      mainWindow.loadURL("http://localhost:3000");
    } else {
      await startProdServer();
      mainWindow.loadURL(`http://localhost:${PORT}`);
    }
  } catch (err) {
    log("Error starting server:", err.message);
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
  if (serverProcess) serverProcess.kill();
  app.quit();
});

app.on("activate", () => {
  if (!mainWindow) createWindow();
});

app.on("before-quit", () => {
  if (serverProcess) serverProcess.kill();
});
