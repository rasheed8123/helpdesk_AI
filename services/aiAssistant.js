const { GoogleGenerativeAI } = require("@google/generative-ai");
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const fs = require('fs').promises;
const path = require('path');
const pdfParse = require('pdf-parse');

// Initialize Google Generative AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// PDF file path - corrected to point to the root server directory
const PDF_PATH = path.join(__dirname, '..', 'data', 'pdfs', 'helpdesk_guide.pdf');

class AIAssistant {
  static async processMessage(message, userId = null, userRole = null, isPublic = false) {
    try {
      console.log('Processing message:', { message, userId, userRole, isPublic });

      let context = {};
      
      if (!isPublic) {
        // Get user data for authenticated users
        const user = await User.findById(userId);
        if (!user) {
          throw new Error('User not found');
        }

        // Get user's tickets
        const tickets = await Ticket.find({ requester: userId })
          .sort({ createdAt: -1 })
          .limit(5)
          .populate('assignedTo', 'name email');

        // Get user's recent activity
        const recentActivity = await Ticket.find({ requester: userId })
          .sort({ updatedAt: -1 })
          .limit(3)
          .select('title status updatedAt');

        context = {
          user: {
            name: user.name,
            email: user.email,
            role: userRole,
            department: user.department
          },
          tickets: tickets.map(ticket => ({
            title: ticket.title,
            status: ticket.status,
            category: ticket.category,
            priority: ticket.priority,
            createdAt: ticket.createdAt,
            assignedTo: ticket.assignedTo ? {
              name: ticket.assignedTo.name,
              email: ticket.assignedTo.email
            } : null
          })),
          recentActivity: recentActivity.map(activity => ({
            title: activity.title,
            status: activity.status,
            updatedAt: activity.updatedAt
          }))
        };
      }

      // Get PDF content
      let pdfContent = '';
      try {
        console.log('Attempting to read PDF from:', PDF_PATH);
        const pdfBuffer = await fs.readFile(PDF_PATH);
        const pdfData = await pdfParse(pdfBuffer);
        pdfContent = pdfData.text;
        console.log('Successfully read PDF content');
      } catch (error) {
        console.error('Error reading PDF:', error);
        pdfContent = 'PDF content not available';
      }

      // Add PDF content to context
      context.pdfContent = pdfContent;

      // Generate response using the model
      const response = await this.generateResponseWithGemini(message, context, isPublic);
      return response;
    } catch (error) {
      console.error('Error in processMessage:', error);
      throw error;
    }
  }

