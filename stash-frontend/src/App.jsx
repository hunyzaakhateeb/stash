import { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import FileCard from './components/FileCard';
import UploadModal from './components/UploadModal';
import SettingsModal from './components/SettingsModal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

function App() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [fileToDelete, setFileToDelete] = useState(null);
  const [activeTab, setActiveTab] = useState('All');
  
  const [favorites, setFavorites] = useState(() => JSON.parse(localStorage.getItem('stash-favorites')) || []);
  const [trashedFiles, setTrashedFiles] = useState(() => JSON.parse(localStorage.getItem('stash-trash')) || []);
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('stash-settings');
    return saved ? JSON.parse(saved) : { blurPreview: false, hoverVideoPlayback: true };
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(8);
  
  const fetchVaultFiles = async () => {
    try {
      const response = await fetch(`${API_URL}/files`);
      const data = await response.json();
      setFiles(data);
    } catch (error) {
      console.error("Failed to fetch files:", error);
    }
  };

  useEffect(() => {
    fetchVaultFiles();
  }, []);

  useEffect(() => {
    localStorage.setItem('stash-favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem('stash-trash', JSON.stringify(trashedFiles));
  }, [trashedFiles]);

  useEffect(() => {
    localStorage.setItem('stash-settings', JSON.stringify(settings));
  }, [settings]);

  const toggleFavorite = async (file) => {
    try {
      if (file._id) {
        await fetch(`${API_URL}/files/${file._id}/favorite`, { method: 'PATCH' });
        fetchVaultFiles();
      } else {
        const identifier = file.name;
        setFavorites(prev =>
          prev.includes(identifier) ? prev.filter(f => f !== identifier) : [...prev, identifier]
        );
      }
    } catch (error) {
      console.error("Failed to toggle favorite:", error);
    }
  };

  const handleTrashAction = async (file) => {
    if (activeTab === 'Trash') {
      setFileToDelete(file);
    } else {
      try {
        if (file._id) {
          await fetch(`${API_URL}/files/${file._id}/trash`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isTrashed: true }),
          });
          fetchVaultFiles();
        } else {
          setTrashedFiles(prev => [...prev, file.name]);
        }
      } catch (error) {
        console.error("Failed to move file to trash:", error);
      }
    }
  };

  const restoreFromTrash = async (file) => {
    try {
      if (file._id) {
        await fetch(`${API_URL}/files/${file._id}/trash`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isTrashed: false }),
        });
        fetchVaultFiles();
      } else {
        setTrashedFiles(prev => prev.filter(f => f !== file.name));
      }
    } catch (error) {
      console.error("Failed to restore file from trash:", error);
    }
  };

  const executeDelete = async () => {
    if (!fileToDelete) return;
    try {
      const targetId = fileToDelete._id || encodeURIComponent(fileToDelete.name);
      const response = await fetch(`${API_URL}/files/${targetId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        fetchVaultFiles();
        if (fileToDelete.name) {
          setFavorites(prev => prev.filter(f => f !== fileToDelete.name));
          setTrashedFiles(prev => prev.filter(f => f !== fileToDelete.name));
        }
        setFileToDelete(null);
      }
    } catch (error) {
      console.error("Failed to delete file:", error);
    }
  };

  const displayFiles = files.filter(file => {
    const filename = file.displayName || file.name || '';
    const cleanName = filename.replace(/^\d+-/, '').toLowerCase();
    if (searchQuery && !cleanName.includes(searchQuery.toLowerCase())) {
      return false; 
    }

    const isTrashed = file.isTrashed || trashedFiles.includes(file.name);
    if (activeTab === 'Trash') return isTrashed;
    if (isTrashed) return false;
    
    const isFavorite = file.isFavorite || favorites.includes(file.name);
    if (activeTab === 'Favorites') return isFavorite;
    if (activeTab === 'All') return true;

    const fileType = file.type || '';
    const ext = filename.split('.').pop().toLowerCase();
    if (activeTab === 'Photos' && (fileType === 'image' || ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext))) return true;
    if (activeTab === 'Videos' && (fileType === 'video' || ['mp4', 'mov', 'mkv', 'webm'].includes(ext))) return true;
    if (activeTab === 'Documents' && (fileType === 'document' || ['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx'].includes(ext))) return true;
    if (activeTab === 'Audio' && (fileType === 'audio' || ['mp3', 'wav', 'ogg'].includes(ext))) return true;

    return false;
  });

  const filesToRender = displayFiles.slice(0, visibleCount);

  return (
    <div className="stash-app">
      <Navbar
        onAddClick={() => setIsModalOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
      />

      <main className="dashboard-content">
        <div className="file-grid">
          {displayFiles.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', gridColumn: '1 / -1', textAlign: 'center', marginTop: '40px' }}>
              No files found in {activeTab}.
            </p>
          ) : (
            filesToRender.map((file) => (
              <FileCard
                key={file._id || file.name}
                name={file.displayName || file.name}
                size={file.size}
                date={file.createdAt ? new Date(file.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : (file.date || 'Today')}
                type={file.type || 'other'}
                url={file.url || `${API_URL}/files/raw/${file._id}`}
                downloadUrl={file.downloadUrl || `${API_URL}/files/download/${file._id}`}
                isFavorite={file.isFavorite || favorites.includes(file.name)}
                isTrashed={file.isTrashed || trashedFiles.includes(file.name)}
                onToggleFavorite={() => toggleFavorite(file)}
                onDelete={() => handleTrashAction(file)}
                onRestore={() => restoreFromTrash(file)}
                settings={settings}
              />
            ))
          )}
        </div>

        {isModalOpen && (
          <UploadModal
            onClose={() => {
              setIsModalOpen(false);
              fetchVaultFiles();
            }}
          />
        )}

        {isSettingsOpen && (
          <SettingsModal
            onClose={() => setIsSettingsOpen(false)}
            settings={settings}
            onUpdateSettings={setSettings}
          />
        )}

        {displayFiles.length > visibleCount && (
          <div className="load-more-container">
            <button
              className="load-more-btn"
              onClick={() => setVisibleCount(displayFiles.length)}
            >
              Load more...
            </button>
          </div>
        )}
      </main>

      {fileToDelete && (
        <div className="modal-overlay" onClick={() => setFileToDelete(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px', textAlign: 'center' }}>
            <h3 style={{ color: '#ff4444', marginBottom: '10px' }}>Permanently Delete</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>
              Are you sure you want to completely shred <br />
              <strong style={{ color: 'white' }}>{fileToDelete.displayName || fileToDelete.name || fileToDelete}</strong>? <br />
              <span style={{ fontSize: '0.85rem' }}>(This cannot be undone)</span>
            </p>
            <div className="modal-footer" style={{ justifyContent: 'center' }}>
              <button className="cancel-btn" onClick={() => setFileToDelete(null)}>
                Cancel
              </button>
              <button className="upload-btn" style={{ background: '#ff4444', color: 'white' }} onClick={executeDelete}>
                Yes, Shred It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App;