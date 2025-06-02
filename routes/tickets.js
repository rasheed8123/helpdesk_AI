const express = require('express');
const { body, validationResult, param } = require('express-validator');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const { auth, authorize } = require('../middleware/auth');
const { upload } = require('../config/cloudinary');
const AIClassifier = require('../services/aiClassifier');
const responseSuggestionService = require('../services/responseSuggestion');

const router = express.Router();

// @route   GET /api/tickets/stats
// @desc    Get ticket statistics
// @access  Private
router.get('/stats', auth, async (req, res) => {
  try {
    let filter = {};
    
    // Role-based filtering
    switch (req.user.role) {
      case 'employee':
        filter.requester = req.user._id;
        break;
      case 'it':
        filter.$or = [
          { category: 'IT' },
          { assignedTo: req.user._id }
        ];
        break;
      case 'hr':
        filter.$or = [
          { category: 'HR' },
          { assignedTo: req.user._id }
        ];
        break;
      case 'admin':
        filter.$or = [
          { category: 'Admin' },
          { assignedTo: req.user._id }
        ];
        break;
      case 'super-admin':
        // Super admin can see all tickets
        break;
    }

    const statusStats = await Ticket.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const categoryStats = await Ticket.aggregate([
      { $match: filter },
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);

    const priorityStats = await Ticket.aggregate([
      { $match: filter },
      { $group: { _id: '$priority', count: { $sum: 1 } } }
    ]);

    res.json({
      statusStats,
      categoryStats,
      priorityStats
    });
  } catch (error) {
    console.error('Get ticket stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/tickets
// @desc    Get tickets (filtered by role)
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let filter = {};
    
    // Role-based filtering
    if (req.user.role === 'employee') {
      filter.requester = req.user._id;
    } else if (req.user.role === 'it') {
      filter.$or = [
        { category: 'IT' },
        { assignedTo: req.user._id }
      ];
    } else if (req.user.role === 'hr') {
      filter.$or = [
        { category: 'HR' },
        { assignedTo: req.user._id }
      ];
    } else if (req.user.role === 'admin') {
      filter.$or = [
        { category: 'Admin' },
        { assignedTo: req.user._id }
      ];
    }

    // Additional filters
    if (req.query.status) filter.status = req.query.status;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.priority) filter.priority = req.query.priority;
    if (req.query.mood) filter.mood = req.query.mood;

    // Get total count for pagination
    const total = await Ticket.countDocuments(filter);

    // Get paginated tickets
    const tickets = await Ticket.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('requester', 'name email')
      .populate('assignedTo', 'name email');

    res.json({
      tickets,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

// @route   GET /api/tickets/:id
// @desc    Get ticket by ID
// @access  Private
router.get('/:id', auth, [
  param('id').isMongoId().withMessage('Invalid ticket ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const ticket = await Ticket.findById(req.params.id)
      .populate('requester', 'name email role department')
      .populate('assignedTo', 'name email role department')
      .populate('comments.author', 'name email role')
      .populate({
        path: 'history.changedBy',
        select: 'name email role department'
      })
      .populate({
        path: 'statusHistory.changedBy',
        select: 'name email role department'
      });

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Check if user has permission to view this ticket
    const canView = ticket.requester._id.toString() === req.user._id.toString() ||
                   ticket.assignedTo?._id.toString() === req.user._id.toString() ||
                   ['admin', 'super-admin'].includes(req.user.role) ||
                   (req.user.role === 'it' && ticket.category === 'IT') ||
                   (req.user.role === 'hr' && ticket.category === 'HR');

    if (!canView) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({ ticket });
  } catch (error) {
    console.error('Get ticket error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/tickets
// @desc    Create a new ticket
// @access  Private
router.post('/', auth, [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('priority').optional().isIn(['Low', 'Medium', 'High', 'Critical'])
], async (req, res) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, description, priority } = req.body;

    // Use AI to classify the ticket
    const classification = await AIClassifier.classifyTicket(title, description);
    console.log('AI Classification result:', classification);

    // Create new ticket
    const ticket = new Ticket({
      title: title.trim(),
      description: description.trim(),
      category: classification.category,
      priority: priority || 'Medium',
      requester: req.user.id,
      status: 'Open'
    });

    try {
      // Save ticket (ticket number will be generated by the pre-save hook)
      await ticket.save();
      console.log('Ticket saved successfully with number:', ticket.ticketNumber);

      // Populate requester details
      await ticket.populate('requester', 'name email');

      res.status(201).json(ticket);
    } catch (saveError) {
      console.error('Error saving ticket:', saveError);
      if (saveError.code === 11000) {
        // Duplicate ticket number error
        return res.status(500).json({ 
          message: 'Failed to create ticket: Duplicate ticket number',
          error: saveError.message
        });
      }
      throw saveError;
    }
  } catch (error) {
    console.error('Error creating ticket:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: Object.values(error.errors).map(err => ({
          field: err.path,
          message: err.message
        }))
      });
    }
    res.status(500).json({ 
      message: 'Failed to create ticket',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   PUT /api/tickets/:id
// @desc    Update a ticket
// @access  Private
router.put('/:id', auth, async (req, res) => {
  try {
    const { status, priority, assignedTo, category, statusComment, categoryComment } = req.body;
    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Check if user has permission to update the ticket
    const canUpdate = ticket.requester._id.toString() === req.user._id.toString() ||
                     ticket.assignedTo?._id.toString() === req.user._id.toString() ||
                     ['admin', 'super-admin'].includes(req.user.role) ||
                     (req.user.role === 'it' && ticket.category === 'IT') ||
                     (req.user.role === 'hr' && ticket.category === 'HR');

    if (!canUpdate) {
      return res.status(403).json({ message: 'Not authorized to update this ticket' });
    }

    const updates = {};

    // Handle status change
    if (status && status !== ticket.status) {
      updates.status = status;
      if (!updates.$push) {
        updates.$push = { 
          history: [],
          statusHistory: []
        };
      }
      updates.$push.history.push({
        type: 'status',
        oldValue: ticket.status,
        newValue: status,
        changedBy: req.user._id,
        changedAt: new Date(),
        comment: statusComment
      });
      updates.$push.statusHistory.push({
        status: status,
        changedBy: req.user._id,
        changedAt: new Date()
      });

      if (status === 'Resolved') {
        updates.resolvedAt = new Date();
      } else if (status === 'Closed') {
        updates.closedAt = new Date();
      }
    }

    // Handle category change
    if (category && category !== ticket.category) {
      // Only allow non-employee roles to change category
      if (req.user.role === 'employee') {
        return res.status(403).json({ message: 'Employees cannot change ticket categories' });
      }
      
      updates.category = category;
      if (!updates.$push) {
        updates.$push = { history: [] };
      }
      updates.$push.history.push({
        type: 'category',
        oldValue: ticket.category,
        newValue: category,
        changedBy: req.user._id,
        changedAt: new Date(),
        comment: categoryComment
      });
    }

    // Handle other updates
    if (priority) updates.priority = priority;
    if (assignedTo) updates.assignedTo = assignedTo;

    const updatedTicket = await Ticket.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true }
    )
    .populate('requester', 'name email')
    .populate('assignedTo', 'name email')
    .populate('comments.author', 'name email role department')
    .populate({
      path: 'history.changedBy',
      select: 'name email role department'
    })
    .populate({
      path: 'statusHistory.changedBy',
      select: 'name email role department'
    });

    if (!updatedTicket) {
      return res.status(404).json({ message: 'Failed to update ticket' });
    }

    res.json(updatedTicket);
  } catch (error) {
    console.error('Update ticket error:', error);
    res.status(500).json({ 
      message: 'Server error',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// @route   POST /api/tickets/:id/comments
// @desc    Add comment to ticket
// @access  Private
router.post('/:id/comments', auth, [
  param('id').isMongoId().withMessage('Invalid ticket ID'),
  body('content').trim().isLength({ min: 1 }).withMessage('Comment content is required'),
  body('isInternal').optional().isBoolean().withMessage('isInternal must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Check if user has permission to comment
    const canComment = ticket.requester.toString() === req.user._id.toString() ||
                      ticket.assignedTo?.toString() === req.user._id.toString() ||
                      ['admin', 'super-admin'].includes(req.user.role) ||
                      (req.user.role === 'it' && ticket.category === 'IT') ||
                      (req.user.role === 'hr' && ticket.category === 'HR');

    if (!canComment) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { content, isInternal } = req.body;

    // Only staff can make internal comments
    const isStaff = ['admin', 'super-admin', 'it', 'hr'].includes(req.user.role);
    const commentIsInternal = isInternal && isStaff;

    const comment = {
      author: req.user._id,
      content,
      isInternal: commentIsInternal
    };

    ticket.comments.push(comment);
    await ticket.save();

    // Populate the new comment
    await ticket.populate('comments.author', 'name email role');
    const newComment = ticket.comments[ticket.comments.length - 1];

    res.status(201).json({
      message: 'Comment added successfully',
      comment: newComment
    });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/tickets/stats/dashboard
// @desc    Get ticket statistics for dashboard
// @access  Private
router.get('/stats/dashboard', auth, async (req, res) => {
  try {
    let matchFilter = {};
    
    // Role-based filtering for stats
    switch (req.user.role) {
      case 'employee':
        matchFilter.requester = req.user._id;
        break;
      case 'it':
        matchFilter.$or = [
          { category: 'IT' },
          { assignedTo: req.user._id }
        ];
        break;
      case 'hr':
        matchFilter.$or = [
          { category: 'HR' },
          { assignedTo: req.user._id }
        ];
        break;
      case 'admin':
        matchFilter.$or = [
          { category: 'Admin' },
          { assignedTo: req.user._id }
        ];
        break;
      case 'super-admin':
        // No filter for super admin
        break;
    }

    const stats = await Ticket.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const categoryStats = await Ticket.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      }
    ]);

    const priorityStats = await Ticket.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$priority',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      statusStats: stats,
      categoryStats,
      priorityStats
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/tickets/:id/suggestions
// @desc    Get AI-generated response suggestions for a ticket
// @access  Private
router.get('/:id/suggestions', auth, async (req, res) => {
  try {
    console.log('Fetching suggestions for ticket:', req.params.id);
    console.log('User making request:', req.user);
    
    const suggestions = await responseSuggestionService.generateSuggestions(req.params.id);
    console.log('Generated suggestions:', suggestions);
    
    res.json({ suggestions });
  } catch (error) {
    console.error('Get response suggestions error:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).json({ 
      message: 'Error generating response suggestions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Time Traveler department stats endpoint
router.get('/department-stats/:department', auth, async (req, res) => {
  try {
    const { department } = req.params;
    
    // Validate department
    if (!['IT', 'HR', 'Admin'].includes(department)) {
      return res.status(400).json({ 
        message: 'Invalid department. Must be one of: IT, HR, Admin' 
      });
    }

    const stats = await Ticket.getDepartmentStats(department);
    
    if (!stats) {
      return res.status(404).json({ 
        message: 'No historical data found for this department.',
        department
      });
    }

    res.json(stats);
  } catch (error) {
    console.error('Error fetching department stats:', error);
    res.status(500).json({ 
      message: 'Failed to fetch department stats.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
