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
import { dialog, BrowserWindow, app } from "electron";
import AdmZip from "adm-zip";
import * as fs from "node:fs";
import path from "node:path";
import { shell } from "electron";
import { request } from "undici";
import { ipcMain } from "electron";
import { spawn, execSync } from "child_process";
import { json } from "node:stream/consumers";
import { registerDownloadHandler } from "./modInstaller.js";

const DISABLED_MODS_DIR = ".pd2mm_disabled";
const MOD_UTILITY_FOLDERS = new Set([
  "saves",
  "logs",
  "downloads",
  "base",
  DISABLED_MODS_DIR,
]);
const appAutoUpdater = autoUpdater();
const electronAutoUpdater = appAutoUpdater.getAutoUpdater();
const settingsDirectory = () => path.join(app.getPath("userData"), "PD2MM");
const settingsFilePath = () => path.join(settingsDirectory(), "settings.txt");
let updateIpcRegistered = false;
let updateStatusListenersRegistered = false;

const getActiveModPath = (basePath: string, type: string, name: string) =>
  type === "override"
    ? `${basePath}/assets/mod_overrides/${name}`
    : type === "map"
      ? `${basePath}/Maps/${name}`
      : `${basePath}/mods/${name}`;

const getDisabledModsContainerPath = (basePath: string, type: string) =>
  type === "override"
    ? `${basePath}/assets/mod_overrides/${DISABLED_MODS_DIR}`
    : type === "map"
      ? `${basePath}/Maps/${DISABLED_MODS_DIR}`
      : `${basePath}/mods/${DISABLED_MODS_DIR}`;

const getDisabledModPath = (basePath: string, type: string, name: string) =>
  `${getDisabledModsContainerPath(basePath, type)}/${name}`;

const ensureDirectory = (dirPath: string) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const extractZipWithAdmZip = (archivePath: string, destinationPath: string) => {
  const zip = new AdmZip(archivePath);
  zip.extractAllTo(destinationPath, true);
};

const runArchiveCommand = (command: string, args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(command, args);
    let stderr = "";

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(`${command} extraction failed (code ${code}): ${stderr}`),
        );
      } else {
        resolve();
      }
    });

    child.on("error", (err) => {
      reject(err);
    });
  });

