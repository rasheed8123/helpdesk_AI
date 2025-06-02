const express = require('express');
const router = express.Router();
const translationService = require('../services/translationService');
const { authenticateToken } = require('../middleware/auth');

// Get supported languages
router.get('/languages', async (req, res) => {
  try {
    const languages = translationService.getSupportedLanguages();
    res.json(languages);
  } catch (error) {
    console.error('Error fetching languages:', error);
    res.status(500).json({ error: 'Failed to fetch supported languages' });
  }
});

// Translate text
router.post('/translate', async (req, res) => {
  try {
    const { text, targetLanguage } = req.body;
    
    if (!text || !targetLanguage) {
      return res.status(400).json({ error: 'Text and target language are required' });
    }

    if (!process.env.HUGGINGFACE_API_KEY) {
      return res.status(500).json({ error: 'Translation service is not configured' });
    }

    const translatedText = await translationService.translateText(text, targetLanguage);
    res.json({ translatedText });
  } catch (error) {
    console.error('Translation error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router; 