import { useRef, useState } from 'react';
import cloudUploadIcon from '../assets/icons/cloud_upload.svg';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

export default function UploadModal({ onClose, folderId }) {
  const fileInputRef = useRef(null);
  
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);

  const handleZoneClick = () => {
    fileInputRef.current.click();
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleUploadClick = async () => {
    if (!selectedFiles || selectedFiles.length === 0) {
      alert("Please select at least one file first!");
      return;
    }

    setIsUploading(true);

    const formData = new FormData();
    if (folderId) {
      formData.append('folderId', folderId);
    }
    selectedFiles.forEach((file) => {
      formData.append('files', file);
    });

    try {
      const response = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        console.log("Success:", data);
        alert(selectedFiles.length > 1 ? `${selectedFiles.length} files successfully stashed!` : "File successfully stashed!");
        onClose();
      } else {
        alert("Upload failed. Is the server running?");
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert("Something went wrong.");
    } finally {
      setIsUploading(false);
    }
  };

  const getDropzoneText = () => {
    if (selectedFiles.length === 0) {
      return "Drag & drop your files here";
    }
    if (selectedFiles.length === 1) {
      return selectedFiles[0].name;
    }
    return `${selectedFiles.length} files selected`;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Upload to Vault</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div 
          className="dropzone" 
          onClick={handleZoneClick}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div className="dropzone-icon">
            <img src={cloudUploadIcon} alt="Upload" style={{ width: '48px', height: '48px' }} />
          </div>
          <p>{getDropzoneText()}</p>
          <span className="dropzone-subtext">
            {selectedFiles.length > 0 ? "Ready to upload!" : "or click to browse"}
          </span>
          
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden-input" 
            multiple
            onChange={handleFileChange} 
          />
        </div>

        {selectedFiles.length > 1 && (
          <div style={{ marginTop: '12px', maxHeight: '100px', overflowY: 'auto', textAlign: 'left', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            <strong>Selected Files:</strong>
            <ul style={{ paddingLeft: '20px', margin: '4px 0 0 0' }}>
              {selectedFiles.map((file, idx) => (
                <li key={idx} style={{ color: 'var(--text-primary)' }}>{file.name}</li>
              ))}
            </ul>
          </div>
        )}
        
        <div className="modal-footer" style={{ marginTop: '20px' }}>
          <button className="cancel-btn" onClick={onClose} disabled={isUploading}>
            Cancel
          </button>
          <button 
            className="upload-btn" 
            onClick={handleUploadClick}
            disabled={isUploading}
          >
            {isUploading ? "Uploading..." : selectedFiles.length > 1 ? `Upload ${selectedFiles.length} Files` : "Upload File"}
          </button>
        </div>
      </div>
    </div>
  );
}