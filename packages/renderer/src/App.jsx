import { use, useEffect, useState } from 'react'
import './App.css'
import TitleBar from './TitleBar'

function App() {
  const [path, setPath] = useState('');
  const [modList, setModList] = useState([]);
  const [selected, setSelected] = useState(-1);
  const [selectedModData, setSelectedModData] = useState({});
  const [modLink, setModLink] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [downloadProgress, setDownloadProgress] = useState({ status: '', progress: 0, error: '' });
  const [isDownloading, setIsDownloading] = useState(false);

  // Separate mods and overrides
  const regularMods = modList.filter(mod => mod.type === 'mod');
  const modOverrides = modList.filter(mod => mod.type === 'override');

  const getModInfo = {
    author: () => selectedModData.author || 'No author found',
    version: () => selectedModData.version || 'No version found',
    name: () => selectedModData.name || (modList[selected]?.name || 'Unknown'),
    image: () => selectedModData.image,
    type: () => modList[selected]?.type || 'mod'
  };
  
  const handleDirectorySelect = async () => {
    const exportPath = await window.electron.ipcRenderer.invoke('select-directory', 'export');
    setPath(exportPath);
    listMods();
    return exportPath;
  };

  const handleModDownload = async () => {
    setIsDownloading(true);
    setErrorMessage('');
    setSuccessMessage('');
    setDownloadProgress({ status: 'starting', progress: 0, error: '' });
    
    const success = await window.electron.ipcRenderer.invoke('download-mod', {
      url: modLink,
      path: path
    });

    if (!success) {
      // Error message will be set by progress handler
      setIsDownloading(false);
    } else {
      setSuccessMessage('✓ Mod installed successfully!');
      setModLink('');
      await listMods();
      setTimeout(() => {
        setIsDownloading(false);
        setDownloadProgress({ status: '', progress: 0, error: '' });
        setSuccessMessage('');
      }, 3000);
    }
  };

  const handleOpenFolder = () => {
    if (selected === -1) return;
    window.electron.ipcRenderer.invoke('open-mod-folder', {
      name: modList[selected].name,
      type: modList[selected].type,
      basePath: path
    });
  };

  const handleRemoveMod = async () => {
    if (selected === -1) return;
    
    const modName = modList[selected].name;
    const confirmed = confirm(`Are you sure you want to remove "${modName}"?`);
    
    if (!confirmed) return;
    
    const result = await window.electron.ipcRenderer.invoke('remove-mod', {
      name: modList[selected].name,
      type: modList[selected].type,
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
    setModList(await window.electron.ipcRenderer.invoke('list-mods', path));
  };

  useEffect(() => {
    window.electron.ipcRenderer.invoke('load-settings').then((savedPath) => {
      if (savedPath) setPath(savedPath);
    });
    
    // Listen for download progress
    const handleDownloadProgress = (data) => {
      setDownloadProgress(data);
      if (data.status === 'error') {
        setErrorMessage(data.error || 'Download failed');
        setIsDownloading(false);
      }
    };
    
    window.electron.ipcRenderer.on('download-progress', handleDownloadProgress);
  }, []);

  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(''), 10000); // 10 seconds for errors
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  useEffect(() => {
    if (path !== 'C:\\mods') {
      window.electron.ipcRenderer.invoke('sync-settings', path);
      listMods();
    }
  }, [path]);

  useEffect(() => {
    if (selected !== -1 && modList[selected]) {
      window.electron.ipcRenderer.invoke('get-mod-data', {
        name: modList[selected].name,
        type: modList[selected].type,
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
            <button className="action-button success" onClick={handleOpenFolder}>
              📁 Open Mod Folder
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
            <div className="pathSelector" onClick={handleDirectorySelect}>
              <input
                type="text"
                className='pathInput'
                placeholder="Select Payday 2 folder..."
                readOnly
                value={path || 'No folder selected'}
              />
            </div>
            {modList.length > 0 ? (
              <>
                {regularMods.length > 0 && (
                  <>
                    <div className="sidebar-section-title">🔧 BLT/BeardLib Mods • {regularMods.length}</div>
                    <div className="modList">
                      {regularMods.map((mod, idx) => {
                        const globalIndex = modList.indexOf(mod);
                        return (
                          <div
                            className={`mod ${globalIndex === selected ? 'selected' : ''}`}
                            onClick={() => setSelected(globalIndex)}
                            key={globalIndex}
                          >
                            <div className="modName">{mod.name}</div>
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
                      {modOverrides.map((mod, idx) => {
                        const globalIndex = modList.indexOf(mod);
                        return (
                          <div
                            className={`mod ${globalIndex === selected ? 'selected' : ''}`}
                            onClick={() => setSelected(globalIndex)}
                            key={globalIndex}
                          >
                            <div className="modName">
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
                <p style={{ fontSize: '12px' }}>Select your Payday 2 folder above</p>
              </div>
            )}
          </div>
        </div>
        <div className="main-content">
          <div className="content-header">
            <h3 className="section-title">Download Mod</h3>
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
