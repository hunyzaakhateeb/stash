const mongoose = require('mongoose');
const File = require('../models/File');
const FileEmbedding = require('../models/FileEmbedding');

let transformers = null;
let pdfParse = null;

// Lazily load ML dependencies with graceful fallback
async function getTransformers() {
  if (!transformers) {
    try {
      transformers = await import('@xenova/transformers');
      // Disable local model directory checks if downloading weights on first run
      transformers.env.allowLocalModels = true;
    } catch (err) {
      console.warn('⚠️ ML Model dependency @xenova/transformers failed to load, using metadata fallback:', err.message);
      return null;
    }
  }
  return transformers;
}

async function getPdfParse() {
  if (!pdfParse) {
    try {
      pdfParse = require('pdf-parse');
    } catch (err) {
      console.warn('⚠️ pdf-parse unavailable:', err.message);
      return null;
    }
  }
  return pdfParse;
}

// Global cache for model instances
let tokenizerInstance = null;
let textModelInstance = null;
let processorInstance = null;
let visionModelInstance = null;

async function loadModels() {
  const tf = await getTransformers();
  if (!tf) return false;

  try {
    const MODEL_ID = 'Xenova/clip-vit-base-patch32';

    if (!tokenizerInstance) {
      tokenizerInstance = await tf.AutoTokenizer.from_pretrained(MODEL_ID);
    }
    if (!textModelInstance) {
      textModelInstance = await tf.CLIPTextModelWithProjection.from_pretrained(MODEL_ID);
    }
    if (!processorInstance) {
      processorInstance = await tf.AutoProcessor.from_pretrained(MODEL_ID);
    }
    if (!visionModelInstance) {
      visionModelInstance = await tf.CLIPVisionModelWithProjection.from_pretrained(MODEL_ID);
    }
    return true;
  } catch (err) {
    console.error('❌ Failed to load CLIP model weights:', err.message);
    return false;
  }
}

// 1. Generate Image Embedding Vector (512 floats)
async function generateImageEmbedding(buffer) {
  const tf = await getTransformers();
  if (!tf) return null;

  const loaded = await loadModels();
  if (!loaded) return null;

  try {
    const rawImage = await tf.RawImage.fromBlob(new Blob([buffer]));
    const imageInputs = await processorInstance(rawImage);
    const { image_embeds } = await visionModelInstance(imageInputs);
    return Array.from(image_embeds.data);
  } catch (err) {
    console.error('Failed to generate image embedding:', err.message);
    return null;
  }
}

// 2. Generate Text Query Embedding Vector (512 floats)
async function generateTextEmbedding(text) {
  const tf = await getTransformers();
  if (!tf) return null;

  const loaded = await loadModels();
  if (!loaded) return null;

  try {
    const textInputs = await tokenizerInstance([text], { padding: true, truncation: true });
    const { text_embeds } = await textModelInstance(textInputs);
    return Array.from(text_embeds.data);
  } catch (err) {
    console.error('Failed to generate text embedding:', err.message);
    return null;
  }
}

// 3. Extract Text from Documents (PDF, TXT, MD, CSV, JSON)
async function extractTextFromDocument(buffer, mimeType, filename) {
  try {
    const ext = (filename || '').split('.').pop().toLowerCase();

    if (mimeType === 'application/pdf' || ext === 'pdf') {
      const pdf = await getPdfParse();
      if (pdf) {
        const data = await pdf(buffer);
        return (data.text || '').trim().slice(0, 4000); // Index first 4k chars
      }
    }

    if (
      mimeType.startsWith('text/') ||
      ['txt', 'md', 'csv', 'json', 'js', 'jsx', 'html', 'css', 'py', 'ts'].includes(ext)
    ) {
      return buffer.toString('utf-8').trim().slice(0, 4000);
    }
  } catch (err) {
    console.warn(`Text extraction warning for ${filename}:`, err.message);
  }
  return '';
}

