import { useEffect, useRef, useState, useMemo, useCallback } from 'react';

// Styles
import './styles/variables.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/mods.css';
import './styles/notifications.css';
import './styles/workspace.css';

// Components
import TitleBar from './TitleBar';
import NotificationStack from './components/NotificationStack';
import ModList from './components/ModList';
import ModInfo from './components/ModInfo';
import WorkspaceHero from './components/WorkspaceHero';
import ModDownloader from './components/ModDownloader';

const MOD_REFRESH_INTERVAL_MS = 30000;

function App() {
  const [path, setPath] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [modList, setModList] = useState([]);
  const [selected, setSelected] = useState(-1);
  const [selectedModData, setSelectedModData] = useState({});
  const [modLink, setModLink] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [downloadProgress, setDownloadProgress] = useState({ status: '', progress: 0, error: '' });
  const [isDownloading, setIsDownloading] = useState(false);
  const [isCheckingModUpdate, setIsCheckingModUpdate] = useState(false);
  const [isCheckingAppUpdate, setIsCheckingAppUpdate] = useState(false);
  const [appUpdateStatus, setAppUpdateStatus] = useState(null);
  const [isLaunchingGame, setIsLaunchingGame] = useState(false);
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);

  const pathRef = useRef(path);
  const appUpdateStatusTimeoutRef = useRef(null);

  const enabledMods = useMemo(
    () => modList.filter((mod) => mod.enabled !== false).length,
    [modList]
  );

  const configuredPath = useMemo(
    () => (path && path !== 'C:\\mods' ? path : 'No game folder selected'),
    [path]
  );

  const getSidebarItemStyle = (mod, isSelected) => {
    if (!mod?.color) return undefined;
    const fillOpacity = isSelected ? 0.18 : 0.12;
    const tintOpacity = isSelected ? 0.14 : 0.08;
    return {
      backgroundColor: `color-mix(in srgb, ${mod.color} ${Math.round(fillOpacity * 100)}%, rgba(255, 255, 255, ${isSelected ? 0.07 : 0.03}))`,
      backgroundImage: `linear-gradient(90deg, color-mix(in srgb, ${mod.color} ${Math.round(tintOpacity * 100)}%, transparent), rgba(255, 255, 255, 0.01))`,
      border: `1px solid color-mix(in srgb, ${mod.color} 20%, rgba(255, 255, 255, 0.12))`,
      boxShadow: isSelected
        ? `0 0 0 1px color-mix(in srgb, ${mod.color} 30%, transparent)`
        : `inset 0 0 0 1px color-mix(in srgb, ${mod.color} 8%, transparent)`,
    };
  };

  const listMods = useCallback(async () => {
    const mods = await window.electron.ipcRenderer.invoke('list-mods', path);
    setModList(mods);
    return mods;
  }, [path]);

  const handleDirectorySelect = useCallback(async () => {
    const exportPath = await window.electron.ipcRenderer.invoke('select-directory', 'export');
    setPath(exportPath);
    listMods();
    return exportPath;
  }, [listMods]);

  const downloadModFromUrl = useCallback(async (url, successText) => {
    setIsDownloading(true);
    setErrorMessage('');
    setSuccessMessage('');
    setDownloadProgress({ status: 'starting', progress: 0, error: '' });

    const success = await window.electron.ipcRenderer.invoke('download-mod', { url, path });

    if (!success) {
      setIsDownloading(false);
      return false;
    }

    setSuccessMessage(successText);
    setModLink('');
    await listMods();
    setTimeout(() => {
      setIsDownloading(false);
      setDownloadProgress({ status: '', progress: 0, error: '' });
      setSuccessMessage('');
    }, 3000);

    return true;
  }, [listMods, path]);

  const handleModDownload = useCallback(async () => {
    await downloadModFromUrl(modLink, '✓ Mod installed successfully!');
  }, [downloadModFromUrl, modLink]);

  const handleCheckForModUpdate = useCallback(async () => {
    if (selected === -1 || !modList[selected]) return;
    if (!path || path === 'C:/') {
      setErrorMessage('Please select your Payday 2 directory first.');
      return;
    }

    const mod = modList[selected];
    setIsCheckingModUpdate(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const checkResult = await window.electron.ipcRenderer.invoke('check-mod-update', {
        name: mod.name,
        type: mod.type,
        enabled: mod.enabled,
        basePath: path,
      });

      if (!checkResult?.success) {
        setErrorMessage(`Failed to check for updates: ${checkResult?.error || 'Unknown error'}`);
        return;
      }

      if (!checkResult.supported) {
        setErrorMessage(checkResult.message || 'This mod does not have update metadata.');
        return;
      }

      if (!checkResult.hasUpdate) {
        setSuccessMessage(`✓ ${mod.name} is up to date (${checkResult.currentVersion || 'Unknown'})`);
        setTimeout(() => setSuccessMessage(''), 3000);
        return;
      }

      const updateResult = await downloadModFromUrl(
        checkResult.modUrl,
        `✓ Updated ${mod.name} (${checkResult.currentVersion || 'Unknown'} → ${checkResult.latestVersion || 'Unknown'})`
      );

      if (updateResult) setSelected(-1);
    } finally {
      setIsCheckingModUpdate(false);
    }
  }, [selected, modList, path, downloadModFromUrl]);

  const handleCheckForAppUpdate = useCallback(async () => {
    setIsCheckingAppUpdate(true);
    setErrorMessage('');
    setAppUpdateStatus({ status: 'checking' });

    try {
      const result = await window.electron.ipcRenderer.invoke('update:check');
      if (!result?.success) {
        const failureMessage = result?.message || 'Failed to check for app updates.';
        if (result?.skipped) {
          setAppUpdateStatus(null);
          setSuccessMessage(`ℹ️ ${failureMessage}`);
          setTimeout(() => setSuccessMessage(''), 4000);
          return;
        }
        setErrorMessage(failureMessage);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to check for app updates.');
    } finally {
      setIsCheckingAppUpdate(false);
    }
  }, []);

  const handleDownloadAppUpdate = useCallback(async () => {
    setErrorMessage('');
    try {
      const result = await window.electron.ipcRenderer.invoke('update:download');
      if (!result?.success) {
        const failureMessage = result?.message || 'Failed to download the app update.';
        if (result?.skipped) {
          setSuccessMessage(`ℹ️ ${failureMessage}`);
          setTimeout(() => setSuccessMessage(''), 4000);
          return;
        }
        setErrorMessage(failureMessage);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to download the app update.');
    }
  }, []);

  const handleInstallAppUpdate = useCallback(async () => {
    setErrorMessage('');
    try {
      const result = await window.electron.ipcRenderer.invoke('update:install');
      if (!result?.success) {
        const failureMessage = result?.message || 'Failed to install the app update.';
        if (result?.skipped) {
          setSuccessMessage(`ℹ️ ${failureMessage}`);
          setTimeout(() => setSuccessMessage(''), 4000);
          return;
        }
        setErrorMessage(failureMessage);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to install the app update.');
    }
  }, []);

  const appUpdateStatusText = (() => {
    if (!appUpdateStatus) return null;
    switch (appUpdateStatus.status) {
      case 'checking': return 'Checking for updates...';
      case 'available': return `Update available${appUpdateStatus.version ? `: v${appUpdateStatus.version}` : ''}`;
      case 'not-available': return 'You have the latest version';
      case 'downloading': return `Downloading: ${Math.round(appUpdateStatus.progress || 0)}%`;
      case 'downloaded': return `Update ready to install${appUpdateStatus.version ? ` (v${appUpdateStatus.version})` : ''}`;
      case 'error': return `Error: ${appUpdateStatus.error}`;
      default: return null;
    }
  })();

  const handleLaunchGame = async () => {
    setIsLaunchingGame(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const result = await window.electron.ipcRenderer.invoke('launch-game', { basePath: path });
      if (!result?.success) {
        setErrorMessage(result?.error || 'Failed to launch PAYDAY 2.');
        return;
      }
      setSuccessMessage('🚀 Launching PAYDAY 2...');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to launch PAYDAY 2.');
    } finally {
      setIsLaunchingGame(false);
    }
  };

  const handleOpenFolder = () => {
    if (selected === -1) return;
    window.electron.ipcRenderer.invoke('open-mod-folder', {
      name: modList[selected].name,
      type: modList[selected].type,
      enabled: modList[selected].enabled,
      basePath: path,
    });
  };

  const handleModToggle = async (mod, enabled) => {
    const result = await window.electron.ipcRenderer.invoke('toggle-mod-enabled', {
      name: mod.name,
      type: mod.type,
      enabled,
      basePath: path,
    });

    if (result?.success) {
      setSuccessMessage(`✓ Mod "${mod.name}" ${enabled ? 'enabled' : 'disabled'}!`);
      setErrorMessage('');
      const updatedMods = await listMods();
      setTimeout(() => setSuccessMessage(''), 3000);
      return { success: true, mods: updatedMods };
    }

    setErrorMessage(`Failed to ${enabled ? 'enable' : 'disable'} mod: ${result?.error || 'Unknown error'}`);
    return { success: false, mods: null };
  };

  const handleSelectedModToggle = async () => {
    if (selected === -1 || !modList[selected]) return;
    const currentMod = modList[selected];
    const targetEnabled = currentMod.enabled === false;
    const toggleResult = await handleModToggle(currentMod, targetEnabled);
    if (!toggleResult?.success || !toggleResult.mods) return;
    const nextSelectedIndex = toggleResult.mods.findIndex(
      (mod) => mod.name === currentMod.name && mod.type === currentMod.type
    );
    setSelected(nextSelectedIndex);
  };

  const handleRemoveMod = async () => {
    if (selected === -1) return;
    const modName = modList[selected].name;
    if (!confirm(`Are you sure you want to remove "${modName}"?`)) return;

    const result = await window.electron.ipcRenderer.invoke('remove-mod', {
      name: modList[selected].name,
      type: modList[selected].type,
      enabled: modList[selected].enabled,
      basePath: path,
    });

    if (result.success) {
      setSuccessMessage(`✓ Mod "${modName}" removed successfully!`);
      setSelected(-1);
      await listMods();
      setTimeout(() => setSuccessMessage(''), 3000);
    } else {
      setErrorMessage(`Failed to remove mod: ${result.error}`);
    }
  };

  const notificationCards = useMemo(() => [
    isDownloading ? {
      key: 'download-progress',
      tone: 'info',
      title: 'Downloading Mod',
      body: downloadProgress.status === 'fetching' ? 'Fetching mod information...'
        : downloadProgress.status === 'downloading' ? `Downloading... ${Math.round(downloadProgress.progress || 0)}%`
        : downloadProgress.status === 'extracting' ? 'Extracting archive...'
        : downloadProgress.status === 'installing' ? 'Installing mod...'
        : 'Preparing download...',
      progress: downloadProgress.progress,
    } : null,
    appUpdateStatusText && appUpdateStatus ? {
      key: 'app-update',
      tone: appUpdateStatus.status === 'error' ? 'danger' : appUpdateStatus.status === 'downloaded' ? 'success' : 'info',
      title: 'App Update',
      body: appUpdateStatusText,
      actions: appUpdateStatus.status === 'available' ? [{ label: 'Download', onClick: handleDownloadAppUpdate }]
        : appUpdateStatus.status === 'downloaded' ? [{ label: 'Install & Restart', onClick: handleInstallAppUpdate }]
        : (appUpdateStatus.status === 'error' || appUpdateStatus.status === 'not-available') ? [{ label: 'Check Again', onClick: handleCheckForAppUpdate }]
        : [],
    } : null,
    successMessage ? { key: 'success', tone: 'success', title: 'Success', body: successMessage } : null,
    errorMessage ? { key: 'error', tone: 'danger', title: 'Error', body: errorMessage } : null,
  ].filter(Boolean), [isDownloading, downloadProgress, appUpdateStatus, appUpdateStatusText, successMessage, errorMessage, handleDownloadAppUpdate, handleInstallAppUpdate, handleCheckForAppUpdate]);

  useEffect(() => { pathRef.current = path; }, [path]);

  useEffect(() => {
    if (appUpdateStatusTimeoutRef.current) {
      clearTimeout(appUpdateStatusTimeoutRef.current);
      appUpdateStatusTimeoutRef.current = null;
    }
    if (!appUpdateStatus) return;

    const dismissAfterMs = (() => {
      switch (appUpdateStatus.status) {
        case 'available': return 60000;
        case 'downloaded': return 15000;
        case 'not-available': return 5000;
        case 'error': return 10000;
        default: return null;
      }
    })();

    if (dismissAfterMs) {
      appUpdateStatusTimeoutRef.current = setTimeout(() => {
        setAppUpdateStatus(null);
        appUpdateStatusTimeoutRef.current = null;
      }, dismissAfterMs);
    }

    return () => {
      if (appUpdateStatusTimeoutRef.current) {
        clearTimeout(appUpdateStatusTimeoutRef.current);
        appUpdateStatusTimeoutRef.current = null;
      }
    };
  }, [appUpdateStatus]);

  useEffect(() => {
    window.electron.ipcRenderer.invoke('load-settings').then((savedPath) => {
      if (savedPath) setPath(savedPath);
      setIsSettingsLoaded(true);
    });

    const handleUpdateStatus = (data) => {
      setAppUpdateStatus(data || null);
      setIsCheckingAppUpdate(data?.status === 'checking');
      if (data?.status === 'error') {
        setErrorMessage(data.error || 'Failed to check for app updates.');
      } else if (['available', 'not-available', 'downloaded'].includes(data?.status)) {
        setErrorMessage('');
      }
    };

    const handleDownloadProgress = (data) => {
      setDownloadProgress(data);
      if (data.status === 'error') {
        setErrorMessage(data.error || 'Download failed');
        setIsDownloading(false);
      }
    };

    const handleDeepLink = async (data) => {
      console.log('★★★ RENDERER: Deep link received:', data);
      if (data.host === 'install' && data.pathname) {
        const param = data.pathname.substring(1);
        if (param) {
          const modUrl = param.startsWith('http') ? param : `https://modworkshop.net/mod/${param}`;
          setModLink(modUrl);

          const currentPath = pathRef.current;
          if (!currentPath || currentPath === 'C:/') {
            setErrorMessage('⚠ Please select your Payday 2 directory first before using deep links!');
            setTimeout(() => setErrorMessage(''), 5000);
            return;
          }

          setSuccessMessage('🔗 Deep link received! Starting download...');
          setIsDownloading(true);
          setErrorMessage('');
          setDownloadProgress({ status: 'starting', progress: 0, error: '' });

          const success = await window.electron.ipcRenderer.invoke('download-mod', {
            url: modUrl,
            path: currentPath,
          });

          if (!success) {
            setIsDownloading(false);
          } else {
            setSuccessMessage('✓ Mod installed successfully via deep link!');
            setModLink('');
            const mods = await window.electron.ipcRenderer.invoke('list-mods', currentPath);
            setModList(mods);
            setTimeout(() => {
              setIsDownloading(false);
              setDownloadProgress({ status: '', progress: 0, error: '' });
              setSuccessMessage('');
            }, 3000);
          }
        }
      }
    };

    window.electron.ipcRenderer.on('download-progress', handleDownloadProgress);
    window.electron.ipcRenderer.on('update:status', handleUpdateStatus);
    window.electron.ipcRenderer.on('deep-link', handleDeepLink);

    window.electron.ipcRenderer.invoke('update:check').catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to check for app updates.');
    });

    return () => {
      window.electron.ipcRenderer.removeListener('download-progress', handleDownloadProgress);
      window.electron.ipcRenderer.removeListener('update:status', handleUpdateStatus);
      window.electron.ipcRenderer.removeListener('deep-link', handleDeepLink);
    };
  }, []);

  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(''), 10000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  useEffect(() => {
    if (!isSettingsLoaded) return;
    if (path !== 'C:\\mods') {
      window.electron.ipcRenderer.invoke('sync-settings', path);
      window.electron.ipcRenderer.invoke('list-mods', path).then(setModList);
    }
  }, [path, isSettingsLoaded]);

  useEffect(() => {
    if (!isSettingsLoaded || !path || path === 'C:\\mods') return;
    const timer = setInterval(() => {
      window.electron.ipcRenderer.invoke('list-mods', path).then(setModList);
    }, MOD_REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [path, isSettingsLoaded]);

  useEffect(() => {
    if (selected !== -1 && modList[selected]) {
      window.electron.ipcRenderer.invoke('get-mod-data', {
        name: modList[selected].name,
        type: modList[selected].type,
        enabled: modList[selected].enabled,
        basePath: path,
      }).then(setSelectedModData);
    }
  }, [selected, modList, path]);

  return (
    <div className="root">
      <NotificationStack notifications={notificationCards} />

      <TitleBar />

      <div className="app-container">
        <ModList
          modList={modList}
          selected={selected}
          onSelect={setSelected}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          getSidebarItemStyle={getSidebarItemStyle}
        />

        <div className="main-content">
          <div className="content-header">
            <div className="content-header-copy">
              <h1 className="content-title">PD2MM</h1>
            </div>
            <div className="content-header-actions">
              <button
                className="action-button header-action-button"
                onClick={handleDirectorySelect}
                title="Select Game Folder"
                aria-label="Select Game Folder"
              >
                📁
              </button>
              <button
                className="action-button success header-action-button"
                onClick={handleLaunchGame}
                disabled={isLaunchingGame}
                title="Launch Game"
                aria-label="Launch Game"
              >
                {isLaunchingGame ? '⏳' : '🚀'}
              </button>
              <button
                className="action-button secondary header-action-button"
                onClick={handleCheckForAppUpdate}
                disabled={isCheckingAppUpdate}
                title="Check App Update"
                aria-label="Check App Update"
              >
                {isCheckingAppUpdate ? '⏳' : '⬆️'}
              </button>
            </div>
          </div>

          <div className="content-body">
            <WorkspaceHero
              configuredPath={configuredPath}
              totalMods={modList.length}
              enabledMods={enabledMods}
            />

            <ModDownloader
              modLink={modLink}
              onLinkChange={setModLink}
              onDownload={handleModDownload}
              isDownloading={isDownloading}
            />

            <ModInfo
              modList={modList}
              selected={selected}
              selectedModData={selectedModData}
              isDownloading={isDownloading}
              isCheckingModUpdate={isCheckingModUpdate}
              onToggle={handleSelectedModToggle}
              onOpenFolder={handleOpenFolder}
              onCheckUpdate={handleCheckForModUpdate}
              onRemove={handleRemoveMod}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
