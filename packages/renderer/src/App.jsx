import { useEffect, useRef, useState } from 'react'
import './App.css'
import TitleBar from './TitleBar'

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
  const [isLaunchingGame, setIsLaunchingGame] = useState(false);
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);
  const pathRef = useRef(path);

  const regularMods = modList.filter(mod => mod.type === 'mod' && mod.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const modOverrides = modList.filter(mod => mod.type === 'override' && mod.name.toLowerCase().includes(searchTerm.toLowerCase()));

  const getModInfo = {
    author: () => selectedModData.author || 'No author found',
    version: () => selectedModData.version || 'No version found',
    name: () => selectedModData.name || (modList[selected]?.name || 'Unknown'),
    image: () => selectedModData.image,
    type: () => modList[selected]?.type || 'mod',
    enabled: () => modList[selected]?.enabled !== false
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
    setSuccessMessage('');

    try {
      const result = await window.electron.ipcRenderer.invoke('check-app-update');

      if (!result?.success) {
        const failureMessage = result?.message || 'Failed to check for app updates.';
        if (result?.skipped) {
          setSuccessMessage(`ℹ️ ${failureMessage}`);
          setTimeout(() => setSuccessMessage(''), 4000);
          return;
        }

        setErrorMessage(failureMessage);
        return;
      }

      if (result?.hasUpdate) {
        setSuccessMessage(`⬆️ Update available${result?.version ? `: ${result.version}` : ''}`);
      } else {
        setSuccessMessage('✓ App is up to date');
      }

      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to check for app updates.');
    } finally {
      setIsCheckingAppUpdate(false);
    }
  };

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
    window.electron.ipcRenderer.on('deep-link', handleDeepLink);

    console.log('★★★ RENDERER: Event listeners registered');

    // Cleanup listeners on unmount
    return () => {
      console.log('★★★ RENDERER: Cleaning up event listeners');
      window.electron.ipcRenderer.removeListener('download-progress', handleDownloadProgress);
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
              {getModInfo.type() === 'override' ? '📦 Mod Override' : '🔧 BLT/BeardLib Mod'}
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
      <TitleBar />
      <div className="app-container">
        <div className="sidebar">
          <div className="sidebar-header">
            <span>🎮</span>
            <span>Installed Mods</span>
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

                {modOverrides.length > 0 && (
                  <>
                    <div className="sidebar-section-title">📦 Mod Overrides • {modOverrides.length}</div>
                    <div className="modList">
                      {modOverrides.map((mod) => {
                        const globalIndex = modList.indexOf(mod);
                        return (
                          <div
                            className={`mod ${globalIndex === selected ? 'selected' : ''} ${mod.enabled === false ? 'disabled' : ''}`}
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
            <h3 className="section-title">Download Mod</h3>
            <div className="content-header-actions">
              <button className="action-button" onClick={handleDirectorySelect}>
                📁 Select Game Folder
              </button>
              <button
                className="action-button success"
                onClick={handleLaunchGame}
                disabled={isLaunchingGame}
              >
                {isLaunchingGame ? '⏳ Launching...' : '▶️ Launch Game'}
              </button>
              <button
                className="action-button secondary"
                onClick={handleCheckForAppUpdate}
                disabled={isCheckingAppUpdate}
              >
                {isCheckingAppUpdate ? '⏳ Checking App Update...' : '🔄 Check App Update'}
              </button>
            </div>
          </div>
          <div className="content-body">
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
              {isDownloading && (
                <div className="progress-container">
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${downloadProgress.progress}%` }}
                    ></div>
                  </div>
                  <div className="progress-text">
                    {downloadProgress.status === 'fetching' && 'Fetching mod information...'}
                    {downloadProgress.status === 'downloading' && `Downloading... ${downloadProgress.progress}%`}
                    {downloadProgress.status === 'extracting' && 'Extracting archive...'}
                    {downloadProgress.status === 'installing' && 'Installing mod...'}
                    {downloadProgress.status === 'complete' && '✅ Complete!'}
                  </div>
                </div>
              )}
              {successMessage && <div className="successMsg">{successMessage}</div>}
              {errorMessage && <div className="errorMsg">{errorMessage}</div>}
            </div>
            {renderModInfo()}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
