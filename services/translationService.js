const { HfInference } = require('@huggingface/inference');

class TranslationService {
  constructor() {
    if (!process.env.HUGGINGFACE_API_KEY) {
      console.warn('HUGGINGFACE_API_KEY is not set in environment variables');
    }
    this.hf = new HfInference(process.env.HUGGINGFACE_API_KEY);
    this.supportedLanguages = {
      'en': 'English',
      'es': 'Spanish',
      'fr': 'French',
      'de': 'German',
      'it': 'Italian',
      'pt': 'Portuguese',
      'ru': 'Russian',
      'zh': 'Chinese',
      'ja': 'Japanese',
      'ko': 'Korean',
      'ar': 'Arabic',
      'hi': 'Hindi',
      'bn': 'Bengali',
      'ta': 'Tamil',
      'te': 'Telugu',
      'mr': 'Marathi',
      'gu': 'Gujarati',
      'kn': 'Kannada',
      'ml': 'Malayalam',
      'pa': 'Punjabi'
    };
  }

  async translateText(text, targetLanguage) {
    try {
      if (!this.supportedLanguages[targetLanguage]) {
        throw new Error(`Language ${targetLanguage} is not supported`);
      }

      if (!process.env.HUGGINGFACE_API_KEY) {
        throw new Error('Hugging Face API key is not configured');
      }

      // Use the appropriate model based on the target language
      const model = this.getModelForLanguage(targetLanguage);
      
      const response = await this.hf.translation({
        model: model,
        inputs: text
      });

      return response.translation_text;
    } catch (error) {
      console.error('Translation error:', error);
      throw new Error(`Failed to translate text: ${error.message}`);
    }
  }

  getModelForLanguage(targetLanguage) {
    // Map languages to their appropriate models
    const modelMap = {
      'es': 'Helsinki-NLP/opus-mt-en-es',
      'fr': 'Helsinki-NLP/opus-mt-en-fr',
      'de': 'Helsinki-NLP/opus-mt-en-de',
      'it': 'Helsinki-NLP/opus-mt-en-it',
      'pt': 'Helsinki-NLP/opus-mt-en-pt',
      'ru': 'Helsinki-NLP/opus-mt-en-ru',
      'zh': 'Helsinki-NLP/opus-mt-en-zh',
      'ja': 'Helsinki-NLP/opus-mt-en-jap',
      'ko': 'Helsinki-NLP/opus-mt-en-ko',
      'ar': 'Helsinki-NLP/opus-mt-en-ar',
      'hi': 'Helsinki-NLP/opus-mt-en-hi',
      'bn': 'Helsinki-NLP/opus-mt-en-bn',
      'ta': 'Helsinki-NLP/opus-mt-en-ta',
      'te': 'Helsinki-NLP/opus-mt-en-te',
      'mr': 'Helsinki-NLP/opus-mt-en-mr',
      'gu': 'Helsinki-NLP/opus-mt-en-gu',
      'kn': 'Helsinki-NLP/opus-mt-en-kn',
      'ml': 'Helsinki-NLP/opus-mt-en-ml',
      'pa': 'Helsinki-NLP/opus-mt-en-pa'
    };

    return modelMap[targetLanguage] || 'Helsinki-NLP/opus-mt-en-es'; // Default to Spanish if language not found
  }

  getSupportedLanguages() {
    return this.supportedLanguages;
  }
}

module.exports = new TranslationService(); 