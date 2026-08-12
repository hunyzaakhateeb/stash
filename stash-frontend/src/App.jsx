import { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import FileCard from './components/FileCard';
import FolderCard from './components/FolderCard';
import UploadModal from './components/UploadModal';
import SettingsModal from './components/SettingsModal';
import CreateFolderModal from './components/CreateFolderModal';
import MoveFileModal from './components/MoveFileModal';
import plusIcon from './assets/icons/plus.svg';
import folderIcon from './assets/icons/folder.svg';
import backIcon from './assets/icons/back.svg';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

function App() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [fileToMove, setFileToMove] = useState(null);
  
  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  
  const [fileToDelete, setFileToDelete] = useState(null);
  const [folderToDelete, setFolderToDelete] = useState(null);

  const [activeTab, setActiveTab] = useState('All');
  
  const [favorites, setFavorites] = useState(() => JSON.parse(localStorage.getItem('stash-favorites')) || []);
  const [trashedFiles, setTrashedFiles] = useState(() => JSON.parse(localStorage.getItem('stash-trash')) || []);
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('stash-settings');
    const parsed = saved ? JSON.parse(saved) : {};
    return {
      blurPreview: false,
      hoverVideoPlayback: true,
      theme: 'dark',
      ...parsed
    };
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

  const fetchFolders = async () => {
    try {
      const response = await fetch(`${API_URL}/folders`);
      const data = await response.json();
      setFolders(data);
    } catch (error) {
      console.error("Failed to fetch folders:", error);
    }
  };

  useEffect(() => {
    fetchVaultFiles();
    fetchFolders();
  }, []);

  useEffect(() => {
    localStorage.setItem('stash-favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem('stash-trash', JSON.stringify(trashedFiles));
  }, [trashedFiles]);

  useEffect(() => {
    const currentTheme = settings.theme || 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('stash-settings', JSON.stringify(settings));
  }, [settings]);

  // Reset selected folder if user clicks a tab other than Folders
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab !== 'Folders') {
      setSelectedFolder(null);
    }
  };

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
          fetchFolders();
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
        fetchFolders();
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
        fetchFolders();
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

  const executeFolderDelete = async () => {
    if (!folderToDelete) return;
    try {
      const response = await fetch(`${API_URL}/folders/${folderToDelete._id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        fetchFolders();
        fetchVaultFiles();
        setFolderToDelete(null);
        if (selectedFolder && selectedFolder._id === folderToDelete._id) {
          setSelectedFolder(null);
        }
      }
    } catch (error) {
      console.error("Failed to delete folder:", error);
    }
  };

  // Filter files based on current tab, search query, or active folder
  const displayFiles = files.filter(file => {
    const filename = file.displayName || file.name || '';
    const cleanName = filename.replace(/^\d+-/, '').toLowerCase();
    if (searchQuery && !cleanName.includes(searchQuery.toLowerCase())) {
      return false; 
    }

    const isTrashed = file.isTrashed || trashedFiles.includes(file.name);

    if (activeTab === 'Trash') return isTrashed;
    if (isTrashed) return false;

    // Inside a specific folder view
    if (activeTab === 'Folders' && selectedFolder) {
      return file.folderId && file.folderId.toString() === selectedFolder._id.toString();
    }

    if (activeTab === 'Favorites') return file.isFavorite || favorites.includes(file.name);
    if (activeTab === 'All') return true;

    const fileType = file.type || '';
    const ext = filename.split('.').pop().toLowerCase();
    if (activeTab === 'Photos' && (fileType === 'image' || ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext))) return true;
    if (activeTab === 'Videos' && (fileType === 'video' || ['mp4', 'mov', 'mkv', 'webm'].includes(ext))) return true;
    if (activeTab === 'Documents' && (fileType === 'document' || ['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx'].includes(ext))) return true;
    if (activeTab === 'Audio' && (fileType === 'audio' || ['mp3', 'wav', 'ogg'].includes(ext))) return true;

    return false;
  });

  const displayFolders = folders.filter(folder => {
    if (searchQuery) {
      return folder.name.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return true;
  });

  const filesToRender = displayFiles.slice(0, visibleCount);

  return (
    <div className="stash-app">
      <Navbar
        onAddClick={() => setIsModalOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
      />

      <main className="dashboard-content">
        {/* FOLDERS TAB CONTENT */}
        {activeTab === 'Folders' && (
          <div className="folders-container">
            {/* Header / Breadcrumb Bar */}
            <div className="folders-header-bar">
              {selectedFolder ? (
                <div className="breadcrumb-nav">
                  <button 
                    className="settings-icon-btn" 
                    onClick={() => setSelectedFolder(null)} 
                    title="Back to Folders"
                  >
                    <img src={backIcon} alt="Back" className="settings-svg" />
                  </button>
                  <div className="breadcrumb-title">
                    <img src={folderIcon} alt="Folder" className="breadcrumb-svg" />
                    <span>{selectedFolder.name}</span>
                  </div>
                </div>
              ) : (
                <div className="folders-toolbar">
                  <h3 style={{ color: 'white', fontSize: '1.25rem' }}>Your Folders</h3>
                  <button className="create-folder-btn" onClick={() => setIsCreateFolderOpen(true)}>
                    <img src={plusIcon} alt="Plus" className="add-svg-icon" />
                    New Folder
                  </button>
                </div>
              )}
            </div>

            {/* Centered Upload Button inside an open folder */}
            {selectedFolder && (
              <div className="folder-upload-center" style={{ display: 'flex', justifyContent: 'center', margin: '20px 0' }}>
                <button className="add-button" onClick={() => setIsModalOpen(true)}>
                  <img src={plusIcon} alt="Upload" className="add-svg-icon" />
                  Upload Files to {selectedFolder.name}
                </button>
              </div>
            )}

            {/* Folder Cards Grid (when no folder is selected) */}
            {!selectedFolder && (
              <div className="folder-grid">
                {displayFolders.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', gridColumn: '1 / -1', textAlign: 'center', marginTop: '40px' }}>
                    No folders created yet. Click "+ New Folder" to organize your files!
                  </p>
                ) : (
                  displayFolders.map((folder) => (
                    <FolderCard
                      key={folder._id}
                      folder={folder}
                      onClick={() => setSelectedFolder(folder)}
                      onDelete={() => setFolderToDelete(folder)}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* FILES GRID (Show files if not in Folders tab OR if inside a selected folder) */}
        {(activeTab !== 'Folders' || selectedFolder) && (
          <div className="file-grid">
            {displayFiles.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', marginTop: '40px' }}>
                <p style={{ color: 'var(--text-muted)' }}>
                  {selectedFolder ? `No files in ${selectedFolder.name} yet.` : `No files found in ${activeTab}.`}
                </p>
              </div>
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
                  onMove={() => setFileToMove(file)}
                  settings={settings}
                />
              ))
            )}
          </div>
        )}

        {/* Modals */}
        {isModalOpen && (
          <UploadModal
            folderId={selectedFolder ? selectedFolder._id : null}
            onClose={() => {
              setIsModalOpen(false);
              fetchVaultFiles();
              fetchFolders();
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

        {isCreateFolderOpen && (
          <CreateFolderModal
            onClose={() => setIsCreateFolderOpen(false)}
            onCreated={() => {
              fetchFolders();
            }}
          />
        )}

        {fileToMove && (
          <MoveFileModal
            file={fileToMove}
            folders={folders}
            onClose={() => setFileToMove(null)}
            onMoved={() => {
              fetchVaultFiles();
              fetchFolders();
            }}
          />
        )}

        {displayFiles.length > visibleCount && (activeTab !== 'Folders' || selectedFolder) && (
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

      {/* Delete File Confirm Modal */}
      {fileToDelete && (
        <div className="modal-overlay" onClick={() => setFileToDelete(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px', textAlign: 'center' }}>
            <h3 style={{ color: '#ff4444', marginBottom: '10px' }}>Permanently Delete File</h3>
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

      {/* Delete Folder Confirm Modal */}
      {folderToDelete && (
        <div className="modal-overlay" onClick={() => setFolderToDelete(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px', textAlign: 'center' }}>
            <h3 style={{ color: '#ff4444', marginBottom: '10px' }}>Delete Folder</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>
              Are you sure you want to delete folder <br />
              <strong style={{ color: 'white' }}>{folderToDelete.name}</strong>? <br />
              <span style={{ fontSize: '0.85rem' }}>(Files inside will remain safe in your vault)</span>
            </p>
            <div className="modal-footer" style={{ justifyContent: 'center' }}>
              <button className="cancel-btn" onClick={() => setFolderToDelete(null)}>
                Cancel
              </button>
              <button className="upload-btn" style={{ background: '#ff4444', color: 'white' }} onClick={executeFolderDelete}>
                Delete Folder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App;