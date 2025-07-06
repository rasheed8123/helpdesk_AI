const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const AIAssistant = require('../services/aiAssistant');
const ragService = require('../services/ragService');

const router = express.Router();

// @route   POST /api/assistant/chat
// @desc    Process a message and get AI response
// @access  Public/Private
router.post('/chat', [
  body('message').trim().notEmpty().withMessage('Message is required'),
  body('isPublic').optional().isBoolean().withMessage('isPublic must be a boolean'),
  body('userId').optional().notEmpty().withMessage('User ID is required for authenticated requests'),
  body('userRole').optional().notEmpty().withMessage('User role is required for authenticated requests')
], async (req, res) => {
  try {
    console.log('Received chat request:', {
      message: req.body.message,
      isPublic: req.body.isPublic,
      userId: req.body.userId,
      userRole: req.body.userRole
    });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { message, isPublic, userId, userRole } = req.body;

    // If not public, require authentication
    // if (!isPublic) {
    //   const authError = auth(req, res, () => {});
    //   if (authError) {
    //     return authError;
    //   }
    // }

    console.log('Processing message with AI Assistant...');
    const response = await AIAssistant.processMessage(message, userId, userRole, isPublic);
    console.log('AI Assistant response:', response);

    res.json({ response });
  } catch (error) {
    console.error('Assistant chat error:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).json({ 
      message: 'Error processing message',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Process voice input and generate ticket details
router.post('/voice-ticket', async (req, res) => {
  try {
    const { speech } = req.body;

    if (!speech) {
      return res.status(400).json({ error: 'Speech input is required' });
    }

    // Process the speech using AI
    const ticketDetails = await AIAssistant.processVoiceTicket(speech);

    res.json(ticketDetails);
  } catch (error) {
    console.error('Error processing voice ticket:', error);
    res.status(500).json({ error: 'Failed to process voice ticket' });
  }
});

// Summarize ticket
router.post('/summarize-ticket', auth, async (req, res) => {
  try {
    console.log('Received summarize ticket request:', req.body);
    const { ticketData } = req.body;

    if (!ticketData) {
      console.error('Missing ticket data in request');
      return res.status(400).json({ error: 'Ticket data is required' });
    }

    // Generate summary using AI
    console.log('Generating summary for ticket data:', ticketData);
    const summary = await AIAssistant.summarizeTicket(ticketData);
    console.log('Summary generated successfully');

    res.json({ summary });
  } catch (error) {
    console.error('Error in summarize-ticket endpoint:', error);
    res.status(500).json({ 
      error: 'Failed to generate summary',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Test RAG system endpoint
router.get('/test-rag', async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    console.log('Testing RAG system with query:', query);
    
    // Test the RAG system
    const relevantContent = await ragService.getRelevantSections(query, 2);
    
    res.json({
      query,
      relevantContent,
      message: 'RAG system test completed successfully'
    });
  } catch (error) {
    console.error('RAG test error:', error);
    res.status(500).json({ 
      error: 'Failed to test RAG system',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Refresh RAG system endpoint
router.post('/refresh-rag', auth, async (req, res) => {
  try {
    console.log('Refreshing RAG system...');
    
    await ragService.refreshVectorStore();
    
    res.json({
      message: 'RAG system refreshed successfully'
    });
  } catch (error) {
    console.error('RAG refresh error:', error);
    res.status(500).json({ 
      error: 'Failed to refresh RAG system',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router; 