  static async generateResponseWithGemini(message, context, isPublic) {
    try {
      // Initialize the model
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 150,
        }
      });

      // Start a chat session
      const chat = model.startChat({
        history: [],
      });

      // Prepare the prompt
      const prompt = this.buildPrompt(message, context, isPublic);

      // Send the message and get the response
      const result = await chat.sendMessage(prompt);
      const response = result.response;

      if (!response || !response.text()) {
        throw new Error('No response from Gemini');
      }

      return response.text();
    } catch (error) {
      console.error('Error generating response with Gemini:', error);
      
      if (error.message) {
        console.error('Gemini API Error:', error.message);
      }
      
      return this.generateFallbackResponse(message, context, isPublic);
    }
  }

  static buildPrompt(message, context, isPublic) {
    let prompt = `You are a concise AI assistant for a helpdesk system. Provide a brief response (2-3 sentences) using the following context:

Helpdesk Guide Content:
${context.pdfContent}

User Message: ${message}

Instructions:
1. Keep your response to 2-3 sentences maximum
2. Be direct and clear
3. Focus on the most relevant information
4. If the answer is not in the helpdesk guide, respond with ONLY: "Please create a ticket."
5. For public queries, only use information from the helpdesk guide
6. Do not mention the guide or any other context in your response
7. Do not include any other text or explanations

Response:`;

    if (!isPublic) {
      prompt = `You are a concise AI assistant for a helpdesk system. Provide a brief response (2-3 sentences) using the following context:

User Information:
- Name: ${context.user.name}
- Role: ${context.user.role}
- Department: ${context.user.department}

Recent Tickets:
${context.tickets.map(ticket => `
- Title: ${ticket.title}
  Status: ${ticket.status}
  Category: ${ticket.category}
  Priority: ${ticket.priority}
  Created: ${new Date(ticket.createdAt).toLocaleDateString()}
  Assigned To: ${ticket.assignedTo ? ticket.assignedTo.name : 'Unassigned'}
`).join('\n')}

Recent Activity:
${context.recentActivity.map(activity => `
- ${activity.title} (${activity.status}) - Updated: ${new Date(activity.updatedAt).toLocaleDateString()}
`).join('\n')}

Helpdesk Guide Content:
${context.pdfContent}

User Message: ${message}

Instructions:
1. Keep your response to 2-3 sentences maximum
2. Be direct and clear
3. Focus on the most relevant information
4. If the answer is not in the helpdesk guide, respond with ONLY: "Please create a ticket."
5. Use the helpdesk guide content to provide accurate information
6. Do not mention the guide or any other context in your response
7. Do not include any other text or explanations

Response:`;
    }

    return prompt;
  }

  static generateFallbackResponse(message, context, isPublic) {
    return "Please create a ticket.";
  }

  static async processVoiceTicket(speech) {
    try {
      // Initialize the model
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 500,
        }
      });

      // Start a chat session
      const chat = model.startChat({
        history: [],
      });

      // Prepare the prompt
      const prompt = `You are a helpdesk ticket processor. Analyze the following user speech and generate a structured ticket with the following fields:
1. title: A concise, clear title (max 100 characters)
2. description: A detailed description of the issue
3. category: One of [IT, HR, Admin, Facilities, Other]
4. priority: One of [Low, Medium, High, Critical]

User Speech: "${speech}"

Instructions:
1. Extract the key information from the speech
2. Generate a clear, concise title
3. Create a detailed description
4. Determine the most appropriate category
5. Assess the priority based on the issue's urgency
6. Return ONLY a valid JSON object with the following structure:
{
  "title": "string",
  "description": "string",
  "category": "string",
  "priority": "string"
}

Do not include any markdown formatting, code blocks, or additional text. Return only the JSON object.`;

      // Send the message and get the response
      const result = await chat.sendMessage(prompt);
      const response = result.response;

      if (!response || !response.text()) {
        throw new Error('No response from Gemini');
      }

      // Clean the response text to ensure it's valid JSON
      const cleanedResponse = response.text()
        .replace(/```json\s*|\s*```/g, '') // Remove markdown code block markers
        .replace(/^[\s\n]+|[\s\n]+$/g, ''); // Remove leading/trailing whitespace

      // Parse the JSON response
      const ticketDetails = JSON.parse(cleanedResponse);

      // Validate the response
      if (!ticketDetails.title || !ticketDetails.description || !ticketDetails.category || !ticketDetails.priority) {
        throw new Error('Invalid ticket details generated');
      }

      return ticketDetails;
    } catch (error) {
      console.error('Error processing voice ticket:', error);
      throw error;
    }
  }

  static async summarizeTicket(ticketData) {
    try {
      console.log('Starting ticket summarization with data:', ticketData);
      
      // Initialize the model
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1000,
        }
      });

      console.log('Model initialized, starting chat session');
      // Start a chat session
      const chat = model.startChat({
        history: [],
      });

      // Prepare the prompt
      const prompt = `You are a helpdesk ticket summarizer. Create a comprehensive summary of the following ticket:

Ticket Details:
Title: ${ticketData.title}
Category: ${ticketData.category}
Priority: ${ticketData.priority}
Status: ${ticketData.status}

Description:
${ticketData.description}

Comments:
${ticketData.comments.map(comment => `
- ${comment.user.name} (${new Date(comment.createdAt).toLocaleString()}):
  ${comment.content}
`).join('\n')}

Instructions:
1. Create a clear, concise summary of the ticket
2. Include key points from the description and comments
3. Highlight any important updates or status changes
4. Format the summary in paragraphs for better readability
5. Keep the tone professional and objective
6. Focus on the most relevant information

Summary:`;

      console.log('Sending prompt to model');
      // Send the message and get the response
      const result = await chat.sendMessage(prompt);
      const response = result.response;

      if (!response || !response.text()) {
        console.error('No response from model');
        throw new Error('No response from AI model');
      }

      console.log('Successfully generated summary');
      return response.text();
    } catch (error) {
      console.error('Error in summarizeTicket:', error);
      throw new Error(`Failed to generate summary: ${error.message}`);
    }
  }
}

module.exports = AIAssistant; 