// 4. Compute Cosine Similarity between 2 vectors
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// 5. Index Single File (Image or Document)
async function indexFile(fileDoc, buffer) {
  try {
    if (!fileDoc || !buffer) return null;

    const fileId = fileDoc._id;
    const userId = fileDoc.userId;
    const isImage = fileDoc.type === 'image' || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(fileDoc.displayName || fileDoc.name);
    const isDocument = fileDoc.type === 'document' || /\.(pdf|doc|docx|txt|xls|xlsx|md|csv|json)$/i.test(fileDoc.displayName || fileDoc.name);

    let embedding = null;
    let embeddingType = 'text';
    let extractedText = '';

    if (isImage) {
      embeddingType = 'image';
      embedding = await generateImageEmbedding(buffer);
    } else if (isDocument) {
      embeddingType = 'text';
      extractedText = await extractTextFromDocument(buffer, fileDoc.mimeType, fileDoc.displayName || fileDoc.name);
      const textToIndex = `${fileDoc.displayName} ${extractedText}`.trim();
      embedding = await generateTextEmbedding(textToIndex);
    } else {
      // General file metadata fallback text embedding
      const textToIndex = `${fileDoc.displayName} ${fileDoc.type}`;
      embedding = await generateTextEmbedding(textToIndex);
    }

    if (embedding) {
      // Upsert vector embedding in database with strict userId tag
      const fileEmb = await FileEmbedding.findOneAndUpdate(
        { fileId, userId },
        {
          fileId,
          userId,
          embedding,
          embeddingType,
          extractedText,
          model: 'Xenova/clip-vit-base-patch32',
          createdAt: new Date()
        },
        { upsert: true, new: true }
      );
      return fileEmb;
    }
  } catch (err) {
    console.error(`Indexing failed for file ${fileDoc._id}:`, err.message);
  }
  return null;
}

