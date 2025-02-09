import { use, useEffect, useState } from 'react'
import './App.css'

function App() { //
  const [path, setPath] = useState('');
  const [modList, setModList] = useState([]);
  const [selected, setSelected] = useState(-1);
  const [selectedModData, setSelectedModData] = useState([]);
  const [modLink, setModLink] = useState('');
  useEffect(() => {
    window.electron.ipcRenderer.invoke('load-settings').then((path) => {
      if (path) {
        setPath(path);
      }
    });
  }, [])
  useEffect(() => {
    if (path !== 'C:\\mods') {
      window.electron.ipcRenderer.invoke('sync-settings', path);
      ListMods();
    }
  }, [path])

  useEffect(() => {
    if (selected !== -1) {
      window.electron.ipcRenderer.invoke('get-mod-data', path + "/mods/" + modList[selected]).then((data) => {
        setSelectedModData(data);
      });
    }
  }, [selected])

  async function SelectDir() {
    const exportPath = await window.electron.ipcRenderer.invoke('select-directory', 'export');
    setPath(exportPath);
    ListMods();
    return exportPath;
  }

  function GetAuthor() {
    if (selectedModData.author) {
      return selectedModData.author;
    }
    else {
      return 'No author found';
    }
  }
  function GetVersion() {
    if (selectedModData.version) {
      return selectedModData.version;
    }
    else {
      return 'No version found';
    }
  }
  function GetName() {
    if (selectedModData.name) {
      return selectedModData.name;
    }
    else {
      return modList[selected];
    }
  }
  async function DwButton() {
    await window.electron.ipcRenderer.invoke('download-mod', { url: modLink, path: path + "/mods/" })
    setModList(await window.electron.ipcRenderer.invoke('list-mods', path));
  }

  async function ListMods() {
    setModList(await window.electron.ipcRenderer.invoke('list-mods', path));
  }

  async function OpenFolder() {
    await window.electron.ipcRenderer.invoke('open-mod-folder', path + "/mods/" + modList[selected]);
  }
  return (<div className='root'>
    <div className="pathSelector">
      <input
        type="text"
        id="pathInput"
        className='pathInput'
        placeholder="Payday 2 path..."
        readOnly
        onClick={() => SelectDir()}
        value={path}
      />
    </div>
    <div className='content'>
      {modList.length > 0 ? (
        <>
          <div className="modList">
            {modList.map((modName, modID) => (
              <div className={`mod ${modID === selected ? 'selected' : ''}`} onClick={() => setSelected(modID)} key={modID}>
                <div className="modName">{modName}</div>
              </div>
            ))}
          </div>
          <div className="rightList">
            <div className="modInfo">
              {selected !== -1 && (
                <>
                  <p className='title'>{GetName()}</p>
                  <p>Author: {GetAuthor()}</p>
                  <p>Version: {GetVersion()}</p>
                  <button onClick={() => OpenFolder()}>Open Mod Folder</button>
                </>
              )}
            </div>
            <div className="modDownload">
              <input
                type="text"
                id="modlink"
                className='modlink'
                placeholder="Link to mod..."
                onChange={(e) => setModLink(e.target.value)}
                value={modLink}
              />
              <button onClick={() => DwButton()}>Download Mod</button>
            </div>
          </div>
        </>
      ) : (
        <div>Input path to Payday 2 Folder Above</div>
      )}
    </div>
  </div>
  )
}

export default App