const toolExists = (tool: string): boolean => {
  try {
    execSync(`which ${tool} 2>/dev/null`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

const extractArchiveOnLinux = async (
  archiveType: string,
  archivePath: string,
  destinationPath: string,
) => {
  const lower = archivePath.toLowerCase();

  const attemptsFor = (pairs: Array<[string, string[]]>) => {
    return async (): Promise<void> => {
      let lastErr: Error | null = null;
      for (const [cmd, args] of pairs) {
        try {
          await runArchiveCommand(cmd, args);
          return;
        } catch (e) {
          lastErr = e instanceof Error ? e : new Error(String(e));
        }
      }
      throw lastErr || new Error("No extractor succeeded");
    };
  };

  // Common extractors per extension
  const zipCommands: Array<[string, string[]]> = [
    ["unzip", ["-o", archivePath, "-d", destinationPath]],
    ["bsdtar", ["-xf", archivePath, "-C", destinationPath]],
    ["7z", ["x", "-y", `-o${destinationPath}`, archivePath]],
    ["unar", ["-o", destinationPath, archivePath]],
  ];

  const sevenCommands: Array<[string, string[]]> = [
    ["7z", ["x", "-y", `-o${destinationPath}`, archivePath]],
    ["7za", ["x", "-y", `-o${destinationPath}`, archivePath]],
    ["7zr", ["x", "-y", `-o${destinationPath}`, archivePath]],
    ["bsdtar", ["-xf", archivePath, "-C", destinationPath]],
  ];

  const rarCommands: Array<[string, string[]]> = [
    ["unrar", ["x", "-o+", archivePath, destinationPath]],
    ["7z", ["x", "-y", `-o${destinationPath}`, archivePath]],
    ["unar", ["-o", destinationPath, archivePath]],
    ["bsdtar", ["-xf", archivePath, "-C", destinationPath]],
  ];

  try {
    if (lower.endsWith(".zip")) {
      try {
        await attemptsFor(zipCommands)();
        return;
      } catch {
        // fallback to adm-zip
        extractZipWithAdmZip(archivePath, destinationPath);
        return;
      }
    }

    if (lower.endsWith(".7z")) {
      await attemptsFor(sevenCommands)();
      return;
    }

    if (lower.endsWith(".rar")) {
      await attemptsFor(rarCommands)();
      return;
    }

    // Unknown extension: try a broad set of extractors (7z, unar, bsdtar)
    await attemptsFor([
      ["7z", ["x", "-y", `-o${destinationPath}`, archivePath]],
      ["unar", ["-o", destinationPath, archivePath]],
      ["bsdtar", ["-xf", archivePath, "-C", destinationPath]],
    ])();
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  }
};

const moveDirectoryReplacingIfExists = (
  sourcePath: string,
  destinationPath: string,
) => {
  if (!fs.existsSync(sourcePath)) {
    return false;
  }

  const destinationParent = destinationPath.substring(
    0,
    destinationPath.lastIndexOf("/"),
  );
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
  color?: string;
};

type Pd2mmModSourceMetadata = {
  provider: "modworkshop";
  modId: string;
  sourceUrl: string;
  savedAt: string;
  latestFileId?: number;
  latestVersion?: string;
};

type ModWorkshopFile = {
  id?: string | number;
  version?: string;
  download_url?: string;
};

const pickLatestModWorkshopFile = (
  files: ModWorkshopFile[],
): ModWorkshopFile | null => {
  if (!files.length) {
    return null;
  }

  const filesWithNumericId = files
    .map((file) => ({ file, id: Number(file.id) }))
    .filter((entry) => Number.isFinite(entry.id) && entry.id > 0);

  if (filesWithNumericId.length > 0) {
    filesWithNumericId.sort(
      (firstEntry, secondEntry) => secondEntry.id - firstEntry.id,
    );
    return filesWithNumericId[0]?.file ?? null;
  }

  const candidates = [...files].sort((firstFile, secondFile) => {
    const firstVersion = String(firstFile.version ?? "");
    const secondVersion = String(secondFile.version ?? "");
    const versionComparison = compareVersionStrings(
      secondVersion,
      firstVersion,
    );
    if (versionComparison !== 0) {
      return versionComparison;
    }

    const firstId = Number(firstFile.id ?? 0);
    const secondId = Number(secondFile.id ?? 0);
    return secondId - firstId;
  });

  return candidates[0] ?? null;
};

const MOD_SOURCE_METADATA_FILE = ".pd2mm-source.json";

const normalizeModColor = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const numericParts = trimmed
    .split(/[\s,]+/)
    .map((part) => Number(part))
    .filter((part) => Number.isFinite(part));

  if (numericParts.length >= 3) {
    const channels = numericParts.slice(0, 3);
    const shouldScaleFromUnitRange = channels.every(
      (part) => part >= 0 && part <= 1,
    );
    const normalizedChannels = channels.map((part) => {
      const scaled = shouldScaleFromUnitRange
        ? Math.round(part * 255)
        : Math.round(part);
      return Math.max(0, Math.min(255, scaled));
    });

    return `#${normalizedChannels
      .map((part) => part.toString(16).padStart(2, "0"))
      .join("")}`;
  }

  if (/^#|^rgb\(|^hsl\(/i.test(trimmed)) {
    return trimmed;
  }

  return undefined;
};

const tryParseModTxt = (rawContent: string): ParsedModMetadata | null => {
  try {
    const parsed = JSON.parse(rawContent);
    if (parsed && typeof parsed === "object") {
      const typedParsed = parsed as ParsedModMetadata & {
        backgroundColor?: string;
        background_color?: string;
        bgcolor?: string;
        bgColor?: string;
      };

      return {
        name: typedParsed.name,
        version: typedParsed.version,
        author: typedParsed.author,
        image: typedParsed.image,
        color: normalizeModColor(
          typedParsed.color ||
            typedParsed.backgroundColor ||
            typedParsed.background_color ||
            typedParsed.bgcolor ||
            typedParsed.bgColor,
        ),
      };
    }
  } catch {
    // Fall through to tolerant parser
  }

  const content = rawContent
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  const extractValue = (key: string): string | undefined => {
    const keyRegex = new RegExp(
      `[\"']?${key}[\"']?\\s*[:=]\\s*[\"']([^\"']+)[\"']`,
      "i",
    );
    const match = content.match(keyRegex);
    return match?.[1];
  };

  const fallback: ParsedModMetadata = {
    name: extractValue("name"),
    version: extractValue("version"),
    author: extractValue("author"),
    image: extractValue("image"),
    color: normalizeModColor(
      extractValue("color") ||
        extractValue("backgroundColor") ||
        extractValue("background_color") ||
        extractValue("bgcolor") ||
        extractValue("bgColor"),
    ),
  };

  const hasAnyValue = Object.values(fallback).some((value) => Boolean(value));
  return hasAnyValue ? fallback : null;
};

const getModSourceMetadataPath = (modPath: string) =>
  `${modPath}/${MOD_SOURCE_METADATA_FILE}`;

const saveModSourceMetadata = (
  modPath: string,
  metadata: Pd2mmModSourceMetadata,
) => {
  try {
    fs.writeFileSync(
      getModSourceMetadataPath(modPath),
      JSON.stringify(metadata, null, 2),
      "utf8",
    );
  } catch (error) {
    console.warn("Failed to save mod source metadata:", error);
  }
};

const loadModSourceMetadata = (
  modPath: string,
): Pd2mmModSourceMetadata | null => {
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

const tryExtractModWorkshopIdFromModTxt = (
  rawContent: string,
): string | null => {
  const urlMatch = rawContent.match(/modworkshop\.net\/mod\/(\d+)/i);
  if (urlMatch?.[1]) {
    return urlMatch[1];
  }

  const hostIdMatch = rawContent.match(
    /host["']?\s*[:=]\s*["']modworkshop["'][\s\S]{0,240}?id["']?\s*[:=]\s*["']?(\d+)/i,
  );
  if (hostIdMatch?.[1]) {
    return hostIdMatch[1];
  }

  try {
    const parsed = JSON.parse(rawContent);
    if (parsed && typeof parsed === "object") {
      const updates = (parsed as { updates?: unknown }).updates;
      if (Array.isArray(updates)) {
        for (const entry of updates) {
          if (!entry || typeof entry !== "object") {
            continue;
          }

          const updateEntry = entry as {
            host?: string;
            id?: string | number;
            page?: string;
            url?: string;
          };
          const host = updateEntry.host?.toLowerCase();
          if (host && !host.includes("modworkshop")) {
            continue;
          }

          const fromId = extractModWorkshopId(String(updateEntry.id ?? ""));
          if (fromId) {
            return fromId;
          }

          const fromUrl =
            extractModWorkshopId(updateEntry.url) ||
            extractModWorkshopId(updateEntry.page);
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
const compareVersionStrings = (
  currentVersion: string,
  latestVersion: string,
): number => {
  const currentParts = currentVersion.match(/\d+/g)?.map(Number) ?? [];
  const latestParts = latestVersion.match(/\d+/g)?.map(Number) ?? [];

  if (currentParts.length === 0 || latestParts.length === 0) {
    return currentVersion.localeCompare(latestVersion, undefined, {
      numeric: true,
      sensitivity: "base",
    });
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

const normalizeVersion = (version: unknown): string => {
  const normalized = String(version ?? "").trim();
  return normalized.length > 0 ? normalized : "Unknown";
};

const getModWorkshopFiles = async (
  modId: string,
): Promise<ModWorkshopFile[] | null> => {
  const apiURL = `https://api.modworkshop.net/mods/${modId}/files`;
  const { statusCode, body } = await request(apiURL, {
    headers: {
      "User-Agent": "PD2MM/1.0",
    },
  });

  if (statusCode !== 200) {
    return null;
  }

  const response = (await body.json()) as unknown;
  if (!response || typeof response !== "object") {
    return null;
  }

  const typedResponse = response as { data?: unknown };
  if (Array.isArray(typedResponse.data)) {
    return typedResponse.data as ModWorkshopFile[];
  }

  const nestedData = typedResponse.data as { files?: unknown } | undefined;
  if (nestedData && Array.isArray(nestedData.files)) {
    return nestedData.files as ModWorkshopFile[];
  }

  return null;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getUpdateErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const sendUpdateStatus = (
  status: string,
  version: string | null = null,
  progress: number | null = null,
  error: string | null = null,
) => {
  const window = BrowserWindow.getAllWindows().find(
    (candidate) => !candidate.isDestroyed(),
  );
  if (!window || window.webContents.isDestroyed()) {
    return false;
  }

  window.webContents.send("update:status", {
    status,
    version,
    progress,
    error,
  });
  return true;
};

const registerUpdateStatusListeners = () => {
  if (updateStatusListenersRegistered) {
    return;
  }

  electronAutoUpdater.on("checking-for-update", () => {
    console.debug("[auto-updater] checking for update...");
    sendUpdateStatus("checking");
  });

  electronAutoUpdater.on("update-available", (info) => {
    console.debug("[auto-updater] update available:", info?.version);
    sendUpdateStatus("available", info?.version ?? null);
  });

  electronAutoUpdater.on("update-not-available", () => {
    console.debug("[auto-updater] update not available");
    sendUpdateStatus("not-available");
  });

  electronAutoUpdater.on("download-progress", (progress) => {
    sendUpdateStatus("downloading", null, Math.round(progress?.percent ?? 0));
  });

  electronAutoUpdater.on("update-downloaded", (info) => {
    console.debug("[auto-updater] update downloaded:", info?.version);
    sendUpdateStatus("downloaded", info?.version ?? null);
  });

  electronAutoUpdater.on("error", (error) => {
    console.error("[auto-updater] error:", error);
    sendUpdateStatus("error", null, null, getUpdateErrorMessage(error));
  });

  updateStatusListenersRegistered = true;
};

const runUpdateCheck = async (currentVersion: string, autoDownload = false) => {
  if (!app.isPackaged) {
    return {
      success: false,
      skipped: true,
      hasUpdate: false,
      version: null,
      message: "Update checks are only available in packaged builds.",
    };
  }

  const result = autoDownload
    ? await appAutoUpdater.runAutoUpdater()
    : await appAutoUpdater.runManualUpdateCheck(currentVersion);

  return {
    success: true,
    skipped: false,
    hasUpdate: Boolean(result && (result as { hasUpdate?: boolean }).hasUpdate),
    version: (result as { version?: string | null } | null)?.version ?? null,
    message: (result as { hasUpdate?: boolean; version?: string | null } | null)
      ?.hasUpdate
      ? `Update available${(result as { version?: string | null } | null)?.version ? `: ${(result as { version?: string | null } | null)?.version}` : ""}`
      : "No updates available.",
  };
};

const getModImageFromMWH = async (modId: string): Promise<string | null> => {
  return null;
};

const getLatestModWorkshopFileWithRetry = async (
  modId: string,
  attempts = 8,
  waitMs = 400,
): Promise<ModWorkshopFile | null> => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const files = await getModWorkshopFiles(modId);
    const latestFile = files ? pickLatestModWorkshopFile(files) : null;
    if (latestFile) {
      return latestFile;
    }

    if (attempt < attempts - 1) {
      await delay(waitMs);
    }
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
      }),
    )
    .init(terminateAppOnLastWindowClose())
    .init(hardwareAccelerationMode({ enable: true }))
    .init(appAutoUpdater)
    // Install DevTools extension if needed
    // .init(chromeDevToolsExtension({extension: 'VUEJS3_DEVTOOLS'}))
    .init(
      allowInternalOrigins(
        new Set(
          initConfig.renderer instanceof URL
            ? [initConfig.renderer.origin]
            : [],
        ),
      ),
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
            : [],
        ),
      ),
    )
    .init({
      enable: () => {
        console.log("App is ready");
        registerUpdateStatusListeners();

        // Make deep link handler available to IPC handlers
        ipcMain.handle("handle-deep-link", async (event, url: string) => {
          console.log("Deep link requested from renderer:", url);
          deepLinkHandler.handleDeepLink(url);
        });

        // Check available extraction tools
        console.log("\n=== Extraction Tools Check ===");

        if (process.platform === "win32") {
          // Check PowerShell
          console.log("PowerShell: Available (Windows built-in)");

          // Check 7-Zip
          const sevenZipPaths = [
            "C:\\Program Files\\7-Zip\\7z.exe",
            "C:\\Program Files (x86)\\7-Zip\\7z.exe",
          ];
          const sevenZipFound = sevenZipPaths.some((path) =>
            fs.existsSync(path),
          );
          console.log("7-Zip:", sevenZipFound ? "Available" : "Not found");

          // Check WinRAR
          const winrarPaths = [
            "C:\\Program Files\\WinRAR\\WinRAR.exe",
            "C:\\Program Files (x86)\\WinRAR\\WinRAR.exe",
          ];
          const winrarFound = winrarPaths.some((path) => fs.existsSync(path));
          console.log("WinRAR:", winrarFound ? "Available" : "Not found");

          if (!sevenZipFound && !winrarFound) {
            console.log(
              "\n⚠ Tip: Install 7-Zip or WinRAR for better archive extraction support",
            );
          }
        } else if (process.platform === "linux") {
          const linuxTools = [
            "unzip",
            "bsdtar",
            "7z",
            "7za",
            "7zr",
            "unar",
            "unrar",
          ];
          for (const tool of linuxTools) {
            const found = toolExists(tool);
            console.log(`${tool}: ${found ? "Available" : "Not found"}`);
          }
        } else if (process.platform === "darwin") {
          const macTools = ["unzip", "bsdtar", "7z", "unar", "unrar"];
          for (const tool of macTools) {
            const found = toolExists(tool);
            console.log(`${tool}: ${found ? "Available" : "Not found"}`);
          }
        }
        console.log("============================\n");
      },
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
  if (result.filePaths[0].endsWith("mods")) {
    result.filePaths[0] = result.filePaths[0].slice(0, -5);
  }
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
    const allMods: Array<{
      name: string;
      type: string;
      enabled: boolean;
      color?: string;
    }> = [];
    const discoveredMods = new Set<string>();

    const readModColor = (modPath: string) => {
      const modTxtPath = `${modPath}/mod.txt`;
      if (!fs.existsSync(modTxtPath)) {
        return undefined;
      }

      try {
        const modText = fs.readFileSync(modTxtPath, "utf8");
        const mod = tryParseModTxt(modText);
        return mod?.color || undefined;
      } catch {
        return undefined;
      }
    };

    const addModEntry = (
      name: string,
      type: string,
      enabled: boolean,
      color?: string,
    ) => {
      const key = `${type}:${name}`;
      if (discoveredMods.has(key)) {
        return;
      }

      discoveredMods.add(key);
      allMods.push({ name, type, enabled, color });
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

        addModEntry(mod, "mod", true, readModColor(modPath));
      });
    }

    // Check maps folder
    const mapsPath = operation + "/Maps";
    if (fs.existsSync(mapsPath)) {
      const maps = fs.readdirSync(mapsPath);
      maps.forEach((map) => {
        if (map === DISABLED_MODS_DIR) {
          return;
        }

        const mapPath = `${mapsPath}/${map}`;
        if (!fs.statSync(mapPath).isDirectory()) {
          return;
        }

        addModEntry(map, "map", true, readModColor(mapPath));
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

        addModEntry(mod, "mod", false, readModColor(modPath));
      });
    }

    // Check disabled maps
    const disabledMapsPath = getDisabledModsContainerPath(operation, "map");
    if (fs.existsSync(disabledMapsPath)) {
      const disabledMaps = fs.readdirSync(disabledMapsPath);
      disabledMaps.forEach((map) => {
        const mapPath = `${disabledMapsPath}/${map}`;
        if (!fs.statSync(mapPath).isDirectory()) {
          return;
        }

        addModEntry(map, "map", false, readModColor(mapPath));
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

        addModEntry(mod, "override", true, readModColor(modPath));
      });
    }

    // Check disabled overrides
    const disabledOverridesPath = getDisabledModsContainerPath(
      operation,
      "override",
    );
    if (fs.existsSync(disabledOverridesPath)) {
      const disabledOverrides = fs.readdirSync(disabledOverridesPath);
      disabledOverrides.forEach((mod) => {
        const modPath = `${disabledOverridesPath}/${mod}`;
        if (!fs.statSync(modPath).isDirectory()) {
          return;
        }

        addModEntry(mod, "override", false, readModColor(modPath));
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
          let base64Image = Buffer.from(imageData).toString("base64");
          img = `data:image/png;base64,${base64Image}`;
        }
      } else {
        getModImageFromMWH(loadModSourceMetadata(modPath)?.modId ?? "").then(
          (imageUrl) => {
            img = imageUrl || undefined;
          },
        );
      }

      return {
        name: mod.name || modData.name,
        image: img,
        version: mod.version || "Unknown",
        author: mod.author || "Unknown",
        color: mod.color || undefined,
      };
    }

    // Try main.xml for BeardLib or map mods
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
        color: undefined,
        image: undefined,
      };
    }

    return {
      name: modData.name,
      author: "Unknown",
      version: "Unknown",
      color: undefined,
      image: undefined,
    };
  } catch (err) {
    console.error("Error reading mod data:", err);
    return {
      name: operation.name || "Unknown",
      author: "Unknown",
      version: "Unknown",
      color: undefined,
      image: undefined,
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

    const installedSourceMetadata = loadModSourceMetadata(modPath);
    let modId = installedSourceMetadata?.modId ?? null;

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

    const latestFile = await getLatestModWorkshopFileWithRetry(modId);
    if (!latestFile) {
      return {
        success: false,
        error: "Could not determine latest file from ModWorkshop",
      };
    }

    const latestVersion = normalizeVersion(latestFile.version);
    const currentVersion = normalizeVersion(getInstalledModVersion(modPath));
    let hasUpdate = false;

    if (latestVersion !== "Unknown" && currentVersion !== "Unknown") {
      hasUpdate = compareVersionStrings(currentVersion, latestVersion) < 0;
    } else {
      const latestFileId = Number(latestFile.id ?? 0);
      const installedFileId = Number(
        installedSourceMetadata?.latestFileId ?? 0,
      );
      if (latestFileId > 0 && installedFileId > 0) {
        hasUpdate = latestFileId > installedFileId;
      } else if (latestFileId > 0 && installedFileId === 0) {
        hasUpdate = true;
      }
    }

    console.log(
      `[Mod Update Check] Mod ID: ${modId}, Current Version: ${currentVersion}, Latest Version: ${latestVersion}, Has Update: ${hasUpdate}`,
    );
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
    const activePath = getActiveModPath(
      operation.basePath,
      operation.type,
      operation.name,
    );
    const disabledPath = getDisabledModPath(
      operation.basePath,
      operation.type,
      operation.name,
    );
    const modPath =
      typeof operation.enabled === "boolean"
        ? operation.enabled
          ? activePath
          : disabledPath
        : fs.existsSync(activePath)
          ? activePath
          : disabledPath;

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
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
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
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
});

ipcMain.handle("load-options", async (event, operation) => {
  const mods = fs.readdirSync(operation);
  return mods;
});

registerDownloadHandler(ipcMain, {
  getLatestModWorkshopFileWithRetry,
  normalizeVersion,
  saveModSourceMetadata,
  extractArchiveOnLinux,
  extractZipWithAdmZip,
});

ipcMain.handle("load-settings", async (event, operation) => {
  try {
    let settings = fs.readFileSync(settingsFilePath(), "utf8");
    return settings;
  } catch (err) {
    return false;
  }
});

ipcMain.handle("sync-settings", async (event, operation) => {
  if (!fs.existsSync(settingsDirectory())) {
    fs.mkdirSync(settingsDirectory(), { recursive: true });
  }
  fs.writeFileSync(settingsFilePath(), operation);
});

ipcMain.handle("launch-game", async (event, operation) => {
  const steamLaunchUrl = "steam://rungameid/218620";

  try {
    await shell.openExternal(steamLaunchUrl);
    return { success: true, method: "steam" };
  } catch (steamError) {
    const basePath =
      typeof operation?.basePath === "string" ? operation.basePath : "";
    const exeCandidates =
      process.platform === "win32"
        ? [path.join(basePath, "payday2_win32_release.exe")]
        : [
            path.join(basePath, "payday2_release"),
            path.join(basePath, "payday2.x86_64"),
            path.join(basePath, "payday2_linux"),
          ];

    try {
      const exePath = exeCandidates.find(
        (candidate) => candidate && fs.existsSync(candidate),
      );
      if (exePath) {
        const child = spawn(exePath, [], {
          detached: true,
          stdio: "ignore",
        });
        child.unref();
        return { success: true, method: "exe" };
      }
    } catch (exeError) {
      return {
        success: false,
        error: exeError instanceof Error ? exeError.message : String(exeError),
      };
    }

    return {
      success: false,
      error:
        steamError instanceof Error
          ? steamError.message
          : "Unable to launch PAYDAY 2.",
    };
  }
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

const registerUpdateHandlers = () => {
  if (updateIpcRegistered) {
    return;
  }

  ipcMain.handle("check-app-update", async () => {
    try {
      console.debug("[auto-updater][manual] check requested");
      return await runUpdateCheck(app.getVersion(), false);
    } catch (error) {
      console.error("[auto-updater][manual] check failed", error);

      return {
        success: false,
        skipped: false,
        hasUpdate: false,
        version: null,
        message: getUpdateErrorMessage(error) || "Failed to check for updates.",
      };
    }
  });

  ipcMain.handle("update:check", async () => {
    try {
      return await runUpdateCheck(app.getVersion(), false);
    } catch (error) {
      console.error("[auto-updater][manual] check failed", error);

      return {
        success: false,
        skipped: false,
        hasUpdate: false,
        version: null,
        message: getUpdateErrorMessage(error) || "Failed to check for updates.",
      };
    }
  });

  ipcMain.handle("update:download", async () => {
    if (!app.isPackaged) {
      return {
        success: false,
        skipped: true,
        message: "Update downloads are only available in packaged builds.",
      };
    }

    await appAutoUpdater.downloadUpdate();
    return { success: true };
  });

  ipcMain.handle("update:install", async () => {
    if (!app.isPackaged) {
      return {
        success: false,
        skipped: true,
        message: "Update installation is only available in packaged builds.",
      };
    }

    await appAutoUpdater.installUpdate();
    return { success: true };
  });

  updateIpcRegistered = true;
};

registerUpdateHandlers();
