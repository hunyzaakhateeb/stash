import React from 'react';
import './../index.css';

import allIcon from '../assets/icons/all.svg';
import photosIcon from '../assets/icons/pic.svg';
import videosIcon from '../assets/icons/vid.svg';
import docsIcon from '../assets/icons/doc.svg';
import audioIcon from '../assets/icons/audio.svg';
import favIcon from '../assets/icons/fill_heart.svg';
import trashIcon from '../assets/icons/trash.svg';
import folderIcon from '../assets/icons/folder.svg';
import logo from '../assets/logo.svg';
import searchIcon from '../assets/search-icon.svg';
import settingsIcon from '../assets/icons/settings.svg';
import plusIcon from '../assets/icons/plus.svg';

export default function Navbar({ onAddClick, onCreateFolderClick, onOpenSettings, activeTab, setActiveTab, searchQuery, setSearchQuery, user, onLogout }) {

  const tabIcons = {
    'All': allIcon,
    'Folders': folderIcon,
    'Photos': photosIcon,
    'Videos': videosIcon,
    'Documents': docsIcon,
    'Audio': audioIcon,
    'Favorites': favIcon,
    'Trash': trashIcon,
  };

  const tabs = ['All', 'Folders', 'Photos', 'Videos', 'Documents', 'Audio', 'Favorites', 'Trash'];

  return (
    <nav className="navbar">
      <div className="navbar-top">
        <div className="logo-section">
          <img src={logo} alt="Stash Logo" className="custom-logo" />
          <h2 className="logo-text">Stash</h2>
        </div>

        <div className="search-section">
          <div className="search-container">
            <img src={searchIcon} alt="Search" className="search-svg" />
            <input
              type="text"
              placeholder="Find something..."
              className="search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="actions-section" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button className="settings-icon-btn" onClick={onOpenSettings} title="Preferences & Settings">
            <img src={settingsIcon} alt="Settings" className="settings-svg" />
          </button>
          <button className="create-folder-btn" onClick={onCreateFolderClick} title="Create New Folder">
            <img src={plusIcon} alt="Plus" className="add-svg-icon" />
            Folder
          </button>
          <button className="add-button" onClick={onAddClick} title="Upload Files to Vault">
            <img src={plusIcon} alt="Add" className="add-svg-icon" />
            Add
          </button>
          {onLogout && (
            <button className="settings-icon-btn" onClick={onLogout} title={user ? `Sign Out (${user.username || user.email})` : "Sign Out"}>
              <span style={{ fontSize: '1rem' }}>🚪</span>
            </button>
          )}
        </div>
      </div>

      <div className="navbar-tabs">
        {tabs.map((tab) => {
          const isActive = activeTab === tab;
          const tagTitle = tab === 'All' ? "View All Files" : tab === 'Folders' ? "View Folders" : tab === 'Favorites' ? "View Favorite Files" : tab === 'Trash' ? "View Trashed Files" : `View ${tab} Files`;
          return (
            <button
              key={tab}
              className={`tab ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
              title={tagTitle}
            >
              <img src={tabIcons[tab]} alt={`${tab} icon`} className="custom-tab-icon" />
              <span>{tab}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}