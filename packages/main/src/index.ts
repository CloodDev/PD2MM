import type { AppInitConfig } from "./AppInitConfig.js";
import { createModuleRunner } from "./ModuleRunner.js";
import { disallowMultipleAppInstance } from "./modules/SingleInstanceApp.js";
import { createWindowManagerModule } from "./modules/WindowManager.js";
import { terminateAppOnLastWindowClose } from "./modules/ApplicationTerminatorOnLastWindowClose.js";
import { hardwareAccelerationMode } from "./modules/HardwareAccelerationModule.js";
import { autoUpdater } from "./modules/AutoUpdater.js";
import { allowInternalOrigins } from "./modules/BlockNotAllowdOrigins.js";
import { allowExternalUrls } from "./modules/ExternalUrls.js";
import { createDeepLinkHandler } from "./modules/DeepLinkHandler.js";
import { dialog, BrowserWindow } from "electron";
import * as fs from "node:fs";
import { shell } from "electron";
import { request } from "undici";
import { ipcMain } from "electron";
import { spawn } from "child_process";
import { win32 } from "node:path";

const DISABLED_MODS_DIR = ".pd2mm_disabled";
const MOD_UTILITY_FOLDERS = new Set(["saves", "logs", "downloads", "base", DISABLED_MODS_DIR]);

const getActiveModPath = (basePath: string, type: string, name: string) =>
  type === "override"
    ? `${basePath}/assets/mod_overrides/${name}`
    : `${basePath}/mods/${name}`;

const getDisabledModsContainerPath = (basePath: string, type: string) =>
  type === "override"
    ? `${basePath}/assets/mod_overrides/${DISABLED_MODS_DIR}`
    : `${basePath}/mods/${DISABLED_MODS_DIR}`;

const getDisabledModPath = (basePath: string, type: string, name: string) =>
  `${getDisabledModsContainerPath(basePath, type)}/${name}`;

const ensureDirectory = (dirPath: string) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const moveDirectoryReplacingIfExists = (sourcePath: string, destinationPath: string) => {
  if (!fs.existsSync(sourcePath)) {
    return false;
  }

  const destinationParent = destinationPath.substring(0, destinationPath.lastIndexOf("/"));
  ensureDirectory(destinationParent);

  if (fs.existsSync(destinationPath)) {
    fs.rmSync(destinationPath, { recursive: true, force: true });
  }

  fs.renameSync(sourcePath, destinationPath);
  return true;
};

type ParsedModMetadata = {
  name?: string;
  version?: string;
  author?: string;
  image?: string;
};

type Pd2mmModSourceMetadata = {
  provider: "modworkshop";
  modId: string;
  sourceUrl: string;
  savedAt: string;
};

type ModWorkshopFile = {
  id?: string | number;
  version?: string;
  download_url?: string;
};

const MOD_SOURCE_METADATA_FILE = ".pd2mm-source.json";

const tryParseModTxt = (rawContent: string): ParsedModMetadata | null => {
  try {
    const parsed = JSON.parse(rawContent);
    if (parsed && typeof parsed === "object") {
      return parsed as ParsedModMetadata;
    }
  } catch {
    // Fall through to tolerant parser
  }

  const content = rawContent.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const extractValue = (key: string): string | undefined => {
    const keyRegex = new RegExp(`[\"']?${key}[\"']?\\s*[:=]\\s*[\"']([^\"']+)[\"']`, "i");
    const match = content.match(keyRegex);
    return match?.[1];
  };

  const fallback: ParsedModMetadata = {
    name: extractValue("name"),
    version: extractValue("version"),
    author: extractValue("author"),
    image: extractValue("image"),
  };

  const hasAnyValue = Object.values(fallback).some((value) => Boolean(value));
  return hasAnyValue ? fallback : null;
};

const getModSourceMetadataPath = (modPath: string) => `${modPath}/${MOD_SOURCE_METADATA_FILE}`;

const saveModSourceMetadata = (modPath: string, metadata: Pd2mmModSourceMetadata) => {
  try {
    fs.writeFileSync(getModSourceMetadataPath(modPath), JSON.stringify(metadata, null, 2), "utf8");
  } catch (error) {
    console.warn("Failed to save mod source metadata:", error);
  }
};

const loadModSourceMetadata = (modPath: string): Pd2mmModSourceMetadata | null => {
  try {
    const metadataPath = getModSourceMetadataPath(modPath);
    if (!fs.existsSync(metadataPath)) {
      return null;
    }

    const content = fs.readFileSync(metadataPath, "utf8");
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    if (parsed.provider !== "modworkshop" || typeof parsed.modId !== "string") {
      return null;
    }

    return parsed as Pd2mmModSourceMetadata;
  } catch {
    return null;
  }
};

const extractModWorkshopId = (value: string | undefined): string | null => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const urlMatch = trimmed.match(/modworkshop\.net\/mod\/(\d+)/i);
  if (urlMatch?.[1]) {
    return urlMatch[1];
  }

  const idMatch = trimmed.match(/^(\d+)$/);
  if (idMatch?.[1]) {
    return idMatch[1];
  }

  return null;
};

