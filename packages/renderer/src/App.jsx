import { useEffect, useRef, useState } from 'react'
import './App.css'
import TitleBar from './TitleBar'

const MOD_REFRESH_INTERVAL_MS = 10000;

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

  const regularMods = modList.filter(mod => mod.type === 'mod' && mod.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const mapMods = modList.filter(mod => mod.type === 'map' && mod.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const modOverrides = modList.filter(mod => mod.type === 'override' && mod.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const enabledMods = modList.filter(mod => mod.enabled !== false).length;
  const configuredPath = path && path !== 'C:\\mods' ? path : 'No game folder selected';

  const getModInfo = {
    author: () => selectedModData.author || 'No author found',
    version: () => selectedModData.version || 'No version found',
    name: () => selectedModData.name || (modList[selected]?.name || 'Unknown'),
    image: () => selectedModData.image,
    color: () => selectedModData.color || modList[selected]?.color,
    type: () => modList[selected]?.type || 'mod',
    enabled: () => modList[selected]?.enabled !== false
  };

  const getSidebarItemStyle = (mod, isSelected) => {
    if (!mod?.color) {
      return undefined;
    }

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

  const handleDirectorySelect = async () => {
    const exportPath = await window.electron.ipcRenderer.invoke('select-directory', 'export');
    setPath(exportPath);
    listMods();
    return exportPath;
  };

  const downloadModFromUrl = async (url, successText) => {
    setIsDownloading(true);
    setErrorMessage('');
    setSuccessMessage('');
    setDownloadProgress({ status: 'starting', progress: 0, error: '' });

    const success = await window.electron.ipcRenderer.invoke('download-mod', {
      url,
      path: path
    });

    if (!success) {
      // Error message will be set by progress handler
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
  };

  const handleModDownload = async () => {
    await downloadModFromUrl(modLink, '✓ Mod installed successfully!');
  };

  const handleCheckForModUpdate = async () => {
    if (selected === -1 || !modList[selected]) {
      return;
    }

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
        basePath: path
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

      if (updateResult) {
        setSelected(-1);
      }
    } finally {
      setIsCheckingModUpdate(false);
    }
  };

  const handleCheckForAppUpdate = async () => {
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
        return;
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to check for app updates.');
    } finally {
      setIsCheckingAppUpdate(false);
    }
  };

  const handleDownloadAppUpdate = async () => {
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
  };

  const handleInstallAppUpdate = async () => {
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
  };

  const appUpdateStatusText = (() => {
    if (!appUpdateStatus) return null;

    switch (appUpdateStatus.status) {
      case 'checking':
        return 'Checking for updates...';
      case 'available':
        return `Update available${appUpdateStatus.version ? `: v${appUpdateStatus.version}` : ''}`;
      case 'not-available':
        return 'You have the latest version';
      case 'downloading':
        return `Downloading: ${Math.round(appUpdateStatus.progress || 0)}%`;
      case 'downloaded':
        return `Update ready to install${appUpdateStatus.version ? ` (v${appUpdateStatus.version})` : ''}`;
      case 'error':
        return `Error: ${appUpdateStatus.error}`;
      default:
        return null;
    }
  })();

  useEffect(() => {
    if (appUpdateStatusTimeoutRef.current) {
      clearTimeout(appUpdateStatusTimeoutRef.current);
      appUpdateStatusTimeoutRef.current = null;
    }

    if (!appUpdateStatus) {
      return;
    }

    const dismissAfterMs = (() => {
      switch (appUpdateStatus.status) {
        case 'available':
          return 60000;
        case 'downloaded':
          return 15000;
        case 'not-available':
          return 5000;
        case 'error':
          return 10000;
        default:
          return null;
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

  const notificationCards = [
    isDownloading
      ? {
          key: 'download-progress',
          tone: 'info',
          title: 'Downloading Mod',
          body:
            downloadProgress.status === 'fetching'
              ? 'Fetching mod information...'
              : downloadProgress.status === 'downloading'
                ? `Downloading... ${Math.round(downloadProgress.progress || 0)}%`
                : downloadProgress.status === 'extracting'
                  ? 'Extracting archive...'
                  : downloadProgress.status === 'installing'
                    ? 'Installing mod...'
                    : 'Preparing download...',
          progress: downloadProgress.progress,
        }
      : null,
    appUpdateStatusText && appUpdateStatus
      ? {
          key: 'app-update',
          tone:
            appUpdateStatus.status === 'error'
              ? 'danger'
              : appUpdateStatus.status === 'downloaded'
                ? 'success'
                : 'info',
          title: 'App Update',
          body: appUpdateStatusText,
          actions:
            appUpdateStatus.status === 'available'
              ? [{ label: 'Download', onClick: handleDownloadAppUpdate }]
              : appUpdateStatus.status === 'downloaded'
                ? [{ label: 'Install & Restart', onClick: handleInstallAppUpdate }]
                : appUpdateStatus.status === 'error' || appUpdateStatus.status === 'not-available'
                  ? [{ label: 'Check Again', onClick: handleCheckForAppUpdate }]
                  : [],
        }
      : null,
    successMessage
      ? {
          key: 'success',
          tone: 'success',
          title: 'Success',
          body: successMessage,
        }
      : null,
    errorMessage
      ? {
          key: 'error',
          tone: 'danger',
          title: 'Error',
          body: errorMessage,
        }
      : null,
  ].filter(Boolean);

  const handleLaunchGame = async () => {
    setIsLaunchingGame(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const result = await window.electron.ipcRenderer.invoke('launch-game', {
        basePath: path,
      });

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
      basePath: path
    });
  };

  const handleModToggle = async (mod, enabled) => {
    const result = await window.electron.ipcRenderer.invoke('toggle-mod-enabled', {
      name: mod.name,
      type: mod.type,
      enabled,
      basePath: path
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

    if (!toggleResult?.success || !toggleResult.mods) {
      return;
    }

    const nextSelectedIndex = toggleResult.mods.findIndex(
      (mod) => mod.name === currentMod.name && mod.type === currentMod.type
    );
    setSelected(nextSelectedIndex);
  };

  const handleRemoveMod = async () => {
    if (selected === -1) return;

    const modName = modList[selected].name;
    const confirmed = confirm(`Are you sure you want to remove "${modName}"?`);

    if (!confirmed) return;

    const result = await window.electron.ipcRenderer.invoke('remove-mod', {
      name: modList[selected].name,
      type: modList[selected].type,
      enabled: modList[selected].enabled,
      basePath: path
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

  const listMods = async () => {
    const mods = await window.electron.ipcRenderer.invoke('list-mods', path);
    setModList(mods);
    return mods;
  };

  useEffect(() => {
    pathRef.current = path;
  }, [path]);

  useEffect(() => {
    window.electron.ipcRenderer.invoke('load-settings').then((savedPath) => {
      if (savedPath) {
        setPath(savedPath);
      }
      setIsSettingsLoaded(true);
    });

    const handleUpdateStatus = (data) => {
      setAppUpdateStatus(data || null);
      setIsCheckingAppUpdate(data?.status === 'checking');

      if (data?.status === 'error') {
        setErrorMessage(data.error || 'Failed to check for app updates.');
      } else if (data?.status === 'available' || data?.status === 'not-available' || data?.status === 'downloaded') {
        setErrorMessage('');
      }
    };

    // Listen for download progress
    const handleDownloadProgress = (data) => {
      setDownloadProgress(data);
      if (data.status === 'error') {
        setErrorMessage(data.error || 'Download failed');
        setIsDownloading(false);
      }
    };

    // Listen for deep links (e.g., mws-pdmm://install/modid)
    const handleDeepLink = async (data) => {
      console.log('★★★ RENDERER: Deep link received:', data);
      console.trace('Deep link call stack');

      // Parse the deep link URL
      if (data.host === 'install' && data.pathname) {
        console.log('★★★ RENDERER: Processing install command');
        // Extract mod ID or URL from pathname (e.g., /modid or /https://example.com/mod.zip)
        const param = data.pathname.substring(1); // Remove leading slash
        console.log('★★★ RENDERER: Param:', param);

        if (param) {
          // If it starts with http, use it as the URL, otherwise treat it as mod ID
          const modUrl = param.startsWith('http') ? param : `https://modworkshop.net/mod/${param}`;
          console.log('★★★ RENDERER: Mod URL:', modUrl);
          setModLink(modUrl);

          // Check if path is set from settings
          const currentPath = pathRef.current;
          console.log('★★★ RENDERER: Current path:', currentPath);
          if (!currentPath || currentPath === 'C:/') {
            console.error('★★★ RENDERER: No game directory configured');
            setErrorMessage('⚠ Please select your Payday 2 directory first before using deep links!');
            setTimeout(() => setErrorMessage(''), 5000);
            return;
          }

          setSuccessMessage(`🔗 Deep link received! Starting download...`);
          console.log('★★★ RENDERER: Starting download to:', currentPath);

          // Automatically start the download
          setIsDownloading(true);
          setErrorMessage('');
          setDownloadProgress({ status: 'starting', progress: 0, error: '' });

          const success = await window.electron.ipcRenderer.invoke('download-mod', {
            url: modUrl,
            path: currentPath
          });

          console.log('★★★ RENDERER: Download result:', success);
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
      } else {
        console.log('★★★ RENDERER: Not an install command:', data);
      }
    };

    window.electron.ipcRenderer.on('download-progress', handleDownloadProgress);
    window.electron.ipcRenderer.on('update:status', handleUpdateStatus);
    window.electron.ipcRenderer.on('deep-link', handleDeepLink);

    console.log('★★★ RENDERER: Event listeners registered');

    window.electron.ipcRenderer.invoke('update:check').catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to check for app updates.');
    });

    // Cleanup listeners on unmount
    return () => {
      console.log('★★★ RENDERER: Cleaning up event listeners');
      window.electron.ipcRenderer.removeListener('download-progress', handleDownloadProgress);
      window.electron.ipcRenderer.removeListener('update:status', handleUpdateStatus);
      window.electron.ipcRenderer.removeListener('deep-link', handleDeepLink);
    };
  }, []);

  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(''), 10000); // 10 seconds for errors
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  useEffect(() => {
    if (!isSettingsLoaded) {
      return;
    }

    if (path !== 'C:\\mods') {
      window.electron.ipcRenderer.invoke('sync-settings', path);
      window.electron.ipcRenderer.invoke('list-mods', path).then(setModList);
    }
  }, [path, isSettingsLoaded]);

  useEffect(() => {
    if (!isSettingsLoaded || !path || path === 'C:\\mods') {
      return;
    }

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
        basePath: path
      }).then(setSelectedModData);
    }
  }, [selected, modList, path]);

  const renderModInfo = () => (
    selected !== -1 ? (
      <div className="modInfo">
        <div className="mod-info-header">
          {getModInfo.image() && (
            <img className="modImage" src={getModInfo.image()} alt={getModInfo.name()} />
          )}
          <div className="mod-info-details">
            <h2 className='title'>{getModInfo.name()}</h2>
            <div className="mod-type-badge">
              {getModInfo.type() === 'override' ? '📦 Mod Override' : getModInfo.type() === 'map' ? '🗺️ Map Mod' : '🔧 BLT/BeardLib Mod'}
              {getModInfo.enabled() ? '' : ' • Disabled'}
            </div>
            <div>
              <div className="info-label">Author</div>
              <div className="info-value">{getModInfo.author()}</div>
            </div>
            <div>
              <div className="info-label">Version</div>
              <div className="info-value">{getModInfo.version()}</div>
            </div>
          </div>
        </div>
        <div className="mod-info-body">
          <div className="mod-info-actions">
            <button
              className={`action-button ${getModInfo.enabled() ? 'secondary' : 'success'}`}
              onClick={handleSelectedModToggle}
            >
              {getModInfo.enabled() ? '⏸️ Disable Mod' : '▶️ Enable Mod'}
            </button>
            <button className="action-button success" onClick={handleOpenFolder}>
              📁 Open Mod Folder
            </button>
            <button
              className="action-button secondary"
              onClick={handleCheckForModUpdate}
              disabled={isDownloading || isCheckingModUpdate}
            >
              {isCheckingModUpdate ? '⏳ Checking...' : '🔄 Check for Updates'}
            </button>
            <button className="action-button danger" onClick={handleRemoveMod}>
              🗑️ Remove Mod
            </button>
          </div>
        </div>
      </div>
    ) : (
      <div className="noMods">
        <div className="noMods-icon">📦</div>
        <p>Select a mod to view details</p>
      </div>
    )
  );

  return (
    <div className='root'>
      {notificationCards.length > 0 && (
        <div className="notification-stack" aria-live="polite" aria-atomic="true">
          {notificationCards.map((notification) => (
            <div key={notification.key} className={`notification-toast notification-toast-${notification.tone}`}>
              <div className="notification-toast-header">
                <div className="notification-toast-title">{notification.title}</div>
                {notification.tone === 'info' && <div className="notification-toast-pill">Live</div>}
              </div>
              <div className="notification-toast-body">{notification.body}</div>
              {typeof notification.progress === 'number' && (
                <div className="notification-toast-progress">
                  <div className="notification-toast-progress-fill" style={{ width: `${Math.max(0, Math.min(100, notification.progress))}%` }} />
                </div>
              )}
              {Array.isArray(notification.actions) && notification.actions.length > 0 && (
                <div className="notification-toast-actions">
                  {notification.actions.map((action) => (
                    <button key={action.label} className="notification-toast-button" onClick={action.onClick}>
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <TitleBar />
      <div className="app-container">
        <div className="sidebar">
          <div className="sidebar-header">
            <div className="sidebar-header-copy">
              <span className="sidebar-eyebrow">Library</span>
              <span className="sidebar-title">Installed Mods</span>
            </div>
            <div className="sidebar-chip">{modList.length} loaded</div>
          </div>
          <div className="sidebar-section">
            <div className="searchContainer">
              <input
                type="text"
                className='searchInput'
                placeholder="Search mods..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {modList.length > 0 ? (
              <>
                    {regularMods.length > 0 && (
                  <>
                    <div className="sidebar-section-title">🔧 BLT/BeardLib Mods • {regularMods.length}</div>
                    <div className="modList">
                      {regularMods.map((mod) => {
                        const globalIndex = modList.indexOf(mod);
                        return (
                          <div
                            className={`mod ${globalIndex === selected ? 'selected' : ''} ${mod.enabled === false ? 'disabled' : ''}`}
                            style={getSidebarItemStyle(mod, globalIndex === selected)}
                            onClick={() => setSelected(globalIndex)}
                            key={globalIndex}
                          >
                            <div className={`modName ${mod.enabled === false ? 'disabled' : ''}`}>{mod.name}</div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                    {mapMods.length > 0 && (
                      <>
                        <div className="sidebar-section-title">🗺️ Map Mods • {mapMods.length}</div>
                        <div className="modList">
                          {mapMods.map((mod) => {
                            const index = modList.indexOf(mod);
                            return (
                              <div
                                key={index}
                                className={`mod ${index === selected ? 'selected' : ''} ${mod.enabled === false ? 'disabled' : ''}`}
                                style={getSidebarItemStyle(mod, index === selected)}
                                onClick={() => setSelected(index)}
                              >
                                <div className={`modName ${mod.enabled === false ? 'disabled' : ''}`}>
                                  <span className="mod-badge">🗺️</span>
                                  {mod.name}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}

                {modOverrides.length > 0 && (
                  <>
                    <div className="sidebar-section-title">📦 Mod Overrides • {modOverrides.length}</div>
                    <div className="modList">
                      {modOverrides.map((mod) => {
                        const globalIndex = modList.indexOf(mod);
                        return (
                          <div
                            className={`mod ${globalIndex === selected ? 'selected' : ''} ${mod.enabled === false ? 'disabled' : ''}`}
                            style={getSidebarItemStyle(mod, globalIndex === selected)}
                            onClick={() => setSelected(globalIndex)}
                            key={globalIndex}
                          >
                            <div className={`modName ${mod.enabled === false ? 'disabled' : ''}`}>
                              <span className="mod-badge">📦</span>
                              {mod.name}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="noMods">
                <div className="noMods-icon">📦</div>
                <p>No mods found</p>
                <p style={{ fontSize: '12px' }}>Select your Payday 2 folder via "Select Game Folder" in the header</p>
              </div>
            )}
          </div>
        </div>
        <div className="main-content">
          <div className="content-header">
            <div className="content-header-copy">
              <h1 className="content-title">PD2MM</h1>
            </div>
            <div className="content-header-actions">
              <button className="action-button header-action-button" onClick={handleDirectorySelect} title="Select Game Folder" aria-label="Select Game Folder">
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
            <div className="workspace-hero">
              <div className="workspace-hero-copy">
                <span className="workspace-hero-kicker">Current setup</span>
                <div className="workspace-hero-title">{configuredPath}</div>
                <div className="workspace-hero-subtitle">Use the downloader, then manage installs from the list below.</div>
              </div>
              <div className="workspace-hero-stats">
                <div className="hero-stat">
                  <span>Mods</span>
                  <strong>{modList.length}</strong>
                </div>
                <div className="hero-stat">
                  <span>Active</span>
                  <strong>{enabledMods}</strong>
                </div>
              </div>
            </div>
            <div className="modDownload">
              <div className="download-form">
                <div className="input-group">
                  <label className="input-label">Mod Download URL</label>
                  <input
                    type="text"
                    className='modlink'
                    placeholder="https://modworkshop.net/mod/..."
                    onChange={(e) => setModLink(e.target.value)}
                    value={modLink}
                    disabled={isDownloading}
                  />
                </div>
                <button
                  className="action-button"
                  onClick={handleModDownload}
                  disabled={isDownloading || !modLink}
                >
                  {isDownloading ? '⏳ Downloading...' : '⬇️ Download'}
                </button>
              </div>
            </div>
            {renderModInfo()}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