// 6. Conversational Hybrid Multimodal Vector & Metadata Search Engine
async function hybridSearch({ userId, queryText, contextHistory = [] }) {
  try {
    if (!userId) throw new Error('Unauthorized search request');

    const cleanQuery = (queryText || '').trim();
    const lowerQuery = cleanQuery.toLowerCase();

    // Context awareness: combine turn history filters
    let targetType = null;
    let dateFilter = null;
    let isFavoriteOnly = false;
    let isTrashOnly = false;

    const fullTurnContext = [...contextHistory.map(c => c.text || ''), cleanQuery].join(' ').toLowerCase();

    if (fullTurnContext.includes('photo') || fullTurnContext.includes('picture') || fullTurnContext.includes('image')) {
      targetType = 'image';
    } else if (fullTurnContext.includes('video') || fullTurnContext.includes('movie')) {
      targetType = 'video';
    } else if (fullTurnContext.includes('document') || fullTurnContext.includes('pdf') || fullTurnContext.includes('doc')) {
      targetType = 'document';
    } else if (fullTurnContext.includes('audio') || fullTurnContext.includes('song') || fullTurnContext.includes('music')) {
      targetType = 'audio';
    }

    if (fullTurnContext.includes('favorite') || fullTurnContext.includes('starred')) {
      isFavoriteOnly = true;
    }
    if (fullTurnContext.includes('trash') || fullTurnContext.includes('deleted')) {
      isTrashOnly = true;
    }

    // Relative date range filter derivation
    if (fullTurnContext.includes('last week')) {
      dateFilter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    } else if (fullTurnContext.includes('last month')) {
      dateFilter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    } else if (fullTurnContext.includes('last year')) {
      dateFilter = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    }

    // 1. Fetch User's Metadata Candidates with Strict User Isolation
    const metadataQuery = { userId: new mongoose.Types.ObjectId(userId) };
    if (isTrashOnly) {
      metadataQuery.isTrashed = true;
    } else {
      metadataQuery.isTrashed = false;
    }
    if (isFavoriteOnly) metadataQuery.isFavorite = true;
    if (dateFilter) metadataQuery.createdAt = { $gte: dateFilter };

    const userFiles = await File.find(metadataQuery).sort({ createdAt: -1 });
    if (userFiles.length === 0) {
      return {
        matchedFiles: [],
        count: 0,
        summary: `I couldn't find any files matching your search criteria.`
      };
    }

    // 2. Generate Query Text Vector Embedding
    let queryVector = null;
    if (cleanQuery) {
      queryVector = await generateTextEmbedding(cleanQuery);
    }

    // 3. Fetch Stored Vector Embeddings for User Files
    const fileIds = userFiles.map(f => f._id);
    const storedEmbeddings = await FileEmbedding.find({
      userId: new mongoose.Types.ObjectId(userId),
      fileId: { $in: fileIds }
    });

    const embeddingMap = new Map();
    storedEmbeddings.forEach(e => {
      embeddingMap.set(e.fileId.toString(), e);
    });

    // 4. Calculate Multimodal Hybrid Scores for Each File
    const scoredFiles = userFiles.map(file => {
      let score = 0;
      let vectorSim = 0;

      const fileIdStr = file._id.toString();
      const storedEmb = embeddingMap.get(fileIdStr);

      // A. Vector Similarity Score (Weight: 55%)
      if (queryVector && storedEmb && storedEmb.embedding) {
        vectorSim = cosineSimilarity(queryVector, storedEmb.embedding);
        score += vectorSim * 0.55;
      }

      // B. Metadata Name & Extracted Text Match (Weight: 30%)
      const fname = (file.displayName || file.name || '').toLowerCase();
      let textMatch = 0;

      if (cleanQuery) {
        // Direct word matches
        const terms = lowerQuery.split(/\s+/).filter(t => t.length > 2);
        terms.forEach(term => {
          if (fname.includes(term)) textMatch += 0.3;
          if (storedEmb && storedEmb.extractedText && storedEmb.extractedText.toLowerCase().includes(term)) {
            textMatch += 0.2;
          }
        });
      }
      score += Math.min(textMatch, 1.0) * 0.30;

      // C. Type Match Bonus (Weight: 15%)
      if (targetType) {
        const isTypeMatch =
          targetType === 'image' ? (file.type === 'image' || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(fname)) :
          targetType === 'video' ? (file.type === 'video' || /\.(mp4|mov|webm|mkv)$/i.test(fname)) :
          targetType === 'document' ? (file.type === 'document' || /\.(pdf|doc|docx|txt|xls|xlsx)$/i.test(fname)) :
          targetType === 'audio' ? (file.type === 'audio' || /\.(mp3|wav|ogg)$/i.test(fname)) : false;

        if (isTypeMatch) score += 0.15;
      }

      return {
        file,
        score,
        vectorSim
      };
    });

    // Filter candidates by similarity or relevance threshold if query present
    let finalRanked = scoredFiles;
    if (cleanQuery) {
      finalRanked = scoredFiles.filter(item => item.score > 0.05 || item.vectorSim > 0.18);
      // Sort descending by hybrid score
      finalRanked.sort((a, b) => b.score - a.score);
    }

    const matchedFiles = finalRanked.map(item => item.file);

    // 5. Generate Short Concise Conversational Response Summary
    let summaryText = "";
    const count = matchedFiles.length;

    if (count === 0) {
      summaryText = `I couldn't find any files matching "${cleanQuery}".`;
    } else {
      const typeLabel = targetType ? `${targetType} file(s)` : 'file(s)';
      summaryText = `I found ${count} ${typeLabel} matching your query.`;
    }

    return {
      matchedFiles,
      count,
      summary: summaryText
    };
  } catch (err) {
    console.error('Hybrid search error:', err);
    throw err;
  }
}

// 7. Batch Index Existing Un-indexed Files
async function indexExistingFilesForUser(userId, gridfsBucket) {
  try {
    if (!userId || !gridfsBucket) return 0;

    const userFiles = await File.find({ userId: new mongoose.Types.ObjectId(userId) });
    const existingEmbeddings = await FileEmbedding.find({ userId: new mongoose.Types.ObjectId(userId) }).select('fileId');
    const indexedSet = new Set(existingEmbeddings.map(e => e.fileId.toString()));

    const unindexedFiles = userFiles.filter(f => !indexedSet.has(f._id.toString()));
    let indexedCount = 0;

    for (const fileDoc of unindexedFiles) {
      try {
        const downloadStream = gridfsBucket.openDownloadStream(fileDoc.gridFsFileId);
        const chunks = [];
        for await (const chunk of downloadStream) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        const result = await indexFile(fileDoc, buffer);
        if (result) indexedCount++;
      } catch (fileErr) {
        console.warn(`Failed to index existing file ${fileDoc._id}:`, fileErr.message);
      }
    }

    return indexedCount;
  } catch (err) {
    console.error('Batch indexing error:', err.message);
    return 0;
  }
}

module.exports = {
  generateImageEmbedding,
  generateTextEmbedding,
  extractTextFromDocument,
  indexFile,
  hybridSearch,
  indexExistingFilesForUser
};
