const { OpenAI } = require('openai');
const config = require('../config');

// Check if OpenAI API key is configured
if (!config.openai?.apiKey) {
  console.warn('Warning: OPENAI_API_KEY is not configured. AI classification will be disabled.');
}

const openai = config.openai?.apiKey ? new OpenAI({
  apiKey: config.openai.apiKey
}) : null;

class AIClassifier {
  static async classifyTicket(title, description) {
    try {
      // If OpenAI is not configured, return a default classification
      if (!openai) {
        return {
          category: 'IT', // Default to IT if AI is not configured
          confidence: 0,
          reason: 'AI classification is disabled. Defaulting to IT category.'
        };
      }

      const prompt = `Analyze the following support ticket and classify it into one of these categories: IT, HR, or Admin.
      Only respond with the category name, nothing else.

      Ticket Title: ${title}
      Ticket Description: ${description}

      Category:`;

      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are a support ticket classifier. Your task is to analyze ticket content and classify it into one of these categories: IT, HR, or Admin. Only respond with the category name."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 10
      });

      const category = response.choices[0].message.content.trim();
      
      // Validate and normalize the category
      const normalizedCategory = this.normalizeCategory(category);
      
      return {
        category: normalizedCategory,
        confidence: 0.95, // Since we're using GPT, we can assume high confidence
        reason: `AI classified this ticket as ${normalizedCategory} based on the content analysis.`
      };
    } catch (error) {
      console.error('AI Classification Error:', error);
      return {
        category: 'IT', // Default to IT on error
        confidence: 0,
        reason: 'Failed to classify ticket. Defaulting to IT category.'
      };
    }
  }

  static normalizeCategory(category) {
    const normalized = category.toLowerCase().trim();
    
    // Map variations to standard categories
    const categoryMap = {
      'it': 'IT',
      'information technology': 'IT',
      'technical': 'IT',
      'tech': 'IT',
      'hr': 'HR',
      'human resources': 'HR',
      'personnel': 'HR',
      'admin': 'Admin',
      'administration': 'Admin',
      'administrative': 'Admin'
    };

    // Default to IT if category is not recognized
    return categoryMap[normalized] || 'IT';
  }
}

module.exports = AIClassifier; 