const tryExtractModWorkshopIdFromModTxt = (rawContent: string): string | null => {
  const urlMatch = rawContent.match(/modworkshop\.net\/mod\/(\d+)/i);
  if (urlMatch?.[1]) {
    return urlMatch[1];
  }

  const hostIdMatch = rawContent.match(/host["']?\s*[:=]\s*["']modworkshop["'][\s\S]{0,240}?id["']?\s*[:=]\s*["']?(\d+)/i);
  if (hostIdMatch?.[1]) {
    return hostIdMatch[1];
  }

  try {
    const parsed = JSON.parse(rawContent);
    if (parsed && typeof parsed === "object") {
      const updates = (parsed as {updates?: unknown}).updates;
      if (Array.isArray(updates)) {
        for (const entry of updates) {
          if (!entry || typeof entry !== "object") {
            continue;
          }

          const updateEntry = entry as {host?: string; id?: string | number; page?: string; url?: string};
          const host = updateEntry.host?.toLowerCase();
          if (host && !host.includes("modworkshop")) {
            continue;
          }

          const fromId = extractModWorkshopId(String(updateEntry.id ?? ""));
          if (fromId) {
            return fromId;
          }

          const fromUrl = extractModWorkshopId(updateEntry.url) || extractModWorkshopId(updateEntry.page);
          if (fromUrl) {
            return fromUrl;
          }
        }
      }
    }
  } catch {
    // Ignore JSON parsing errors and rely on regex fallback.
  }

  return null;
};

const getInstalledModVersion = (modPath: string): string => {
  const modTxtPath = `${modPath}/mod.txt`;
  if (fs.existsSync(modTxtPath)) {
    const parsed = tryParseModTxt(fs.readFileSync(modTxtPath, "utf8"));
    if (parsed?.version) {
      return parsed.version;
    }
  }

  const mainXmlPath = `${modPath}/main.xml`;
  if (fs.existsSync(mainXmlPath)) {
    const xmlText = fs.readFileSync(mainXmlPath, "utf8");
    const versionMatch = xmlText.match(/<version>([^<]+)<\/version>/);
    if (versionMatch?.[1]) {
      return versionMatch[1];
    }
  }

  return "Unknown";
};

const compareVersionStrings = (currentVersion: string, latestVersion: string): number => {
  const currentParts = currentVersion.match(/\d+/g)?.map(Number) ?? [];
  const latestParts = latestVersion.match(/\d+/g)?.map(Number) ?? [];

  if (currentParts.length === 0 || latestParts.length === 0) {
    return currentVersion.localeCompare(latestVersion, undefined, {numeric: true, sensitivity: "base"});
  }

  const maxLength = Math.max(currentParts.length, latestParts.length);
  for (let index = 0; index < maxLength; index += 1) {
    const current = currentParts[index] ?? 0;
    const latest = latestParts[index] ?? 0;
    if (current < latest) {
      return -1;
    }
    if (current > latest) {
      return 1;
    }
  }

  return 0;
};

const getModWorkshopFiles = async (modId: string): Promise<ModWorkshopFile[] | null> => {
  const apiURL = `https://api.modworkshop.net/mods/${modId}/files`;
  const { statusCode, body } = await request(apiURL, {
    headers: {
      "User-Agent": "PD2MM/1.0",
    },
  });

  if (statusCode !== 200) {
    return null;
  }

  const response = await body.json() as unknown;
  if (!response || typeof response !== "object") {
    return null;
  }

  const typedResponse = response as {data?: unknown};
  if (Array.isArray(typedResponse.data)) {
    return typedResponse.data as ModWorkshopFile[];
  }

  const nestedData = typedResponse.data as {files?: unknown} | undefined;
  if (nestedData && Array.isArray(nestedData.files)) {
    return nestedData.files as ModWorkshopFile[];
  }

  return null;
};

export async function initApp(initConfig: AppInitConfig) {
  const deepLinkHandler = createDeepLinkHandler();
  
  const moduleRunner = createModuleRunner()
    .init(disallowMultipleAppInstance())
    .init(deepLinkHandler)
    .init(
      createWindowManagerModule({
        initConfig,
        openDevTools: import.meta.env.DEV,
      })
    )
    .init(terminateAppOnLastWindowClose())
    .init(hardwareAccelerationMode({ enable: false }))
    .init(autoUpdater())
    // Install DevTools extension if needed
    // .init(chromeDevToolsExtension({extension: 'VUEJS3_DEVTOOLS'}))
    .init(
      allowInternalOrigins(
        new Set(
          initConfig.renderer instanceof URL ? [initConfig.renderer.origin] : []
        )
      )
    )
    .init(
      allowExternalUrls(
        new Set(
          initConfig.renderer instanceof URL
            ? [
                "https://vite.dev",
                "https://developer.mozilla.org",
                "https://solidjs.com",
                "https://qwik.dev",
                "https://lit.dev",
                "https://react.dev",
                "https://preactjs.com",
                "https://www.typescriptlang.org",
                "https://vuejs.org",
              ]
            : []
        )
      )
    )
    .init({
      enable: () => {
        console.log("App is ready");
        
        // Make deep link handler available to IPC handlers
        ipcMain.handle("handle-deep-link", async (event, url: string) => {
          console.log('Deep link requested from renderer:', url);
          deepLinkHandler.handleDeepLink(url);
        });
        
        // Check available extraction tools
        console.log("\n=== Extraction Tools Check ===");
        
        // Check PowerShell
        console.log("PowerShell: Available (Windows built-in)");
        
        // Check 7-Zip
        const sevenZipPaths = [
          "C:\\Program Files\\7-Zip\\7z.exe",
          "C:\\Program Files (x86)\\7-Zip\\7z.exe"
        ];
        const sevenZipFound = sevenZipPaths.some(path => fs.existsSync(path));
        console.log("7-Zip:", sevenZipFound ? "✓ Available" : "✗ Not found");
        
        // Check WinRAR
        const winrarPaths = [
          "C:\\Program Files\\WinRAR\\WinRAR.exe",
          "C:\\Program Files (x86)\\WinRAR\\WinRAR.exe"
        ];
        const winrarFound = winrarPaths.some(path => fs.existsSync(path));
        console.log("WinRAR:", winrarFound ? "✓ Available" : "✗ Not found");
        
        if (!sevenZipFound && !winrarFound) {
          console.log("\n⚠ Tip: Install 7-Zip or WinRAR for better archive extraction support");
        }
        console.log("============================\n");
      }
    });
  await moduleRunner;
}

ipcMain.handle("select-directory", async (event, operation) => {
  const properties: Array<"openDirectory" | "createDirectory"> =
    operation === "export"
      ? ["openDirectory", "createDirectory"]
      : ["openDirectory"];
  const result = await dialog.showOpenDialog({
    properties: properties,
  });
  if (result.canceled) {
    return null;
  } else {
    return result.filePaths[0];
  }
});

ipcMain.handle("list-mods", async (event, operation) => {
  if (operation === "C:/") {
    return [];
  }
  try {
    const allMods: Array<{name: string, type: string, enabled: boolean}> = [];
    const discoveredMods = new Set<string>();

    const addModEntry = (name: string, type: string, enabled: boolean) => {
      const key = `${type}:${name}`;
      if (discoveredMods.has(key)) {
        return;
      }

      discoveredMods.add(key);
      allMods.push({ name, type, enabled });
    };
    
    // Check regular mods folder
    const modsPath = operation + "/mods";
    if (fs.existsSync(modsPath)) {
      const mods = fs.readdirSync(modsPath);
      mods.forEach((mod) => {
        // Skip utility folders
        if (MOD_UTILITY_FOLDERS.has(mod)) {
          return;
        }

        const modPath = `${modsPath}/${mod}`;
        if (!fs.statSync(modPath).isDirectory()) {
          return;
        }

        addModEntry(mod, "mod", true);
      });
    }

    // Check disabled regular mods
    const disabledModsPath = getDisabledModsContainerPath(operation, "mod");
    if (fs.existsSync(disabledModsPath)) {
      const disabledMods = fs.readdirSync(disabledModsPath);
      disabledMods.forEach((mod) => {
        const modPath = `${disabledModsPath}/${mod}`;
        if (!fs.statSync(modPath).isDirectory()) {
          return;
        }

        addModEntry(mod, "mod", false);
      });
    }
    
    // Check mod_overrides folder
    const modOverridesPath = operation + "/assets/mod_overrides";
    if (fs.existsSync(modOverridesPath)) {
      const overrides = fs.readdirSync(modOverridesPath);
      overrides.forEach((mod) => {
        if (mod === DISABLED_MODS_DIR) {
          return;
        }

        const modPath = `${modOverridesPath}/${mod}`;
        if (!fs.statSync(modPath).isDirectory()) {
          return;
        }

        addModEntry(mod, "override", true);
      });
    }

    // Check disabled overrides
    const disabledOverridesPath = getDisabledModsContainerPath(operation, "override");
    if (fs.existsSync(disabledOverridesPath)) {
      const disabledOverrides = fs.readdirSync(disabledOverridesPath);
      disabledOverrides.forEach((mod) => {
        const modPath = `${disabledOverridesPath}/${mod}`;
        if (!fs.statSync(modPath).isDirectory()) {
          return;
        }

        addModEntry(mod, "override", false);
      });
    }
    
    return allMods;
  } catch (err) {
    console.error("Error listing mods:", err);
    return [];
  }
});

ipcMain.handle("get-mod-data", async (event, operation) => {
  try {
    const modData = operation;
    const isEnabled = modData.enabled !== false;
    const modPath = isEnabled
      ? getActiveModPath(operation.basePath, modData.type, modData.name)
      : getDisabledModPath(operation.basePath, modData.type, modData.name);
    
    // Try to read mod.txt
    let modTextPath = modPath + "/mod.txt";
    if (fs.existsSync(modTextPath)) {
      let modText = fs.readFileSync(modTextPath, "utf8");
      const mod = tryParseModTxt(modText);

      if (!mod) {
        throw new Error("Could not parse mod.txt metadata");
      }
      
      let img = undefined;
      if (mod.image) {
        let imgPath = modPath + "/" + mod.image;
        imgPath = imgPath.replace(/\\/g, "/");
        
        if (fs.existsSync(imgPath)) {
          let imageData = fs.readFileSync(imgPath);
          let base64Image = Buffer.from(imageData).toString('base64');
          img = `data:image/png;base64,${base64Image}`;
        }
      }

      return {
        name: mod.name || modData.name,
        image: img,
        version: mod.version || "Unknown",
        author: mod.author || "Unknown",
      };
    }
    
    // Try main.xml for BeardLib mods
    let mainXmlPath = modPath + "/main.xml";
    if (fs.existsSync(mainXmlPath)) {
      let xmlText = fs.readFileSync(mainXmlPath, "utf8");
      const nameMatch = xmlText.match(/<name>([^<]+)<\/name>/);
      const authorMatch = xmlText.match(/<author>([^<]+)<\/author>/);
      const versionMatch = xmlText.match(/<version>([^<]+)<\/version>/);
      
      return {
        name: nameMatch ? nameMatch[1] : modData.name,
        author: authorMatch ? authorMatch[1] : "Unknown",
        version: versionMatch ? versionMatch[1] : "Unknown",
        image: undefined
      };
    }
    
    return {
      name: modData.name,
      author: "Unknown",
      version: "Unknown",
      image: undefined
    };
  } catch (err) {
    console.error("Error reading mod data:", err);
    return {
      name: operation.name || "Unknown",
      author: "Unknown",
      version: "Unknown",
      image: undefined
    };
  }
});

ipcMain.handle("check-mod-update", async (event, operation) => {
  try {
    const isEnabled = operation.enabled !== false;
    const modPath = isEnabled
      ? getActiveModPath(operation.basePath, operation.type, operation.name)
      : getDisabledModPath(operation.basePath, operation.type, operation.name);

    if (!fs.existsSync(modPath)) {
      return { success: false, error: "Mod folder not found" };
    }

    let modId = loadModSourceMetadata(modPath)?.modId ?? null;

    if (!modId) {
      const modTxtPath = `${modPath}/mod.txt`;
      if (fs.existsSync(modTxtPath)) {
        const rawModTxt = fs.readFileSync(modTxtPath, "utf8");
        const extractedId = tryExtractModWorkshopIdFromModTxt(rawModTxt);
        if (extractedId) {
          modId = extractedId;
          saveModSourceMetadata(modPath, {
            provider: "modworkshop",
            modId: extractedId,
            sourceUrl: `https://modworkshop.net/mod/${extractedId}`,
            savedAt: new Date().toISOString(),
          });
        }
      }
    }

    if (!modId) {
      return {
        success: true,
        supported: false,
        hasUpdate: false,
        message: "No ModWorkshop update metadata found for this mod.",
      };
    }

    const files = await getModWorkshopFiles(modId);
    if (!files || files.length === 0) {
      return { success: false, error: "Could not fetch update info from ModWorkshop" };
    }

    const latestFile = files[0];
    const latestVersion = String(latestFile.version ?? "Unknown");
    const currentVersion = getInstalledModVersion(modPath);
    const hasUpdate = latestVersion !== "Unknown" && compareVersionStrings(currentVersion, latestVersion) < 0;

    return {
      success: true,
      supported: true,
      hasUpdate,
      currentVersion,
      latestVersion,
      modId,
      modUrl: `https://modworkshop.net/mod/${modId}`,
    };
  } catch (error) {
    console.error("Error checking mod updates:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

ipcMain.handle("open-mod-folder", async (event, operation) => {
  const isEnabled = operation.enabled !== false;
  const modPath = isEnabled
    ? getActiveModPath(operation.basePath, operation.type, operation.name)
    : getDisabledModPath(operation.basePath, operation.type, operation.name);
  shell.openPath(modPath);
});

ipcMain.handle("remove-mod", async (event, operation) => {
  try {
    const activePath = getActiveModPath(operation.basePath, operation.type, operation.name);
    const disabledPath = getDisabledModPath(operation.basePath, operation.type, operation.name);
    const modPath = typeof operation.enabled === "boolean"
      ? (operation.enabled ? activePath : disabledPath)
      : (fs.existsSync(activePath) ? activePath : disabledPath);
    
    console.log(`Removing mod: ${operation.name} (${operation.type})`);
    console.log(`Path: ${modPath}`);
    
    if (!fs.existsSync(modPath)) {
      console.error("Mod folder not found:", modPath);
      return { success: false, error: "Mod folder not found" };
    }
    
    // Recursively delete the mod directory
    fs.rmSync(modPath, { recursive: true, force: true });
    
    console.log("✓ Mod removed successfully");
    return { success: true };
  } catch (err) {
    console.error("Error removing mod:", err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle("toggle-mod-enabled", async (event, operation) => {
  try {
    const { basePath, type, name, enabled } = operation;
    const sourcePath = enabled
      ? getDisabledModPath(basePath, type, name)
      : getActiveModPath(basePath, type, name);
    const destinationPath = enabled
      ? getActiveModPath(basePath, type, name)
      : getDisabledModPath(basePath, type, name);

    if (!enabled) {
      ensureDirectory(getDisabledModsContainerPath(basePath, type));
    }

    const moved = moveDirectoryReplacingIfExists(sourcePath, destinationPath);
    if (!moved) {
      return {
        success: false,
        error: enabled
          ? "Disabled mod folder not found"
          : "Enabled mod folder not found",
      };
    }

    return { success: true };
  } catch (err) {
    console.error("Error toggling mod enabled state:", err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle("load-options", async (event, operation) => {
  const mods = fs.readdirSync(operation);
  return mods;
});

interface ModAPIResponse {
  data: {
    files: any[];
    download_url: string;
  };
}

ipcMain.handle("download-mod", async (event, operation) => {
  const baseURL = operation.url;
  const basePath = operation.path;
  
  console.log("=== Download Started ===");
  console.log("URL:", baseURL);
  console.log("Base Path:", basePath);
  
  // Cleanup function for error cases
  const cleanup = (zipPath?: string, extractPath?: string) => {
    try {
      if (zipPath && fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
        console.log("Cleaned up zip file");
      }
      if (extractPath && fs.existsSync(extractPath)) {
        fs.rmSync(extractPath, { recursive: true, force: true });
        console.log("Cleaned up extract directory");
      }
    } catch (cleanupErr) {
      console.error("Cleanup error:", cleanupErr);
    }
  };
  
  try {
    // Validate inputs
    if (!baseURL || !basePath) {
      const error = "Missing URL or path";
      console.error("Validation Error:", error);
      event.sender.send("download-progress", { 
        status: "error", 
        error: "Missing download URL or installation path" 
      });
      return false;
    }
    
    // Validate base path exists
    if (!fs.existsSync(basePath)) {
      const error = `Installation path does not exist: ${basePath}`;
      console.error("Path Error:", error);
      event.sender.send("download-progress", { 
        status: "error", 
        error: "Payday 2 installation path not found. Please select a valid directory." 
      });
      return false;
    }
    
    // Validate URL format
    if (!baseURL.includes("modworkshop.net/mod/")) {
      const error = "Invalid URL format";
      console.error("URL Error:", error);
      event.sender.send("download-progress", { 
        status: "error", 
        error: "Invalid ModWorkshop URL. Please use a URL from modworkshop.net" 
      });
      return false;
    }
    
    event.sender.send("download-progress", { status: "fetching", progress: 0 });
    
    // Extract mod ID
    const modIDParts = baseURL.split("https://modworkshop.net/mod/");
    if (modIDParts.length < 2 || !modIDParts[1]) {
      const error = "Could not extract mod ID from URL";
      console.error("Parse Error:", error);
      event.sender.send("download-progress", { 
        status: "error", 
        error: "Could not parse mod ID from URL" 
      });
      return false;
    }
    
    const modID = modIDParts[1].split("/")[0].split("?")[0]; // Handle URLs with extra paths or query params
    console.log("Extracted Mod ID:", modID);
    const sourceMetadata: Pd2mmModSourceMetadata = {
      provider: "modworkshop",
      modId: modID,
      sourceUrl: `https://modworkshop.net/mod/${modID}`,
      savedAt: new Date().toISOString(),
    };
    
    // Fetch mod data from API
    console.log("Fetching mod data from API...");
    const apiURL = `https://api.modworkshop.net/mods/${modID}/files`;
    console.log("API URL:", apiURL);
    
    const { statusCode, body } = await request(apiURL, {
      headers: {
        'User-Agent': 'PD2MM/1.0'
      }
    });
    
    console.log("API Response Status:", statusCode);
    
    if (statusCode !== 200) {
      const error = `API returned status ${statusCode}`;
      console.error("API Error:", error);
      event.sender.send("download-progress", { 
        status: "error", 
        error: `Failed to fetch mod data (HTTP ${statusCode}). The mod may not exist or the API is down.` 
      });
      return false;
    }
    
    const data = (await body.json()) as ModAPIResponse;
    console.log("API Response Data:", JSON.stringify(data, null, 2));
    
    if (!data.data || !data.data[0] || !data.data[0].download_url) {
      const error = "No download URL in API response";
      console.error("API Data Error:", error, "Response:", data);
      event.sender.send("download-progress", { 
        status: "error", 
        error: "Mod data is invalid or has no download files available" 
      });
      return false;
    }
    
    const downloadURL = data.data[0].download_url;
    console.log("Download URL:", downloadURL);
    
    // Detect archive type from URL
    const archiveType = downloadURL.toLowerCase().includes('.7z') ? '7z' : 
                       downloadURL.toLowerCase().includes('.rar') ? 'rar' : 'zip';
    console.log("Detected archive type:", archiveType);
    
    event.sender.send("download-progress", { status: "downloading", progress: 10 });
    
    // Start download
    console.log("Starting download...");
    const response = await request(downloadURL, {
      headers: {
        'User-Agent': 'PD2MM/1.0'
      }
    });
    
    if (response.statusCode !== 200) {
      const error = `Download failed with status ${response.statusCode}`;
      console.error("Download Error:", error);
      event.sender.send("download-progress", { 
        status: "error", 
        error: `Download failed (HTTP ${response.statusCode}). The file may no longer be available.` 
      });
      return false;
    }
    
    const contentLength = parseInt(response.headers['content-length'] as string || '0');
    console.log("Content Length:", contentLength, "bytes");
    
    const zipPath = basePath + "/temp_download.zip";
    console.log("Saving to:", zipPath);
    
    const fileStream = fs.createWriteStream(zipPath);
    let downloadedBytes = 0;
    
    response.body.on('data', (chunk: Buffer) => {
      downloadedBytes += chunk.length;
      const progress = contentLength > 0 ? Math.floor((downloadedBytes / contentLength) * 60) + 10 : 30;
      event.sender.send("download-progress", { status: "downloading", progress });
    });
    
    await new Promise((resolve, reject) => {
      response.body.pipe(fileStream);
      fileStream.on("finish", () => {
        console.log("Download complete:", downloadedBytes, "bytes");
        resolve(undefined);
      });
      fileStream.on("error", (err) => {
        console.error("File stream error:", err);
        reject(err);
      });
    });
    
    // Verify file was downloaded
    if (!fs.existsSync(zipPath)) {
      const error = "Downloaded file not found after download";
      console.error("File Error:", error);
      event.sender.send("download-progress", { 
        status: "error", 
        error: "Download completed but file is missing" 
      });
      return false;
    }
    
    const fileSize = fs.statSync(zipPath).size;
    console.log("Downloaded file size:", fileSize, "bytes");
    
    if (fileSize === 0) {
      const error = "Downloaded file is empty";
      console.error("File Error:", error);
      cleanup(zipPath);
      event.sender.send("download-progress", { 
        status: "error", 
        error: "Downloaded file is empty or corrupted" 
      });
      return false;
    }
    
    event.sender.send("download-progress", { status: "extracting", progress: 70 });
    
    // Create temp extraction directory
    const tempExtractPath = basePath + "/temp_extract";
    console.log("Extracting to:", tempExtractPath);
    
    if (!fs.existsSync(tempExtractPath)) {
      fs.mkdirSync(tempExtractPath, { recursive: true });
      console.log("Created extraction directory");
    }
    
    // Helper function to find extraction tools
    const find7Zip = (): string | null => {
      const possiblePaths = [
        "C:\\Program Files\\7-Zip\\7z.exe",
        "C:\\Program Files (x86)\\7-Zip\\7z.exe",
        process.env.ProgramFiles + "\\7-Zip\\7z.exe",
        process.env["ProgramFiles(x86)"] + "\\7-Zip\\7z.exe"
      ];
      
      for (const path of possiblePaths) {
        if (path && fs.existsSync(path)) {
          console.log("Found 7-Zip at:", path);
          return path;
        }
      }
      return null;
    };
    
    const findWinRAR = (): string | null => {
      const possiblePaths = [
        "C:\\Program Files\\WinRAR\\WinRAR.exe",
        "C:\\Program Files (x86)\\WinRAR\\WinRAR.exe",
        process.env.ProgramFiles + "\\WinRAR\\WinRAR.exe",
        process.env["ProgramFiles(x86)"] + "\\WinRAR\\WinRAR.exe"
      ];
      
      for (const path of possiblePaths) {
        if (path && fs.existsSync(path)) {
          console.log("Found WinRAR at:", path);
          return path;
        }
      }
      return null;
    };
    
    // Extract archive using multiple methods
    console.log("Starting extraction...");
    let extractionSuccess = false;
    let lastError: Error | null = null;
    
    // Determine extraction order based on archive type
    const preferSevenZip = archiveType === '7z';
    const preferWinRAR = archiveType === 'rar';
    
    console.log(`Extraction strategy: ${preferSevenZip ? '7-Zip preferred' : preferWinRAR ? 'WinRAR preferred' : 'PowerShell preferred'}`);
    
    // Method 1: Try PowerShell Expand-Archive (for .zip files, try first)
    if (!preferSevenZip && !preferWinRAR) {
      try {
        console.log("Attempting extraction with PowerShell...");
        await new Promise((resolve, reject) => {
          const unzip = spawn("powershell", [
            "Expand-Archive",
            "-Force",
            "-Path",
            `"${zipPath}"`,
            "-DestinationPath",
            `"${tempExtractPath}"`,
          ]);
          
          let stderr = '';
          unzip.stderr?.on('data', (data) => {
            stderr += data.toString();
          });
          
          unzip.on("close", (code) => {
            if (code !== 0) {
              reject(new Error(`PowerShell extraction failed (code ${code}): ${stderr}`));
            } else {
              resolve(undefined);
            }
          });
          
          unzip.on("error", (err) => {
            reject(err);
          });
        });
        
        console.log("✓ Extraction complete with PowerShell");
        extractionSuccess = true;
      } catch (err) {
        console.warn("PowerShell extraction failed:", err instanceof Error ? err.message : err);
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }
    
    // Method 2: Try 7-Zip (preferred for .7z, fallback for others)
    if (!extractionSuccess) {
      const sevenZipPath = find7Zip();
      if (sevenZipPath) {
        try {
          console.log("Attempting extraction with 7-Zip...");
          await new Promise((resolve, reject) => {
            const unzip = spawn(sevenZipPath, [
              "x",           // Extract with full paths
              "-y",          // Yes to all prompts
              `-o${tempExtractPath}`, // Output directory
              zipPath
            ]);
            
            let stderr = '';
            unzip.stderr?.on('data', (data) => {
              stderr += data.toString();
            });
            
            unzip.on("close", (code) => {
              if (code !== 0) {
                reject(new Error(`7-Zip extraction failed (code ${code}): ${stderr}`));
              } else {
                resolve(undefined);
              }
            });
            
            unzip.on("error", (err) => {
              reject(err);
            });
          });
          
          console.log("✓ Extraction complete with 7-Zip");
          extractionSuccess = true;
        } catch (err) {
          console.warn("7-Zip extraction failed:", err instanceof Error ? err.message : err);
          lastError = err instanceof Error ? err : new Error(String(err));
        }
      } else {
        console.log("7-Zip not found on system");
      }
    }
    
    // Method 3: Try WinRAR (preferred for .rar, fallback for others)
    if (!extractionSuccess) {
      const winrarPath = findWinRAR();
      if (winrarPath) {
        try {
          console.log("Attempting extraction with WinRAR...");
          await new Promise((resolve, reject) => {
            const unzip = spawn(winrarPath, [
              "x",           // Extract with full paths
              "-y",          // Yes to all prompts
              "-ibck",       // Run in background
              zipPath,
              tempExtractPath
            ]);
            
            let stderr = '';
            unzip.stderr?.on('data', (data) => {
              stderr += data.toString();
            });
            
            unzip.on("close", (code) => {
              if (code !== 0) {
                reject(new Error(`WinRAR extraction failed (code ${code}): ${stderr}`));
              } else {
                resolve(undefined);
              }
            });
            
            unzip.on("error", (err) => {
              reject(err);
            });
          });
          
          console.log("✓ Extraction complete with WinRAR");
          extractionSuccess = true;
        } catch (err) {
          console.warn("WinRAR extraction failed:", err instanceof Error ? err.message : err);
          lastError = err instanceof Error ? err : new Error(String(err));
        }
      } else {
        console.log("WinRAR not found on system");
      }
    }
    
    // Try PowerShell as last resort if it wasn't tried first
    if (!extractionSuccess && (preferSevenZip || preferWinRAR)) {
      try {
        console.log("Attempting extraction with PowerShell as fallback...");
        await new Promise((resolve, reject) => {
          const unzip = spawn("powershell", [
            "Expand-Archive",
            "-Force",
            "-Path",
            `"${zipPath}"`,
            "-DestinationPath",
            `"${tempExtractPath}"`,
          ]);
          
          let stderr = '';
          unzip.stderr?.on('data', (data) => {
            stderr += data.toString();
          });
          
          unzip.on("close", (code) => {
            if (code !== 0) {
              reject(new Error(`PowerShell extraction failed (code ${code}): ${stderr}`));
            } else {
              resolve(undefined);
            }
          });
          
          unzip.on("error", (err) => {
            reject(err);
          });
        });
        
        console.log("✓ Extraction complete with PowerShell");
        extractionSuccess = true;
      } catch (err) {
        console.warn("PowerShell extraction failed:", err instanceof Error ? err.message : err);
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }
    
    // If all methods failed, throw the last error
    if (!extractionSuccess) {
      console.error("All extraction methods failed");
      throw lastError || new Error("Failed to extract archive with any available tool");
    }
    
    event.sender.send("download-progress", { status: "installing", progress: 85 });
    
    // Detect mod type and move to appropriate directory
    const extractedItems = fs.readdirSync(tempExtractPath);
    console.log("Extracted items:", extractedItems);
    
    if (extractedItems.length === 0) {
      const error = "Archive is empty";
      console.error("Archive Error:", error);
      cleanup(zipPath, tempExtractPath);
      event.sender.send("download-progress", { 
        status: "error", 
        error: "Archive contains no files" 
      });
      return false;
    }
    
    let modInstalled = false;
    
    for (const item of extractedItems) {
      const itemPath = `${tempExtractPath}/${item}`;
      const stat = fs.statSync(itemPath);
      
      console.log("Processing item:", item, "isDirectory:", stat.isDirectory());
      
      if (stat.isDirectory()) {
        // Check if it's a BeardLib mod (has main.xml)
        if (fs.existsSync(`${itemPath}/main.xml`)) {
          console.log("Detected BeardLib mod:", item);
          const destPath = `${basePath}/mods/${item}`;
          
          // Ensure mods directory exists
          if (!fs.existsSync(`${basePath}/mods`)) {
            fs.mkdirSync(`${basePath}/mods`, { recursive: true });
            console.log("Created mods directory");
          }
          
          if (fs.existsSync(destPath)) {
            console.log("Removing existing mod at:", destPath);
            fs.rmSync(destPath, { recursive: true, force: true });
          }
          
          console.log("Installing to:", destPath);
          fs.renameSync(itemPath, destPath);
          saveModSourceMetadata(destPath, sourceMetadata);
          modInstalled = true;
          console.log("✓ BeardLib mod installed:", item);
        }
        // Check if it's a regular mod (has mod.txt)
        else if (fs.existsSync(`${itemPath}/mod.txt`)) {
          console.log("Detected BLT mod:", item);
          const destPath = `${basePath}/mods/${item}`;
          
          // Ensure mods directory exists
          if (!fs.existsSync(`${basePath}/mods`)) {
            fs.mkdirSync(`${basePath}/mods`, { recursive: true });
            console.log("Created mods directory");
          }
          
          if (fs.existsSync(destPath)) {
            console.log("Removing existing mod at:", destPath);
            fs.rmSync(destPath, { recursive: true, force: true });
          }
          
          console.log("Installing to:", destPath);
          fs.renameSync(itemPath, destPath);
          saveModSourceMetadata(destPath, sourceMetadata);
          modInstalled = true;
          console.log("✓ BLT mod installed:", item);
        }
        // Check if it's mod_overrides content
        else if (item.toLowerCase() === 'mod_overrides' || 
                 fs.existsSync(`${itemPath}/mod.txt`) === false) {
          console.log("Detected mod_overrides content:", item);
          const overridesPath = `${basePath}/assets/mod_overrides`;
          
          if (!fs.existsSync(overridesPath)) {
            console.log("Creating mod_overrides directory:", overridesPath);
            fs.mkdirSync(overridesPath, { recursive: true });
          }
          
          // If the folder is named mod_overrides, move its contents
          if (item.toLowerCase() === 'mod_overrides') {
            console.log("Moving contents of mod_overrides folder");
            const subItems = fs.readdirSync(itemPath);
            console.log("Sub-items:", subItems);
            
            subItems.forEach(subItem => {
              const srcPath = `${itemPath}/${subItem}`;
              const destPath = `${overridesPath}/${subItem}`;
              
              if (fs.existsSync(destPath)) {
                console.log("Removing existing override at:", destPath);
                fs.rmSync(destPath, { recursive: true, force: true });
              }
              
              console.log("Installing override:", subItem);
              fs.renameSync(srcPath, destPath);
              saveModSourceMetadata(destPath, sourceMetadata);
              console.log("✓ Override installed:", subItem);
            });
            modInstalled = true;
          } else {
            // Move the folder itself to mod_overrides
            const destPath = `${overridesPath}/${item}`;
            
            if (fs.existsSync(destPath)) {
              console.log("Removing existing override at:", destPath);
              fs.rmSync(destPath, { recursive: true, force: true });
            }
            
            console.log("Installing override to:", destPath);
            fs.renameSync(itemPath, destPath);
            saveModSourceMetadata(destPath, sourceMetadata);
            modInstalled = true;
            console.log("✓ Override installed:", item);
          }
        } else {
          console.log("⚠ Unknown folder type (no main.xml, mod.txt, or mod_overrides):", item);
        }
      } else {
        console.log("⚠ Skipping non-directory item:", item);
      }
    }
    
    if (!modInstalled) {
      const error = "No valid mod files found in archive";
      console.error("Installation Error:", error);
      console.error("Archive structure may be invalid. Expected mod folders with main.xml or mod.txt");
      cleanup(zipPath, tempExtractPath);
      event.sender.send("download-progress", { 
        status: "error", 
        error: "No valid mod files found. The archive may be corrupted or have an invalid structure." 
      });
      return false;
    }
    
    // Cleanup
    console.log("Cleaning up temporary files...");
    cleanup(zipPath, tempExtractPath);
    
    console.log("=== Download Complete ===");
    event.sender.send("download-progress", { status: "complete", progress: 100 });
    
    return true;
  } catch (err) {
    console.error("=== Download Failed ===");
    console.error("Error Type:", err instanceof Error ? err.constructor.name : typeof err);
    console.error("Error Message:", err instanceof Error ? err.message : String(err));
    console.error("Error Stack:", err instanceof Error ? err.stack : "No stack trace");
    
    // Attempt cleanup
    try {
      const zipPath = basePath + "/temp_download.zip";
      const tempExtractPath = basePath + "/temp_extract";
      cleanup(zipPath, tempExtractPath);
    } catch (cleanupErr) {
      console.error("Cleanup during error handling failed:", cleanupErr);
    }
    
    // Determine user-friendly error message
    let userError = "Download failed";
    if (err instanceof Error) {
      if (err.message.includes("ENOENT")) {
        userError = "File or directory not found. Check your Payday 2 installation path.";
      } else if (err.message.includes("EACCES") || err.message.includes("EPERM")) {
        userError = "Permission denied. Try running as administrator.";
      } else if (err.message.includes("ENOSPC")) {
        userError = "Not enough disk space.";
      } else if (err.message.includes("network") || err.message.includes("ETIMEDOUT") || err.message.includes("ECONNREFUSED")) {
        userError = "Network error. Check your internet connection.";
      } else if (err.message.includes("extraction failed") || err.message.includes("Extraction failed")) {
        userError = "Failed to extract archive. The file may be corrupted or you may need to install 7-Zip or WinRAR.";
      } else {
        userError = `Download failed: ${err.message}`;
      }
    }
    
    event.sender.send("download-progress", { 
      status: "error", 
      error: userError
    });
    
    return false;
  }
});

ipcMain.handle("load-settings", async (event, operation) => {
  try {
    let settings = fs.readFileSync(process.env.APPDATA+"/PD2MM/settings.txt", "utf8");
    return settings;
  } catch (err) {

    return false;
  }
});

ipcMain.handle("sync-settings", async (event, operation) => {
  if (!fs.existsSync(process.env.APPDATA + "/PD2MM")) {
    fs.mkdirSync(process.env.APPDATA + "/PD2MM");
  }
  fs.writeFileSync(process.env.APPDATA + "/PD2MM/settings.txt", operation);
});

// Window controls for custom title bar
ipcMain.handle("window-minimize", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  window?.minimize();
});

ipcMain.handle("window-maximize", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window?.isMaximized()) {
    window.unmaximize();
  } else {
    window?.maximize();
  }
  return window?.isMaximized();
});

ipcMain.handle("window-close", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  window?.close();
});