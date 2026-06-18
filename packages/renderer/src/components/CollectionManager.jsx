import { useState, useRef, useEffect } from 'react';
import '../styles/collections.css';

function CollectionManager({
  collections,
  activeCollectionId,
  modList,
  onSaveCollection,
  onApplyCollection,
  onDeleteCollection,
  isApplying,
  pendingMods,
  onClearPending,
  onDeselectCollection,
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  // 'idle' | 'naming-pending' | 'naming-current'
  const [namingMode, setNamingMode] = useState('idle');
  const [newCollectionName, setNewCollectionName] = useState('');
  const inputRef = useRef(null);

  const activeCollection = collections.find((c) => c.id === activeCollectionId) || null;
  const hasPending = pendingMods && pendingMods.size > 0;

  // Focus the input whenever we enter a naming mode
  useEffect(() => {
    if (namingMode !== 'idle' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [namingMode]);

  const cancelNaming = () => {
    setNamingMode('idle');
    setNewCollectionName('');
  };

  const commitCollection = () => {
    const name = newCollectionName.trim();
    if (!name) return;

    if (namingMode === 'naming-pending') {
      const newCollection = {
        id: `collection_${Date.now()}`,
        name,
        createdAt: new Date().toISOString(),
        mods: modList.map((mod) => ({
          name: mod.name,
          type: mod.type,
          enabled: pendingMods.has(`${mod.type}:${mod.name}`),
        })),
      };
      onSaveCollection(newCollection);
      onClearPending();
    } else {
      const newCollection = {
        id: `collection_${Date.now()}`,
        name,
        createdAt: new Date().toISOString(),
        mods: modList.map((mod) => ({
          name: mod.name,
          type: mod.type,
          enabled: mod.enabled !== false,
        })),
      };
      onSaveCollection(newCollection);
    }

    setNewCollectionName('');
    setNamingMode('idle');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') commitCollection();
    if (e.key === 'Escape') cancelNaming();
  };

  const renderNameInput = (placeholder) => (
    <div className="collection-create-row">
      <input
        ref={inputRef}
        className="collection-name-input"
        placeholder={placeholder}
        value={newCollectionName}
        onChange={(e) => setNewCollectionName(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <button
        className="collection-confirm-btn"
        onClick={commitCollection}
        disabled={!newCollectionName.trim()}
      >
        ✓
      </button>
      <button className="collection-cancel-btn" onClick={cancelNaming}>
        ✕
      </button>
    </div>
  );

  return (
    <div className="collection-manager">

      {/* ── Pending mods banner ── */}
      {hasPending && (
        <div className="collection-pending-banner">
          <span className="collection-pending-icon">✚</span>
          <span className="collection-pending-label">
            {pendingMods.size} mod{pendingMods.size !== 1 ? 's' : ''} selected
          </span>
          {namingMode !== 'naming-pending' && (
            <button
              className="collection-pending-save"
              onClick={() => {
                setNamingMode('naming-pending');
                setIsExpanded(false); // collapse the panel so the input is visible
              }}
            >
              Save as collection
            </button>
          )}
          <button className="collection-pending-clear" onClick={onClearPending}>
            ✕
          </button>
        </div>
      )}

      {/* ── Name input for pending collection (shown below banner, outside the panel) ── */}
      {namingMode === 'naming-pending' &&
        renderNameInput(`Name for ${pendingMods?.size ?? 0} selected mods…`)}

      {/* ── Toggle button ── */}
      <button
        className={`collection-toggle ${isExpanded ? 'active' : ''}`}
        onClick={() => setIsExpanded((v) => !v)}
      >
        <span className="collection-toggle-icon">🗂️</span>
        <span className="collection-toggle-label">
          {activeCollection ? activeCollection.name : 'Collections'}
        </span>
        {activeCollection && (
          <span className="collection-active-badge">active</span>
        )}
        <span className="collection-toggle-chevron">{isExpanded ? '▲' : '▼'}</span>
      </button>

      {/* ── Dropdown panel ── */}
      {isExpanded && (
        <div className="collection-panel">
          <div className="collection-panel-header">
            <span className="collection-panel-title">Mod Collections</span>
            {namingMode !== 'naming-current' && (
              <button
                className="collection-new-btn"
                onClick={() => setNamingMode('naming-current')}
              >
                + Save current
              </button>
            )}
          </div>

          {namingMode === 'naming-current' &&
            renderNameInput('Collection name…')}

          {collections.length === 0 && namingMode === 'idle' && (
            <div className="collection-empty">
              <p>No collections yet.</p>
              <p>Right-click mods to pick them, or click "Save current" to snapshot all.</p>
            </div>
          )}

          <div className="collection-list">
            {collections.map((col) => {
              const isActive = col.id === activeCollectionId;
              const enabledCount = col.mods.filter((m) => m.enabled !== false).length;
              return (
                <div key={col.id} className={`collection-item ${isActive ? 'is-active' : ''}`}>
                  <div className="collection-item-info">
                    <span className="collection-item-name">{col.name}</span>
                    <span className="collection-item-meta">
                      {enabledCount} mod{enabledCount !== 1 ? 's' : ''} enabled
                    </span>
                  </div>
                  <div className="collection-item-actions">
                    <button
                      className={`collection-apply-btn ${isActive ? 'is-active' : ''}`}
                      onClick={() => onApplyCollection(col)}
                      disabled={isApplying}
                    >
                      {isApplying ? '⏳' : isActive ? '✓ Active' : '▶ Apply'}
                    </button>
                    {isActive && (
                      <button
                        className="collection-deselect-btn"
                        onClick={onDeselectCollection}
                        title="Deselect — stop tracking this collection (mods stay as-is)"
                      >
                        ✕
                      </button>
                    )}
                    <button
                      className="collection-delete-btn"
                      onClick={() => {
                        if (confirm(`Delete collection "${col.name}"?`)) {
                          onDeleteCollection(col.id);
                        }
                      }}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default CollectionManager;
