import { useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

export default function CreateFolderModal({ onClose, onCreated }) {
  const [folderName, setFolderName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!folderName.trim()) {
      alert('Please enter a folder name');
      return;
    }

    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('stash-token');
      const response = await fetch(`${API_URL}/folders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ name: folderName.trim() }),
      });

      if (response.ok) {
        onCreated();
        onClose();
      } else {
        alert('Failed to create folder');
      }
    } catch (error) {
      console.error('Error creating folder:', error);
      alert('Error creating folder');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
        <div className="modal-header">
          <h3>Create New Folder</h3>
          <button className="close-btn" onClick={onClose} title="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ margin: '20px 0' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              Folder Name
            </label>
            <input 
              type="text" 
              placeholder="e.g. Work Projects, Finances..." 
              value={folderName} 
              onChange={(e) => setFolderName(e.target.value)}
              autoFocus
              className="modal-text-input"
            />
          </div>

          <div className="modal-footer">
            <button type="button" className="cancel-btn" onClick={onClose} disabled={isSubmitting} title="Cancel Folder Creation">
              Cancel
            </button>
            <button type="submit" className="upload-btn" disabled={isSubmitting} title="Create Folder">
              {isSubmitting ? 'Creating...' : 'Create Folder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
