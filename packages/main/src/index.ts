import type { AppInitConfig } from "./AppInitConfig.js";
import { createModuleRunner } from "./ModuleRunner.js";
import { disallowMultipleAppInstance } from "./modules/SingleInstanceApp.js";
import { createWindowManagerModule } from "./modules/WindowManager.js";
import { terminateAppOnLastWindowClose } from "./modules/ApplicationTerminatorOnLastWindowClose.js";
import { hardwareAccelerationMode } from "./modules/HardwareAccelerationModule.js";
import { autoUpdater } from "./modules/AutoUpdater.js";
import { allowInternalOrigins } from "./modules/BlockNotAllowdOrigins.js";
import { allowExternalUrls } from "./modules/ExternalUrls.js";
import { dialog } from "electron";
import * as fs from "node:fs";
import { shell } from "electron";
import { request } from "undici";
import { ipcMain } from "electron";
import { spawn } from "child_process";

export async function initApp(initConfig: AppInitConfig) {
  const moduleRunner = createModuleRunner()
    .init(
      createWindowManagerModule({
        initConfig,
        openDevTools: import.meta.env.DEV,
      })
    )
    .init(disallowMultipleAppInstance())
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
    );
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
    const mods = fs.readdirSync(operation + "/mods");
    mods.forEach((mod, index) => {
      if (mods[index].includes("saves")) {
        mods.splice(index, 1);
      }
      if (mods[index].includes("logs")) {
        mods.splice(index, 1);
      }
      if (mods[index].includes("downloads")) {
        mods.splice(index, 1);
      }
      if (mods[index].includes("base")) {
        mods.splice(index, 1);
      }
    });
    return mods;
  } catch (err) {
    return [];
  }
});

ipcMain.handle("get-mod-data", async (event, operation) => {
  try {
    let modText = fs.readFileSync(operation + "/mod.txt", "utf8");
    let mod: { name: string; version: string; author: string } =
      JSON.parse(modText);
    let mdata = {
      name: mod.name,
      version: mod.version,
      author: mod.author,
    };
    return mdata;
  } catch (err) {
    return "No mod.txt found";
  }
});

ipcMain.handle("open-mod-folder", async (event, operation) => {
  shell.openPath(operation);
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
  const path = operation.path;
  var modID = baseURL.split("https://modworkshop.net/mod/");
  modID = modID[1];
  console.log(modID);
  const { statusCode, body } = await request(
    `https://api.modworkshop.net/mods/${modID}/files`,
    {}
  );
  const data = (await body.json()) as ModAPIResponse;
  const downloadURL = data.data[0].download_url;
  const response = await request(downloadURL);
  const fileStream = fs.createWriteStream(path + "/mod.zip");
  await new Promise((resolve, reject) => {
    response.body.pipe(fileStream);
    fileStream.on("finish", resolve);
    fileStream.on("error", reject);
  });
  await new Promise((resolve, reject) => {
    const unzip = spawn("powershell", [
      "Expand-Archive",
      "-Force",
      "-Path",
      `"${path}/mod.zip"`,
      "-DestinationPath",
      `"${path}"`,
    ]);
    unzip.on("close", resolve);
    unzip.on("error", reject);
  });
  fs.unlinkSync(path + "/mod.zip");
  return "Downloaded";
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
  fs.writeFileSync(process.env.APPDATA+"/PD2MM/settings.txt", operation);
});