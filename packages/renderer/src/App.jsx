import { useEffect, useState } from 'react'
import './App.css'

function App() { //
  const [path, setPath] = useState('');
  const [modList, setModList] = useState([]);
  const [selected, setSelected] = useState(-1);
  const [selectedModData, setSelectedModData] = useState([]);
  useEffect(() => {
    if (path !== 'C:\\mods') {
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
      return 'Unknown';
    }
  }
  function GetVersion() {
    if (selectedModData.version) {
      return selectedModData.version;
    }
    else {
      return 'Incorrectly Formatted or Beardlib Mod';
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
                <div>
                  <h2>{GetName()}</h2>
                  <p>Author: {GetAuthor()}</p>
                  <p>Version: {GetVersion()}</p>
                  <button onClick={() => OpenFolder()}>Open Mod Folder</button>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div>No mods found</div>
      )}
    </div>
  </div>
  )
}

export default App
