import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import '../styles/mods.css';
import '../styles/context-menu.css';
import CollectionManager from './CollectionManager';

function ModList({
  modList, selected, onSelect, searchTerm, onSearchChange, getSidebarItemStyle,
  collections, activeCollectionId, onSaveCollection, onApplyCollection, onDeleteCollection,
  isApplyingCollection, onDeselectCollection,
}) {
  const [contextMenu, setContextMenu] = useState(null); // { x, y, mod, modIndex }
  const [pendingMods, setPendingMods] = useState(new Set()); // "type:name" keys
  const contextMenuRef = useRef(null);

  // Active collection mod keys for highlight
  const activeCollectionKeys = useMemo(() => {
    if (!activeCollectionId) return null;
    const col = collections.find((c) => c.id === activeCollectionId);
    if (!col) return null;
    return new Set(
      col.mods.filter((m) => m.enabled !== false).map((m) => `${m.type}:${m.name}`)
    );
  }, [activeCollectionId, collections]);

  const regularMods = modList.filter(
    (mod) => mod.type === 'mod' && mod.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const mapMods = modList.filter(
    (mod) => mod.type === 'map' && mod.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const modOverrides = modList.filter(
    (mod) => mod.type === 'override' && mod.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Close context menu on click-outside or Escape
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = (e) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target)) {
        setContextMenu(null);
      }
    };
    const handleKey = (e) => { if (e.key === 'Escape') setContextMenu(null); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [contextMenu]);

  const handleContextMenu = useCallback((e, mod, modIndex) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, mod, modIndex });
  }, []);

  const togglePending = useCallback((mod) => {
    const key = `${mod.type}:${mod.name}`;
    setPendingMods((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleAddToCollection = useCallback((col) => {
    setContextMenu(null);
    const mod = contextMenu?.mod;
    if (!mod) return;
    // If the mod exists in the collection but is disabled, flip it to enabled
    // If it doesn't exist at all, push it as enabled
    const existingIndex = col.mods.findIndex((m) => m.name === mod.name && m.type === mod.type);
    let newMods;
    if (existingIndex >= 0) {
      newMods = col.mods.map((m, i) => i === existingIndex ? { ...m, enabled: true } : m);
    } else {
      newMods = [...col.mods, { name: mod.name, type: mod.type, enabled: true }];
    }
    onSaveCollection({ ...col, mods: newMods }, true);
  }, [contextMenu, onSaveCollection]);

  const handleRemoveFromCollection = useCallback((col) => {
    setContextMenu(null);
    const mod = contextMenu?.mod;
    if (!mod) return;
    // Set enabled: false rather than removing — so apply-collection knows to disable it
    const newMods = col.mods.map((m) =>
      m.name === mod.name && m.type === mod.type ? { ...m, enabled: false } : m
    );
    onSaveCollection({ ...col, mods: newMods }, true);
  }, [contextMenu, onSaveCollection]);

  const handleStartCollectionFromMod = useCallback(() => {
    setContextMenu(null);
    if (!contextMenu?.mod) return;
    togglePending(contextMenu.mod);
  }, [contextMenu, togglePending]);

  const renderModItem = (mod, index) => {
    const key = `${mod.type}:${mod.name}`;
    const isInActiveCollection = activeCollectionKeys ? activeCollectionKeys.has(key) : null;
    const isPending = pendingMods.has(key);

    return (
      <div
        key={index}
        className={[
          'mod',
          index === selected ? 'selected' : '',
          mod.enabled === false ? 'disabled' : '',
          isInActiveCollection === true ? 'in-collection' : '',
          isInActiveCollection === false ? 'not-in-collection' : '',
          isPending ? 'is-pending' : '',
        ].filter(Boolean).join(' ')}
        style={getSidebarItemStyle(mod, index === selected)}
        onClick={() => onSelect(index)}
        onContextMenu={(e) => handleContextMenu(e, mod, index)}
      >
        <div className={`modName ${mod.enabled === false ? 'disabled' : ''}`}>
          {mod.type !== 'mod' && (
            <span className="mod-badge">{mod.type === 'map' ? '🗺️' : '📦'}</span>
          )}
          {mod.name}
        </div>
        {isPending && <span className="mod-pending-dot" title="Selected for new collection" />}
        {isInActiveCollection === true && !isPending && (
          <span className="mod-collection-dot" title="In active collection" />
        )}
      </div>
    );
  };

  // Build context menu content
  const renderContextMenu = () => {
    if (!contextMenu) return null;
    const { x, y, mod } = contextMenu;
    const modKey = `${mod.type}:${mod.name}`;
    const isPending = pendingMods.has(modKey);

    // Estimate menu height for vertical clamping
    const itemHeight = 33;
    const headerHeight = 36;
    const dividerHeight = 7;
    const labelHeight = 22;
    let estimatedHeight = headerHeight + dividerHeight + itemHeight + 8;
    if (collections.length > 0) {
      estimatedHeight += dividerHeight + labelHeight + collections.length * itemHeight;
    }

    // Clamp to viewport
    const menuWidth = 220;
    const margin = 8;
    const clampedX = Math.min(x, window.innerWidth - menuWidth - margin);
    const clampedY = y + estimatedHeight > window.innerHeight - margin
      ? Math.max(margin, y - estimatedHeight)
      : y;

    return (
      <div
        ref={contextMenuRef}
        className="ctx-menu"
        style={{ left: clampedX, top: clampedY }}
      >
        <div className="ctx-menu-header">
          <span className="ctx-menu-mod-name">{mod.name}</span>
        </div>

        <div className="ctx-menu-divider" />

        {/* Toggle pending selection */}
        <button
          className="ctx-menu-item"
          onClick={() => { togglePending(mod); setContextMenu(null); }}
        >
          {isPending ? '☑ Deselect for collection' : '☐ Select for collection'}
        </button>

        {/* Add to existing collections */}
        {collections.length > 0 && (
          <>
            <div className="ctx-menu-divider" />
            <div className="ctx-menu-label">Add / remove from collection</div>
            {collections.map((col) => {
              const inCol = col.mods.some((m) => m.name === mod.name && m.type === mod.type && m.enabled !== false);
              return (
                <button
                  key={col.id}
                  className={`ctx-menu-item ${inCol ? 'ctx-item-remove' : ''}`}
                  onClick={() => inCol ? handleRemoveFromCollection(col) : handleAddToCollection(col)}
                >
                  {inCol ? `✕ Remove from "${col.name}"` : `+ Add to "${col.name}"`}
                </button>
              );
            })}
          </>
        )}
      </div>
    );
  };

  return (
    <><div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-header-copy">
          <div className="collection-manager-wrapper">
            <CollectionManager
              collections={collections}
              activeCollectionId={activeCollectionId}
              modList={modList}
              onSaveCollection={onSaveCollection}
              onApplyCollection={onApplyCollection}
              onDeleteCollection={onDeleteCollection}
              isApplying={isApplyingCollection}
              pendingMods={pendingMods}
              onClearPending={() => setPendingMods(new Set())}
              onDeselectCollection={onDeselectCollection}
              className="collection-manager"
            />
          </div>
        </div>
      </div>

      <div className="sidebar-section">
        <div className="searchContainer">
          <input
            type="text"
            className="searchInput"
            placeholder="Search mods..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>


        {modList.length > 0 ? (
          <>
            {regularMods.length > 0 && (
              <>
                <div className="sidebar-section-title">
                  🔧 BLT/BeardLib Mods • {regularMods.length}
                </div>
                <div className="modList">
                  {regularMods.map((mod) => renderModItem(mod, modList.indexOf(mod)))}
                </div>
              </>
            )}

            {mapMods.length > 0 && (
              <>
                <div className="sidebar-section-title">🗺️ Map Mods • {mapMods.length}</div>
                <div className="modList">
                  {mapMods.map((mod) => renderModItem(mod, modList.indexOf(mod)))}
                </div>
              </>
            )}

            {modOverrides.length > 0 && (
              <>
                <div className="sidebar-section-title">
                  📦 Mod Overrides • {modOverrides.length}
                </div>
                <div className="modList">
                  {modOverrides.map((mod) => renderModItem(mod, modList.indexOf(mod)))}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="noMods">
            <div className="noMods-icon">📦</div>
            <p>No mods found</p>
            <p style={{ fontSize: '12px' }}>
              Select your Payday 2 folder via "Select Game Folder" in the header
            </p>
          </div>
        )}
      </div>

      </div>
      {renderContextMenu()}
    </>
  );
}

export default ModList;
