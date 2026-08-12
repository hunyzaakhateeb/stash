# Stash

A modern, full-stack cloud vault and file management web application powered by **MongoDB GridFS**. **Stash** provides seamless file uploads, inline previews, file categorization, and database management with a sleek, responsive user interface.

---

## 🌟 Key Features

- **📦 MongoDB GridFS File Storage**: File binaries are stored directly inside MongoDB (`uploads.files` and `uploads.chunks`). Zero external storage services required!
- **🗄️ Database Metadata Management**: File metadata (display name, MIME type, byte size, category, favorite status, trash status, GridFS reference ID) is stored in the Mongoose `File` collection.
- **📂 Categorization & Search**: Instant filtering across **Pictures**, **Documents**, **Videos**, and **Audio** files with real-time search.
- **✨ Modern & Intuitive UI**: Built with React & Vite featuring glassmorphic components, file upload modal, settings manager, and file card previews.
- **🗑️ Complete File Lifecycle**: Upload, preview, download, favorite, trash, restore, and permanently shred files.
- **🔒 Environment Protection**: Configured with strict `.gitignore` rules to keep database credentials and secrets safe.

---

## 🛠️ Tech Stack

### **Frontend**
- **Framework**: React 19 + Vite
- **Styling**: Modern Vanilla CSS (Glassmorphism & dark mode aesthetics)
- **Icons & Assets**: SVG icon system

### **Backend**
- **Runtime**: Node.js + Express.js
- **Database & Storage**: MongoDB Atlas & MongoDB GridFS (`mongoose.mongo.GridFSBucket`)
- **File Upload Handling**: Multer (Memory Storage)

---

## 📁 Project Structure

```
stash/
├── stash-backend/
│   ├── models/           # Mongoose schemas (File.js)
│   ├── server.js         # Express server & GridFS API endpoints
│   ├── .env.example      # Environment variable template
│   └── package.json
│
└── stash-frontend/
    ├── src/
    │   ├── components/   # Navbar, FileCard, UploadModal, SettingsModal
    │   ├── assets/       # Icons and graphics
    │   ├── App.jsx       # Main application layout & state logic
    │   └── main.jsx
    ├── .env.example      # Frontend API URL template
    └── package.json
```

---

## 🚀 Quick Start Guide

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+ recommended)
- [MongoDB Atlas Account](https://www.mongodb.com/cloud/atlas)

---

### 1. Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd stash-backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create your `.env` file based on `.env.example`:
   ```bash
   cp .env.example .env
   ```
4. Fill in your credentials in `.env`:
   ```env
   MONGO_URI=your_mongodb_connection_string
   PORT=5001
   ```
5. Start the backend server:
   ```bash
   npm start
   ```
   The backend runs by default at `http://localhost:5001`.

---

### 2. Frontend Setup

1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd stash-frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create your `.env` file based on `.env.example`:
   ```bash
   cp .env.example .env
   ```
4. Configure the backend API URL in `.env`:
   ```env
   VITE_API_URL=http://localhost:5001
   ```
5. Launch the Vite development server:
   ```bash
   npm run dev
   ```
   Open the displayed local URL (typically `http://localhost:5173`) in your browser.

---

## 🔌 API Endpoints (Backend)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/` | Health check endpoint |
| `POST` | `/upload` | Upload file to MongoDB GridFS & save metadata |
| `GET` | `/files` | Fetch all stashed file records from MongoDB |
| `GET` | `/files/raw/:id` | Stream binary file content inline (preview images, videos, audio, documents) |
| `GET` | `/files/download/:id` | Stream binary file content with attachment header for browser download |
| `PATCH` | `/files/:id/favorite` | Toggle favorite status |
| `PATCH` | `/files/:id/trash` | Toggle or set trash status (move to trash / restore) |
| `DELETE` | `/files/:id` | Permanently delete file chunk data from GridFS and metadata from MongoDB |

---

## 📜 License

This project is open source and available under the [MIT License](LICENSE).
