import { useEffect, useState } from 'react'
import './App.css'

function App() {
  const [path, setPath] = useState('');
  const [modList, setModList] = useState([]);
  const [selected, setSelected] = useState(-1);
  const [selectedModData, setSelectedModData] = useState([]);
  const [modLink, setModLink] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const getModInfo = {
    author: () => selectedModData.author || 'No author found',
    version: () => selectedModData.version || 'No version found',
    name: () => selectedModData.name || modList[selected]
  };

  const handleDirectorySelect = async () => {
    const exportPath = await window.electron.ipcRenderer.invoke('select-directory', 'export');
    setPath(exportPath);
    listMods();
    return exportPath;
  };

  const handleModDownload = async () => {
    const success = await window.electron.ipcRenderer.invoke('download-mod', {
      url: modLink,
      path: `${path}/mods/`
    });

    if (!success) {
      setErrorMessage('Failed to download mod');
    }
    setModList(await window.electron.ipcRenderer.invoke('list-mods', path));
  };

  const handleOpenFolder = () => {
    window.electron.ipcRenderer.invoke('open-mod-folder', `${path}/mods/${modList[selected]}`);
  };

  const listMods = async () => {
    setModList(await window.electron.ipcRenderer.invoke('list-mods', path));
  };

  useEffect(() => {
    window.electron.ipcRenderer.invoke('load-settings').then((savedPath) => {
      if (savedPath) setPath(savedPath);
    });
  }, []);

  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(''), 5000);
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
    if (selected !== -1) {
      window.electron.ipcRenderer.invoke('get-mod-data', `${path}/mods/${modList[selected]}`)
        .then(setSelectedModData);
    }
  }, [selected]);

  const renderModInfo = () => (
    selected !== -1 && (
      <>
        <p className='title'>{getModInfo.name()}</p>
        <p>Author: {getModInfo.author()}</p>
        <p>Version: {getModInfo.version()}</p>
        <button onClick={handleOpenFolder}>Open Mod Folder</button>
      </>
    )
  );

  return (
    <div className='root'>
      <div className="pathSelector">
        <input
          type="text"
          className='pathInput'
          placeholder="Payday 2 path..."
          readOnly
          onClick={handleDirectorySelect}
          value={path}
        />
      </div>
      <div className='content'>
        {modList.length > 0 ? (
          <>
            <div className="modList">
              {modList.map((modName, modID) => (
                <div
                  className={`mod ${modID === selected ? 'selected' : ''}`}
                  onClick={() => setSelected(modID)}
                  key={modID}
                >
                  <div className="modName">{modName}</div>
                </div>
              ))}
            </div>
            <div className="rightList">
              <div className="modDownload">
                <div className="bigpart">
                  <input
                    type="text"
                    className='modlink'
                    placeholder="Link to mod..."
                    onChange={(e) => setModLink(e.target.value)}
                    value={modLink}
                  />
                  <button onClick={handleModDownload}>Download Mod</button>
                </div>
                <div className="errorMsg">{errorMessage}</div>
              </div>
              <div className="modInfo">{renderModInfo()}</div>
            </div>
          </>
        ) : (
          <div className="noMods">
            <p>No mods found</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
