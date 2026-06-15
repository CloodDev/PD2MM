function ModDownloader({ modLink, onLinkChange, onDownload, isDownloading }) {
  return (
    <div className="modDownload">
      <div className="download-form">
        <div className="input-group">
          <label className="input-label">Mod Download URL</label>
          <input
            type="text"
            className="modlink"
            placeholder="https://modworkshop.net/mod/..."
            onChange={(e) => onLinkChange(e.target.value)}
            value={modLink}
            disabled={isDownloading}
          />
        </div>
        <button
          className="action-button"
          onClick={onDownload}
          disabled={isDownloading || !modLink}
        >
          {isDownloading ? '⏳ Downloading...' : '⬇️ Download'}
        </button>
      </div>
    </div>
  );
}

export default ModDownloader;
