import React from 'react';
import folderIcon from '../assets/icons/folder.svg';
import trashIcon from '../assets/icons/trash.svg';

export default function FolderCard({ folder, onClick, onDelete }) {
  return (
    <div className="folder-card" onClick={onClick}>
      <div className="folder-card-header">
        <div className="folder-icon-wrapper" style={{ borderColor: folder.color || '#00f2fe' }}>
          <img src={folderIcon} alt="Folder" className="folder-card-svg" />
        </div>
        <button 
          className="folder-delete-btn" 
          title="Delete Folder" 
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <img src={trashIcon} alt="Delete" className="action-svg-icon" />
        </button>
      </div>

      <div className="folder-card-body">
        <h4 className="folder-name">{folder.name}</h4>
        <p className="folder-meta">{folder.fileCount || 0} file{folder.fileCount === 1 ? '' : 's'}</p>
      </div>
    </div>
  );
}
