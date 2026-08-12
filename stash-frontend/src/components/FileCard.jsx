import React, { useRef } from 'react';

// Import your custom SVGs for the file cards
import photosIcon from '../assets/icons/pic.svg';
import videosIcon from '../assets/icons/vid.svg';
import docsIcon from '../assets/icons/doc.svg';
import audioIcon from '../assets/icons/audio.svg';
import allIcon from '../assets/icons/all.svg';

// Import your custom action SVGs
import downloadIcon from '../assets/icons/download.svg';
import trashIcon from '../assets/icons/trash.svg';
import emptyHeartIcon from '../assets/icons/empty_heart.svg';
import fillHeartIcon from '../assets/icons/fill_heart.svg';
import restoreIcon from '../assets/icons/restore.svg';

export default function FileCard({ 
  type = 'image', 
  name = 'File.jpg', 
  size = '0.0 MB', 
  date = 'Aug 7',
  url,
  downloadUrl,
  onDelete,
  isFavorite,
  isTrashed, 
  onToggleFavorite,
  onRestore,
  settings = {}
}) {

  const displayName = name.replace(/^\d+-/, '');
  const videoRef = useRef(null);

  const handleMouseEnter = () => {
    if (settings?.hoverVideoPlayback && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  };

  const handleMouseLeave = () => {
    if (settings?.hoverVideoPlayback && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  // Helper to pick the correct custom SVG based on file type
  const getFileIcon = (fileType) => {
    switch (fileType) {
      case 'image': return photosIcon;
      case 'video': return videosIcon;
      case 'audio': return audioIcon;
      case 'pdf':
      case 'document':
      case 'application':
      case 'text': return docsIcon;
      default: return allIcon;
    }
  };

  const iconSrc = getFileIcon(type);

  const handleCardClick = () => {
    if (url) {
      window.open(url, '_blank');
    }
  };
  
  const handleDownload = async (e) => {
    e.stopPropagation(); 
    try {
      const targetDownloadUrl = downloadUrl || url;
      const response = await fetch(targetDownloadUrl);
      const blob = await response.blob(); 
      const blobUrl = window.URL.createObjectURL(blob); 
      
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = displayName;
      document.body.appendChild(link);
      link.click(); 
      
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Failed to download file:", error);
    }
  };

  return (
    <div 
      className="file-card-v2" 
      onClick={handleCardClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="file-preview">
        
        <div className="media-background">
          {type === 'image' && url ? (
            <img 
              src={url} 
              alt={displayName} 
              className={`preview-image ${settings.blurPreview ? 'blurred-media' : ''}`}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ) : type === 'video' && url ? (
            <video 
              ref={videoRef}
              src={url} 
              muted 
              loop 
              playsInline 
              className={`preview-video ${settings.blurPreview ? 'blurred-media' : ''}`}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ) : null}
          
          <div className="fallback-icon">
            <img src={iconSrc} alt="file type icon" className="card-custom-svg" />
          </div>
        </div>

        <div className="dynamic-placeholder-overlay">
          <img src={iconSrc} alt="file type icon" className="card-center-svg" />
        </div>

        <div className="hover-actions">
          {isTrashed ? (
            <button className="action-btn" title="Restore" onClick={(e) => { e.stopPropagation(); onRestore(); }}>
              <img src={restoreIcon} alt="Restore" className="action-svg-icon" />
            </button>
          ) : (
            <>
              {/* Favorite Button with Custom SVG */}
              <button className="action-btn" title="Favorite" onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}>
                <img 
                  src={isFavorite ? fillHeartIcon : emptyHeartIcon} 
                  alt="Favorite" 
                  className="action-svg-icon" 
                />
              </button>

              {/* Download Button with Custom SVG */}
              <button className="action-btn" title="Download" onClick={handleDownload}>
                <img src={downloadIcon} alt="Download" className="action-svg-icon" />
              </button>
            </>
          )}
          
          {/* Delete / Trash Button with Custom SVG */}
          <button className="action-btn delete-btn" title={isTrashed ? "Permanently Delete" : "Move to Trash"} onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}>
            <img src={trashIcon} alt="Delete" className="action-svg-icon" />
          </button>
        </div>
      </div>
      
      <div className="file-info">
        <h4 className="file-name">{displayName}</h4>
        <p className="file-meta">{size} • {date}</p>
      </div>
    </div>
  );
}