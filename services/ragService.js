const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs').promises;
const path = require('path');
const pdfParse = require('pdf-parse');

class RAGService {
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.embeddings = null;
    this.documentChunks = [];
    this.chunkEmbeddings = [];
    this.isInitialized = false;
    this.safeMode = false; // When true, degrade gracefully and avoid external calls
    this.maxChunks = parseInt(process.env.RAG_MAX_CHUNKS || '200', 10);
    this.embedOnStart = (process.env.RAG_EMBED_ON_START || 'true').toLowerCase() === 'true';
    this.PDF_PATH = path.join(__dirname, '..', 'data', 'pdfs', 'helpdesk_guide.pdf');
  }

  async initialize() {
    try {
      console.log('Initializing RAG Service...');
      
      // Initialize embeddings model
      this.embeddings = this.genAI.getGenerativeModel({
        model: "models/embedding-001"
      });

      // Load and process PDF
      if (this.embedOnStart) {
        await this.loadAndProcessPDF();
      } else {
        console.log('RAG_EMBED_ON_START=false, skipping embedding generation at startup');
      }
      
      this.isInitialized = true;
      console.log('RAG Service initialized successfully');
    } catch (error) {
      console.error('Error initializing RAG Service:', error);
      this.safeMode = true;
      this.isInitialized = true; // Allow server to boot; RAG will return empty context
      console.warn('RAG Service entered SAFE MODE. Retrieval will return empty context until refreshed.');
    }
  }

  async loadAndProcessPDF() {
    try {
      console.log('Loading PDF document...');
      const pdfBuffer = await fs.readFile(this.PDF_PATH);
      const pdfData = await pdfParse(pdfBuffer);
      const fullText = pdfData.text;

      console.log('Splitting document into chunks...');
      this.documentChunks = this.splitIntoChunks(fullText, 1000, 200);
      console.log(`Created ${this.documentChunks.length} chunks`);

      // Generate embeddings for all chunks
      console.log('Generating embeddings for chunks...');
      await this.generateChunkEmbeddings();

      console.log('PDF processing completed');
    } catch (error) {
      console.error('Error loading and processing PDF:', error);
      throw error;
    }
  }

  splitIntoChunks(text, chunkSize = 1000, overlap = 200) {
    const chunks = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      let chunk = text.slice(start, end);

      // Try to break at sentence boundaries
      if (end < text.length) {
        const lastPeriod = chunk.lastIndexOf('.');
        const lastNewline = chunk.lastIndexOf('\n');
        const breakPoint = Math.max(lastPeriod, lastNewline);
        
        if (breakPoint > start + chunkSize * 0.7) {
          chunk = text.slice(start, start + breakPoint + 1);
          start = start + breakPoint + 1 - overlap;
        } else {
          start = end - overlap;
        }
      } else {
        start = end;
      }

      if (chunk.trim().length > 50) { // Only add chunks with meaningful content
        chunks.push(chunk.trim());
      }
    }

    return chunks;
  }

  async generateChunkEmbeddings() {
    try {
      this.chunkEmbeddings = [];

      const limit = Math.min(this.documentChunks.length, this.maxChunks);
      if (limit < this.documentChunks.length) {
        console.log(`Limiting embeddings to first ${limit} chunks due to RAG_MAX_CHUNKS=${this.maxChunks}`);
      }

      for (let i = 0; i < limit; i++) {
        const chunk = this.documentChunks[i];
        const embedding = await this.getEmbedding(chunk);
        this.chunkEmbeddings.push({
          chunk: chunk,
          embedding: embedding,
          index: i
        });
        
        // Log progress every 10 chunks
        if ((i + 1) % 10 === 0) {
          console.log(`Generated embeddings for ${i + 1}/${limit} chunks`);
        }
      }
      
      console.log('All chunk embeddings generated');
    } catch (error) {
      console.error('Error generating chunk embeddings:', error);
      throw error;
    }
  }

  async getEmbedding(text) {
    try {
      return await this.retryWithBackoff(async () => {
        const result = await this.embeddings.embedContent(text);
        const embedding = result.embedding;
        return embedding.values;
      });
    } catch (error) {
      console.error('Error getting embedding:', error);
      throw error;
    }
  }

  async retryWithBackoff(fn, options = {}) {
    const {
      retries = parseInt(process.env.RAG_RETRY_ATTEMPTS || '3', 10),
      baseDelayMs = parseInt(process.env.RAG_RETRY_BASE_DELAY_MS || '500', 10),
      maxDelayMs = parseInt(process.env.RAG_RETRY_MAX_DELAY_MS || '4000', 10),
    } = options;

    let attempt = 0;
    while (true) {
      try {
        return await fn();
      } catch (err) {
        const status = err && (err.status || err.statusCode);
        const isQuota = status === 429;
        const isRetryable = isQuota || (status >= 500 && status < 600);

        if (attempt >= retries || !isRetryable) {
          throw err;
        }

        const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
        console.warn(`Retrying (${attempt + 1}/${retries}) after ${delay}ms due to error status ${status || 'unknown'}`);
        await new Promise(res => setTimeout(res, delay));
        attempt += 1;
      }
    }
  }

  cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  async searchRelevantContext(query, k = 3) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (this.safeMode || !this.chunkEmbeddings.length) {
        return '';
      }

      console.log(`Searching for relevant context for query: "${query}"`);
      
      // Get embedding for the query
      const queryEmbedding = await this.getEmbedding(query);
      
      // Calculate similarities
      const similarities = this.chunkEmbeddings.map(chunkData => ({
        ...chunkData,
        similarity: this.cosineSimilarity(queryEmbedding, chunkData.embedding)
      }));

      // Sort by similarity and get top k results
      const topResults = similarities
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, k);

      console.log(`Found ${topResults.length} relevant chunks with similarities:`, 
        topResults.map(r => r.similarity.toFixed(3)));

      // Format the relevant content
      const relevantContext = topResults.map((result, index) => {
        return `Relevant Section ${index + 1} (Similarity: ${result.similarity.toFixed(3)}):\n${result.chunk}\n`;
      }).join('\n');

      return relevantContext;
    } catch (error) {
      console.error('Error searching for relevant context:', error);
      // Fallback to empty context
      return '';
    }
  }

  async getRelevantSections(userMessage, maxChunks = 3) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (this.safeMode) {
        return '';
      }

      // Extract key terms from user message for better search
      const searchQuery = this.extractSearchTerms(userMessage);
      
      // Get relevant context
      const relevantContext = await this.searchRelevantContext(searchQuery, maxChunks);
      
      return relevantContext;
    } catch (error) {
      console.error('Error getting relevant sections:', error);
      return '';
    }
  }

  extractSearchTerms(message) {
    // Simple keyword extraction - can be enhanced with NLP
    const keywords = message.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3) // Filter out short words
      .slice(0, 5); // Take first 5 words
    
    return keywords.join(' ');
  }

  async refreshVectorStore() {
    try {
      console.log('Refreshing RAG service...');
      this.isInitialized = false;
      this.safeMode = false;
      this.documentChunks = [];
      this.chunkEmbeddings = [];
      await this.loadAndProcessPDF();
      this.isInitialized = true;
      console.log('RAG service refreshed successfully');
    } catch (error) {
      console.error('Error refreshing RAG service:', error);
      throw error;
    }
  }
}

module.exports = new RAGService(); 