const OpenAI = require('openai');
const Ticket = require('../models/Ticket');

class ResponseSuggestionService {
  constructor() {
    console.log('Initializing ResponseSuggestionService');
    console.log('OpenAI API Key available:', !!process.env.OPENAI_API_KEY);
    
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async generateSuggestions(ticketId) {
    try {
      console.log('Starting suggestion generation for ticket:', ticketId);
      
      // Get ticket with its history and comments
      const ticket = await Ticket.findById(ticketId)
        .populate('comments.author', 'name role')
        .populate('history.changedBy', 'name role')
        .populate('requester', 'name role department');

      if (!ticket) {
        console.error('Ticket not found:', ticketId);
        throw new Error('Ticket not found');
      }

      console.log('Found ticket:', {
        id: ticket._id,
        title: ticket.title,
        category: ticket.category,
        status: ticket.status,
        commentsCount: ticket.comments.length
      });

      // Prepare context for the AI
      const context = this.prepareContext(ticket);
      console.log('Prepared context:', context);

      // Generate suggestions using OpenAI
      console.log('Calling OpenAI API...');
      const suggestions = await this.generateAIResponse(context);
      console.log('Received suggestions from OpenAI:', suggestions);

      return suggestions;
    } catch (error) {
      console.error('Error in generateSuggestions:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      throw error;
    }
  }

  prepareContext(ticket) {
    console.log('Preparing context for ticket:', ticket._id);
    
    const context = {
      ticketInfo: {
        title: ticket.title,
        description: ticket.description,
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        requester: {
          name: ticket.requester.name,
          role: ticket.requester.role,
          department: ticket.requester.department
        }
      },
      conversationHistory: [],
      previousResponses: []
    };

    // Add comments to conversation history
    ticket.comments.forEach(comment => {
      context.conversationHistory.push({
        role: comment.author.role,
        name: comment.author.name,
        content: comment.content,
        isInternal: comment.isInternal,
        timestamp: comment.createdAt
      });
    });

    // Add status changes and other history
    ticket.history.forEach(change => {
      context.conversationHistory.push({
        type: 'system',
        action: `${change.type} changed from ${change.oldValue} to ${change.newValue}`,
        by: change.changedBy.name,
        timestamp: change.changedAt
      });
    });

    // Sort conversation history by timestamp
    context.conversationHistory.sort((a, b) => a.timestamp - b.timestamp);

    console.log('Context prepared with:', {
      ticketInfo: context.ticketInfo,
      historyLength: context.conversationHistory.length
    });

    return context;
  }

  async generateAIResponse(context) {
    console.log('Generating AI response with context');
    
    const prompt = this.buildPrompt(context);
    console.log('Built prompt:', prompt);

    try {
      console.log('Making OpenAI API call...');
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: `You are a helpful support agent assistant. Generate 3 different response suggestions for the following ticket. 
            Each response should be exactly 2 sentences long - no more, no less.
            
            If the user is an employee:
            - First sentence: Show understanding and acceptance of the instructions/guidance
            - Second sentence: Confirm compliance and willingness to follow through
            - Use a more accepting and obedient tone
            - Acknowledge authority of the support staff
            
            If the user is staff (HR, IT, admin, super-admin):
            - First sentence: Acknowledge the issue and show empathy
            - Second sentence: Provide a clear next step or solution
            - Use a professional and authoritative tone
            - Focus on providing guidance and solutions
            
            Guidelines for suggestions:
            1. Keep responses to exactly 2 sentences
            2. Adapt tone based on user role
            3. Show appropriate level of authority/acceptance
            4. Maintain professional tone
            5. Consider the user's role and technical expertise`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      });

      console.log('OpenAI API response received:', completion);
      
      const parsedResponse = this.parseAIResponse(completion.choices[0].message.content);
      console.log('Parsed AI response:', parsedResponse);
      
      return parsedResponse;
    } catch (error) {
      console.error('Error in OpenAI API call:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      throw error;
    }
  }

  buildPrompt(context) {
    const isEmployee = context.ticketInfo.requester.role === 'employee';
    const roleSpecificInstructions = isEmployee ? 
      `As an employee, generate responses that show understanding and acceptance of the support staff's guidance.` :
      `As support staff, generate responses that provide clear guidance and solutions.`;

    return `
Ticket Information:
Title: ${context.ticketInfo.title}
Category: ${context.ticketInfo.category}
Priority: ${context.ticketInfo.priority}
Status: ${context.ticketInfo.status}
Requester: ${context.ticketInfo.requester.name} (${context.ticketInfo.requester.role})

Description:
${context.ticketInfo.description}

Conversation History:
${context.conversationHistory.map(msg => 
  `[${msg.timestamp.toISOString()}] ${msg.role || msg.type}: ${msg.content || msg.action}`
).join('\n')}

${roleSpecificInstructions}

Please generate 3 different response suggestions that would be appropriate for this ticket. Each response must be exactly 2 sentences long:

${isEmployee ? 
`For employee responses:
- First sentence: Show understanding and acceptance of the guidance
- Second sentence: Confirm compliance and willingness to follow through` :
`For staff responses:
- First sentence: Acknowledge the issue and show empathy
- Second sentence: Provide a clear next step or solution`}

Format each suggestion as:
Suggestion 1:
[Response]
Rationale: [Why this response is appropriate]

Suggestion 2:
[Response]
Rationale: [Why this response is appropriate]

Suggestion 3:
[Response]
Rationale: [Why this response is appropriate]`;
  }

  parseAIResponse(response) {
    console.log('Parsing AI response:', response);
    
    // Split the response into individual suggestions
    const suggestions = response.split(/\n\nSuggestion \d+:/).filter(Boolean);
    
    const parsedSuggestions = suggestions.map(suggestion => {
      const [response, rationale] = suggestion.split('Rationale:').map(s => s.trim());
      return {
        response: response.replace(/^\[Response\]\n/, '').trim(),
        rationale: rationale.trim()
      };
    });

    console.log('Parsed suggestions:', parsedSuggestions);
    return parsedSuggestions;
  }
}

module.exports = new ResponseSuggestionService(); 