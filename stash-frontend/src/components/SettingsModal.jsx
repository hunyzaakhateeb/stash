import React from 'react';

export default function SettingsModal({ onClose, settings, onUpdateSettings }) {
  const handleToggleBlur = () => {
    onUpdateSettings({
      ...settings,
      blurPreview: !settings.blurPreview
    });
  };

  const handleToggleVideoHover = () => {
    onUpdateSettings({
      ...settings,
      hoverVideoPlayback: !settings.hoverVideoPlayback
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content settings-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Preferences & Settings</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="settings-section">
          <div className="setting-row">
            <div className="setting-info">
              <label className="setting-title">Blur File Previews</label>
              <p className="setting-description">
                Apply a smooth blur filter on image & video thumbnails until hovered.
              </p>
            </div>
            <button 
              className={`toggle-switch ${settings.blurPreview ? 'active' : ''}`}
              onClick={handleToggleBlur}
              type="button"
              aria-label="Toggle blur file previews"
            >
              <div className="toggle-thumb" />
            </button>
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <label className="setting-title">Video Hover Playback</label>
              <p className="setting-description">
                Automatically play muted video previews when hovering over video cards.
              </p>
            </div>
            <button 
              className={`toggle-switch ${settings.hoverVideoPlayback ? 'active' : ''}`}
              onClick={handleToggleVideoHover}
              type="button"
              aria-label="Toggle video hover playback"
            >
              <div className="toggle-thumb" />
            </button>
          </div>
        </div>

        <div className="modal-footer" style={{ marginTop: '28px' }}>
          <button className="upload-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
