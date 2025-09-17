const ragService = require('../services/ragService');

async function initializeRAG() {
  console.log('Starting RAG service initialization...');
  await ragService.initialize();
  console.log('RAG service initialization completed successfully!');
}

// Run initialization if this script is executed directly
if (require.main === module) {
  initializeRAG().catch((error) => {
    console.error('Error initializing RAG service:', error);
    process.exit(1);
  });
}

module.exports = { initializeRAG }; 