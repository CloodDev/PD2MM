import AdmZip from "adm-zip";
import * as fs from "node:fs";
import { spawn } from "child_process";
import { request } from "undici";
import { detectExtractedMod } from "./modDetection.js";

type Helpers = {
  getLatestModWorkshopFileWithRetry: (modId: string) => Promise<any>;
  normalizeVersion: (v: unknown) => string;
  saveModSourceMetadata: (modPath: string, metadata: any) => void;
  extractArchiveOnLinux: (archiveType: string, archivePath: string, destinationPath: string) => Promise<void>;
  extractZipWithAdmZip: (archivePath: string, destinationPath: string) => void;
};

export function registerDownloadHandler(ipcMain: any, helpers: Helpers) {
  ipcMain.handle("download-mod", async (event: any, operation: any) => {
    const baseURL = operation.url;
    const basePath = operation.path;
    const send = (payload: any) => event.sender.send("download-progress", payload);

    const cleanup = (zip?: string, extract?: string) => {
      try {
        if (zip && fs.existsSync(zip)) fs.unlinkSync(zip);
        if (extract && fs.existsSync(extract)) fs.rmSync(extract, { recursive: true, force: true });
      } catch (e) { console.error("Cleanup error:", e); }
    };

    const sendError = (msg: string, userMsg?: string) => { console.error(msg); send({ status: "error", error: userMsg ?? msg }); return false; };

    try {
      if (!baseURL || !basePath) return sendError("Missing URL or path", "Missing download URL or installation path");
      if (!fs.existsSync(basePath)) return sendError(`Installation path does not exist: ${basePath}`, "Payday 2 installation path not found. Please select a valid directory.");
      if (!baseURL.includes("modworkshop.net/mod/")) return sendError("Invalid URL format", "Invalid ModWorkshop URL. Please use a URL from modworkshop.net");

      send({ status: "fetching", progress: 0 });
      const modID = baseURL.split("https://modworkshop.net/mod/")[1]?.split("/")[0]?.split("?")[0];
      if (!modID) return sendError("Could not extract mod ID from URL", "Could not parse mod ID from URL");

      let sourceMetadata: any = { provider: "modworkshop", modId: modID, sourceUrl: `https://modworkshop.net/mod/${modID}`, savedAt: new Date().toISOString() };

      const apiURL = `https://api.modworkshop.net/mods/${modID}/files`;
      const { statusCode } = await request(apiURL, { headers: { 'User-Agent': 'PD2MM/1.0' } });
      if (statusCode !== 200) return sendError(`API returned status ${statusCode}`, `Failed to fetch mod data (HTTP ${statusCode}). The mod may not exist or the API is down.`);

      const latestFile = await helpers.getLatestModWorkshopFileWithRetry(modID);
      if (!latestFile || latestFile.id == null) return sendError("No latest file id in API response", "Mod data is invalid or has no download files available");

      sourceMetadata = { ...sourceMetadata, latestFileId: Number.isFinite(Number(latestFile.id)) && Number(latestFile.id) > 0 ? Number(latestFile.id) : undefined, latestVersion: helpers.normalizeVersion(latestFile.version) !== "Unknown" ? helpers.normalizeVersion(latestFile.version) : undefined, savedAt: new Date().toISOString() };

      const downloadURL = `https://api.modworkshop.net/files/${latestFile.id}/download`;
      const archiveType = String(latestFile.download_url ?? downloadURL).toLowerCase().includes('.7z') ? '7z' : String(latestFile.download_url ?? downloadURL).toLowerCase().includes('.rar') ? 'rar' : 'zip';

      send({ status: "downloading", progress: 10 });

      let response = await request(downloadURL, { headers: { 'User-Agent': 'PD2MM/1.0' } });
      let currentURL = downloadURL;
      for (let i = 0; i < 5 && [301,302,303,307,308].includes(response.statusCode); i++) {
        const location = Array.isArray(response.headers.location) ? response.headers.location[0] : response.headers.location;
        if (!location) break;
        await response.body.text().catch(() => "");
        currentURL = new URL(location, currentURL).toString();
        response = await request(currentURL, { headers: { 'User-Agent': 'PD2MM/1.0' } });
      }
      if (response.statusCode !== 200) return sendError(`Download failed with status ${response.statusCode}`, `Download failed (HTTP ${response.statusCode}). The file may no longer be available.`);

      const contentLength = parseInt(response.headers['content-length'] as string || '0');
      const zipPath = `${basePath}/temp_download.zip`;
      const fileStream = fs.createWriteStream(zipPath);
      let downloadedBytes = 0;
      response.body.on('data', (chunk: Buffer) => { downloadedBytes += chunk.length; const progress = contentLength > 0 ? Math.floor((downloadedBytes / contentLength) * 60) + 10 : 30; send({ status: "downloading", progress }); });
      await new Promise((resolve, reject) => { response.body.pipe(fileStream); fileStream.on('finish', resolve); fileStream.on('error', reject); });

      if (!fs.existsSync(zipPath)) return sendError("Downloaded file not found after download", "Download completed but file is missing");
      if (fs.statSync(zipPath).size === 0) { cleanup(zipPath); return sendError("Downloaded file is empty", "Downloaded file is empty or corrupted"); }

      send({ status: "extracting", progress: 70 });
      const tempExtractPath = `${basePath}/temp_extract`; if (!fs.existsSync(tempExtractPath)) fs.mkdirSync(tempExtractPath, { recursive: true });

      let extractionSuccess = false; let lastError: Error | null = null;

      try {
        if (process.platform === 'linux') { await helpers.extractArchiveOnLinux(archiveType, zipPath, tempExtractPath); extractionSuccess = true; }
        else {
          const findExecutable = (paths: Array<string | undefined>) => paths.find(p => p && fs.existsSync(p)) ?? null;
          const seven = findExecutable(["/usr/bin/7z", "/usr/bin/7za", "/usr/bin/7zr", "/usr/bin/p7zip"]);
          const rar = findExecutable(["/usr/bin/unrar", "/usr/bin/rar"]);

          const trySpawn = (cmd: string, args: string[]) => new Promise<void>((resolve, reject) => { const p = spawn(cmd, args); let stderr = ''; p.stderr?.on('data', d => stderr += d.toString()); p.on('close', code => code === 0 ? resolve() : reject(new Error(`${cmd} failed (code ${code}): ${stderr}`))); p.on('error', reject); });

          const attempts: Array<() => Promise<void>> = [];
          if (!['7z','rar'].includes(archiveType)) attempts.push(() => trySpawn('powershell', ['Expand-Archive','-Force','-Path', `"${zipPath}"`, '-DestinationPath', `"${tempExtractPath}"`]));
          if (seven) attempts.push(() => trySpawn(seven as string, ['x','-y', `-o${tempExtractPath}`, zipPath]));
          if (rar) attempts.push(() => trySpawn(rar as string, ['x','-o+', zipPath, tempExtractPath]));
          attempts.push(() => trySpawn('powershell', ['Expand-Archive','-Force','-Path', `"${zipPath}"`, '-DestinationPath', `"${tempExtractPath}"`]));

          for (const a of attempts) { try { await a(); extractionSuccess = true; break; } catch (e) { lastError = e instanceof Error ? e : new Error(String(e)); console.warn('Extraction attempt failed:', lastError.message); } }
        }
      } catch (e) { lastError = e instanceof Error ? e : new Error(String(e)); }
      if (!extractionSuccess) throw lastError || new Error('Failed to extract archive with any available tool');

      send({ status: "installing", progress: 85 });
      const extractedItems = fs.readdirSync(tempExtractPath); if (extractedItems.length === 0) { cleanup(zipPath, tempExtractPath); return sendError('Archive is empty', 'Archive contains no files'); }

      let modInstalled = false;
      for (const item of extractedItems) {
        const itemPath = `${tempExtractPath}/${item}`;
        if (!fs.statSync(itemPath).isDirectory()) { console.log('Skipping non-directory item:', item); continue; }
        const ensureDir = (dir: string) => { if (!fs.existsSync(`${basePath}/${dir}`)) fs.mkdirSync(`${basePath}/${dir}`, { recursive: true }); };
        const detected = detectExtractedMod(itemPath, item);
        if (detected){
          ensureDir(detected?.destination);
          const dest = `${basePath}/${detected.destination}/${item}`;
          if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
          fs.renameSync(itemPath, dest);
          helpers.saveModSourceMetadata(dest, sourceMetadata);
          modInstalled = true;
        }
      }

      if (!modInstalled) { cleanup(zipPath, tempExtractPath); return sendError('No valid mod files found in archive', 'No valid mod files found. The archive may be corrupted or have an invalid / unsupported structure.'); }

      cleanup(zipPath, tempExtractPath); send({ status: 'complete', progress: 100 }); return true;
    } catch (err) {
      console.error('=== Download Failed ===', err);
      try { cleanup(`${basePath}/temp_download.zip`, `${basePath}/temp_extract`); } catch (e) { console.error('Cleanup during error handling failed:', e); }
      let userError = 'Download failed';
      if (err instanceof Error) {
        const m = err.message;
        if (m.includes('ENOENT')) userError = 'File or directory not found. Check your Payday 2 installation path.';
        else if (m.includes('EACCES') || m.includes('EPERM')) userError = 'Permission denied. Try running as administrator.';
        else if (m.includes('ENOSPC')) userError = 'Not enough disk space.';
        else if (m.match(/network|ETIMEDOUT|ECONNREFUSED/)) userError = 'Network error. Check your internet connection.';
        else if (m.toLowerCase().includes('extract')) userError = 'Failed to extract archive. The file may be corrupted or you may need to install 7-Zip or WinRAR.';
        else userError = `Download failed: ${m}`;
      }
      send({ status: 'error', error: userError }); return false;
    }
  });
}
