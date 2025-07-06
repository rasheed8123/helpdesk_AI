# RAG (Retrieval-Augmented Generation) Implementation

## Overview

This implementation replaces the previous approach of sending the entire PDF content in every AI request with a proper RAG system that:

1. **Chunks the PDF document** into smaller, manageable pieces
2. **Generates embeddings** for each chunk using Google's embedding model
3. **Performs semantic search** to find the most relevant content for each query
4. **Retrieves only relevant sections** instead of the entire document

## Architecture

### Components

1. **RAGService** (`services/ragService.js`)
   - Handles PDF processing and chunking
   - Manages embeddings generation and storage
   - Performs semantic search using cosine similarity

2. **Updated AIAssistant** (`services/aiAssistant.js`)
   - Now uses RAG service instead of full PDF content
   - Retrieves only relevant sections for each query
   - More efficient token usage

3. **Initialization Script** (`scripts/initRAG.js`)
   - Pre-processes the PDF on server startup
   - Generates embeddings for all chunks

## How It Works

### 1. Document Processing
- PDF is loaded and split into chunks of ~1000 characters with 200 character overlap
- Each chunk is processed to ensure meaningful content (minimum 50 characters)

### 2. Embedding Generation
- Google's `models/embedding-001` model generates embeddings for each chunk
- Embeddings are stored in memory for fast retrieval

### 3. Semantic Search
- User queries are converted to embeddings
- Cosine similarity is calculated between query and all chunks
- Top-k most similar chunks are retrieved

### 4. Response Generation
- Only relevant chunks are sent to the AI model
- Significantly reduces token usage and improves response quality

## API Endpoints

### Test RAG System
```http
GET /api/assistant/test-rag?query=your_search_query
```

### Refresh RAG System (Admin only)
```http
POST /api/assistant/refresh-rag
Authorization: Bearer <token>
```

## Benefits

1. **Efficiency**: Only relevant content is processed, reducing token usage
2. **Accuracy**: Semantic search finds the most relevant information
3. **Scalability**: Can handle larger documents without hitting context limits
4. **Performance**: Faster response times due to reduced processing

## Configuration

The RAG system uses the following configuration:

- **Chunk Size**: 1000 characters
- **Chunk Overlap**: 200 characters
- **Max Retrieval**: 3 chunks per query (configurable)
- **Embedding Model**: Google's `models/embedding-001`

## Environment Variables

Ensure these are set in your `.env` file:

```env
GEMINI_API_KEY=your_gemini_api_key
```

## Usage Example

### Before (Old Approach)
```javascript
// Entire PDF content was sent in every request
const fullPDFContent = await loadEntirePDF();
const response = await aiModel.generate(fullPDFContent + userQuery);
```

### After (RAG Approach)
```javascript
// Only relevant sections are retrieved
const relevantContent = await ragService.getRelevantSections(userQuery, 3);
const response = await aiModel.generate(relevantContent + userQuery);
```

## Performance Comparison

| Metric | Before (Full PDF) | After (RAG) |
|--------|------------------|-------------|
| Token Usage | ~10,000+ tokens | ~1,000-2,000 tokens |
| Response Time | Slower | Faster |
| Accuracy | Lower (context dilution) | Higher (focused context) |
| Scalability | Limited by context window | Handles large documents |

## Troubleshooting

### Common Issues

1. **RAG Service Not Initialized**
   - Check server logs for initialization errors
   - Ensure PDF file exists at `data/pdfs/helpdesk_guide.pdf`

2. **Embedding Generation Fails**
   - Verify `GEMINI_API_KEY` is set correctly
   - Check API quota and limits

3. **Poor Search Results**
   - Adjust chunk size and overlap parameters
   - Review PDF content quality and structure

### Debug Endpoints

Use the test endpoint to verify RAG functionality:
```bash
curl "http://localhost:5000/api/assistant/test-rag?query=password%20reset"
```

## Future Enhancements

1. **Persistent Storage**: Store embeddings in a vector database
2. **Multiple Documents**: Support for multiple knowledge sources
3. **Advanced Chunking**: Better semantic chunking strategies
4. **Caching**: Cache frequently accessed embeddings
5. **Hybrid Search**: Combine semantic and keyword search 