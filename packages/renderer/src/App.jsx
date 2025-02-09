import { useEffect, useState } from 'react'
import './App.css'

function App() { //
  const [path, setPath] = useState('');
  const [modList, setModList] = useState([]);

  useEffect(() => {
    if (path === '') {
      LoadSettings()
    }
  }, [])

  async function LoadSettings() {
    const settings = await window.electron.ipcRenderer.invoke('load-settings', "./settings.json");
    console.log(settings);
    await setPath(settings.path);
    ListMods();
  }

  async function SelectDir() {
    const exportPath = await window.electron.ipcRenderer.invoke('select-directory', 'export');
    setPath(exportPath);
    ListMods();
  }
  async function ListMods() {
    setModList(await window.electron.ipcRenderer.invoke('list-mods', path));
  }
  return (
    <>
      <div className="modList">
        {modList.map((modName, modID) => (
          <div className="mod" key={modID}>
            <div className="modName">{modName}</div>
          </div>
        ))}
      </div>
      <div className="rightList">
        <div className="pathSelector">
          <label htmlFor="pathInput">Select Path:</label>
          <input
            type="text"
            id="pathInput"
            placeholder="Enter path..."
            readOnly
            onClick={() => SelectDir()}
            value={path}
          />
          <button onClick={() => ListMods()}></button>
        </div>
      </div>
    </>
  )
}

export default App
