import React, { useState, useEffect, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

export default function SearchBarBot({
  searchQuery,
  setSearchQuery,
  activeTab,
  setActiveTab,
  files = [],
  folders = [],
  favorites = [],
  trashedFiles = [],
  setSelectedFolder,
  token
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [inputVal, setInputVal] = useState(searchQuery || '');
  const [chatInputVal, setChatInputVal] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchStatus, setSearchStatus] = useState('');
  const [contextHistory, setContextHistory] = useState([]);
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'bot',
      text: "👋 Hi! I'm your Stash Multimodal AI Assistant. Ask me to find files by visual content, document text, or date:\n• \"Find all photos with dogs\"\n• \"Show pictures of cats\"\n• \"Find documents about machine learning\"\n• \"Show files I uploaded last week\"",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      quickActions: [
        { label: '🐶 Photos with Dogs', query: 'Find all photos with dogs' },
        { label: '🐱 Pictures of Cats', query: 'Show me pictures of cats' },
        { label: '📄 Machine Learning Docs', query: 'Find documents about machine learning' },
        { label: '📅 Uploaded Last Week', query: 'Show files I uploaded last week' }
      ]
    }
  ]);

  const popoverRef = useRef(null);
  const chatEndRef = useRef(null);
  const navbarInputRef = useRef(null);
  const panelInputRef = useRef(null);

  // Auto-index existing vault files in background on load
  useEffect(() => {
    async function triggerIndexExisting() {
      if (!token) return;
      try {
        await fetch(`${API_URL}/api/ai/index-existing`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          }
        });
      } catch (err) {
        // Ignored in background
      }
    }
    triggerIndexExisting();
  }, [token]);

  // Sync external searchQuery changes
  useEffect(() => {
    setInputVal(searchQuery);
  }, [searchQuery]);

  // Auto-scroll chat popover to bottom
  useEffect(() => {
    if (isOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isSearching]);

  // Close popover on outside click if not expanded
  useEffect(() => {
    function handleClickOutside(event) {
      if (!isExpanded && popoverRef.current && !popoverRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isExpanded]);

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const executeMultimodalSearch = async (rawQuery) => {
    const query = rawQuery.trim();
    if (!query) return;

    // 1. Append User Message
    const userMsg = {
      id: Date.now(),
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const newHistory = [...contextHistory, { text: query, role: 'user' }];
    setContextHistory(newHistory);
    setMessages(prev => [...prev, userMsg]);
    setIsSearching(true);
    setSearchStatus('Understanding your request...');
    setIsOpen(true);
    setChatInputVal('');
    setInputVal(query);

    try {
      setTimeout(() => setSearchStatus('Searching your files via CLIP multimodal vectors...'), 200);

      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const response = await fetch(`${API_URL}/api/ai/search`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query,
          contextHistory: newHistory
        })
      });

      if (!response.ok) {
        throw new Error('Multimodal search request failed');
      }

      const data = await response.json();
      const lower = query.toLowerCase();

      // UI Tab & Filter Updates based on AI intent
      if (lower.includes('photo') || lower.includes('picture') || lower.includes('image') || lower.includes('pic')) {
        setActiveTab('Photos');
      } else if (lower.includes('video') || lower.includes('movie')) {
        setActiveTab('Videos');
      } else if (lower.includes('doc') || lower.includes('pdf')) {
        setActiveTab('Documents');
      } else if (lower.includes('audio') || lower.includes('song')) {
        setActiveTab('Audio');
      } else if (lower.includes('favorite') || lower.includes('star')) {
        setActiveTab('Favorites');
      } else if (lower.includes('trash') || lower.includes('deleted')) {
        setActiveTab('Trash');
      }

      // Update live grid search filter
      setSearchQuery(query);

      let summaryMsg = data.summary || `I found ${data.count || 0} matching file(s).`;
      let quickActions = null;

      if (data.files && data.files.length > 0) {
        summaryMsg += `\n` + data.files.slice(0, 4).map(f => `• ${f.displayName || f.name} (${formatBytes(f.size)})`).join('\n');
        if (data.files.length > 4) summaryMsg += `\n...and ${data.files.length - 4} more matching file(s).`;

        quickActions = [
          { label: '🌿 Only Outdoors', query: 'Only show outdoors' },
          { label: '📅 From Last Year', query: 'From last year' },
          { label: '⭐ Only Favorites', query: 'Only show favorites' }
        ];
      } else {
        quickActions = [
          { label: '🌐 Show All Files', query: 'Show all files' },
          { label: '📊 Storage Stats', query: 'Storage stats' }
        ];
      }

      const botMsg = {
        id: Date.now() + 1,
        sender: 'bot',
        text: summaryMsg,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        quickActions
      };

      setMessages(prev => [...prev, botMsg]);
    } catch (error) {
      console.warn('Backend AI search error, using client semantic fallback:', error);
      setSearchQuery(query);

      const botMsg = {
        id: Date.now() + 1,
        sender: 'bot',
        text: `🔍 Filtered your vault for "${query}". Live search active!`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, botMsg]);
    } finally {
      setIsSearching(false);
      setSearchStatus('');
    }
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputVal(val);
    setSearchQuery(val);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (inputVal.trim()) {
        executeMultimodalSearch(inputVal);
      }
    }
  };

  const handleChatPanelKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (chatInputVal.trim()) {
        executeMultimodalSearch(chatInputVal);
      }
    }
  };

  const handleChipClick = (chipQuery) => {
    setInputVal(chipQuery);
    executeMultimodalSearch(chipQuery);
  };

  const clearHistory = () => {
    setContextHistory([]);
    setSearchQuery('');
    setInputVal('');
    setChatInputVal('');
    setMessages([
      {
        id: Date.now(),
        sender: 'bot',
        text: "✨ Search session reset! Ask me anything about your files.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        quickActions: [
          { label: '🐶 Photos with Dogs', query: 'Find all photos with dogs' },
          { label: '📊 Storage Stats', query: 'Storage stats' },
          { label: '⭐ Favorites', query: 'Show favorites' }
        ]
      }
    ]);
  };

  return (
    <div className={`ai-search-bot-wrapper ${isExpanded ? 'fullscreen-mode' : ''}`} ref={popoverRef}>
      {/* Search Input Bar in Navbar */}
      <div className={`ai-search-container ${isOpen ? 'active-popover' : ''}`}>
        <div className="ai-sparkle-badge" onClick={() => setIsOpen(!isOpen)} title="Toggle Stash Multimodal AI Assistant">
          <span className="sparkle-icon">✨</span>
          <span className="ai-tag">AI</span>
        </div>

        <input
          ref={navbarInputRef}
          type="text"
          placeholder="Ask Stash anything about your files..."
          className="search-input ai-input"
          value={inputVal}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
        />

        {inputVal && (
          <button
            className="search-clear-btn"
            onClick={() => {
              setInputVal('');
              setSearchQuery('');
            }}
            title="Clear search"
          >
            ✕
          </button>
        )}

        <button
          className="ai-send-btn"
          onClick={() => {
            if (inputVal.trim()) {
              executeMultimodalSearch(inputVal);
            } else {
              setIsOpen(!isOpen);
            }
          }}
          title={inputVal.trim() ? "Send query to Stash AI" : "Open Multimodal AI Search"}
        >
          {inputVal.trim() ? '➤' : '💬'}
        </button>
      </div>

      {/* Floating Glassmorphism Chat Bot Popover / Expanded Modal */}
      {isOpen && (
        <div className={`chat-bot-popover ${isExpanded ? 'expanded-modal' : ''}`}>
          {/* Header */}
          <div className="chat-popover-header">
            <div className="chat-header-title">
              <span className="bot-header-avatar">✨</span>
              <div>
                <h4>Stash Multimodal AI Assistant</h4>
                <span className="bot-online-status">● CLIP Vision & Text Vector Engine</span>
              </div>
            </div>
            <div className="chat-header-actions">
              <button
                className="chat-header-btn"
                onClick={() => setIsExpanded(!isExpanded)}
                title={isExpanded ? "Collapse View" : "Expand Full Window"}
              >
                {isExpanded ? '↙' : '↗'}
              </button>
              <button className="chat-header-btn" onClick={clearHistory} title="Reset Search Session">
                🔄
              </button>
              <button className="chat-header-btn" onClick={() => setIsOpen(false)} title="Close Panel">
                ✕
              </button>
            </div>
          </div>

          {/* Quick Action Chips Bar */}
          <div className="chat-quick-chips">
            <button className="chat-chip" onClick={() => handleChipClick('Find all photos with dogs')}>🐶 Dog Photos</button>
            <button className="chat-chip" onClick={() => handleChipClick('Show me pictures of cats')}>🐱 Cat Pics</button>
            <button className="chat-chip" onClick={() => handleChipClick('Find documents about machine learning')}>📄 ML Docs</button>
            <button className="chat-chip" onClick={() => handleChipClick('Show files I uploaded last week')}>📅 Last Week</button>
            <button className="chat-chip" onClick={() => handleChipClick('Show all files')}>🌐 Reset</button>
          </div>

          {/* Chat Messages Body */}
          <div className="chat-messages-container">
            {messages.map((msg) => (
              <div key={msg.id} className={`chat-message-row ${msg.sender}`}>
                {msg.sender === 'bot' && <div className="bot-avatar">🤖</div>}
                <div className="chat-bubble-content">
                  <div className={`chat-bubble ${msg.sender}`}>
                    <div className="chat-text">
                      {msg.text.split('\n').map((line, idx) => (
                        <p key={idx}>{line}</p>
                      ))}
                    </div>
                    <span className="chat-time">{msg.timestamp}</span>
                  </div>

                  {/* Inline Quick Action Buttons */}
                  {msg.quickActions && (
                    <div className="inline-quick-actions">
                      {msg.quickActions.map((qa, idx) => (
                        <button
                          key={idx}
                          className="inline-action-btn"
                          onClick={() => handleChipClick(qa.query)}
                        >
                          {qa.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isSearching && (
              <div className="chat-message-row bot">
                <div className="bot-avatar">🤖</div>
                <div className="chat-bubble bot typing-bubble">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '0.78rem', opacity: 0.85, fontWeight: 500 }}>{searchStatus}</span>
                    <div className="typing-dots">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Interactive Chat Panel Input Footer */}
          <div className="chat-popover-footer">
            <div className="chat-footer-input-row">
              <input
                ref={panelInputRef}
                type="text"
                placeholder="Ask follow-up (e.g. 'Only outdoors', 'From last year')..."
                className="chat-footer-input"
                value={chatInputVal}
                onChange={(e) => setChatInputVal(e.target.value)}
                onKeyDown={handleChatPanelKeyDown}
              />
              <button
                className="chat-footer-send-btn"
                onClick={() => {
                  if (chatInputVal.trim()) executeMultimodalSearch(chatInputVal);
                }}
              >
                Send ➤
              </button>
            </div>
            <span className="chat-footer-hint">Press <kbd>Enter</kbd> to search • Context memory enabled</span>
          </div>
        </div>
      )}
    </div>
  );
}
