import { useState } from 'react';
import folderIcon from '../assets/icons/folder.svg';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

export default function MoveFileModal({ file, folders, onClose, onMoved }) {
  const [selectedFolderId, setSelectedFolderId] = useState(file.folderId || null);
  const [isMoving, setIsMoving] = useState(false);

  const handleMove = async () => {
    setIsMoving(true);
    try {
      const token = localStorage.getItem('stash-token');
      const response = await fetch(`${API_URL}/files/${file._id}/move`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ folderId: selectedFolderId }),
      });

      if (response.ok) {
        onMoved();
        onClose();
      } else {
        alert('Failed to move file');
      }
    } catch (error) {
      console.error('Error moving file:', error);
      alert('Error moving file');
    } finally {
      setIsMoving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
        <div className="modal-header">
          <h3>Shift / Move File</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div style={{ margin: '15px 0' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '15px' }}>
            Select destination for <strong style={{ color: 'var(--text-primary)' }}>{file.displayName || file.name?.replace(/^\d+-/, '')}</strong>:
          </p>

          <div className="folder-selection-list">
            <div
              className={`folder-select-item ${selectedFolderId === null ? 'selected' : ''}`}
              onClick={() => setSelectedFolderId(null)}
            >
              <div className="folder-item-icon">🌐</div>
              <div className="folder-item-info">
                <strong>Main Vault (No Folder)</strong>
                <span>Root directory</span>
              </div>
              {selectedFolderId === null && <span className="check-mark">✓</span>}
            </div>

            {folders.map((folder) => {
              const isSelected = selectedFolderId === folder._id;
              return (
                <div
                  key={folder._id}
                  className={`folder-select-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedFolderId(folder._id)}
                >
                  <img src={folderIcon} alt="Folder" className="folder-item-svg" />
                  <div className="folder-item-info">
                    <strong>{folder.name}</strong>
                    <span>{folder.fileCount || 0} files</span>
                  </div>
                  {isSelected && <span className="check-mark">✓</span>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="modal-footer" style={{ marginTop: '20px' }}>
          <button className="cancel-btn" onClick={onClose} disabled={isMoving}>
            Cancel
          </button>
          <button className="upload-btn" onClick={handleMove} disabled={isMoving}>
            {isMoving ? 'Moving...' : 'Move File'}
          </button>
        </div>
      </div>
    </div>
  );
}
