const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema({
  filename: String,
  originalName: String,
  url: String,
  size: Number,
  mimetype: String,
  uploadedAt: Date
});

const commentSchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: [true, 'Comment content is required'],
    trim: true,
    maxLength: [1000, 'Comment cannot exceed 1000 characters']
  },
  isInternal: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

const historySchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['status', 'category', 'priority', 'assignment'],
    required: true
  },
  oldValue: String,
  newValue: String,
  comment: String,
  changedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  changedAt: {
    type: Date,
    default: Date.now
  }
});

const statusHistorySchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['Open', 'In Progress', 'Resolved', 'Closed'],
    required: true
  },
  changedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  changedAt: {
    type: Date,
    default: Date.now
  }
});

const ticketSchema = new mongoose.Schema({
  ticketNumber: {
    type: String,
    unique: true,
    required: function() {
      return !this.isNew; // Only required for existing documents
    }
  },
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxLength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    maxLength: [2000, 'Description cannot exceed 2000 characters']
  },
  mood: {
    type: String,
    enum: ['angry', 'frustrated', 'neutral', 'satisfied', 'urgent'],
    default: 'neutral'
  },
  category: {
    type: String,
    enum: ['IT', 'HR', 'Admin'],
    required: [true, 'Category is required']
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Critical'],
    default: 'Medium'
  },
  status: {
    type: String,
    enum: ['Open', 'In Progress', 'Resolved', 'Closed'],
    default: 'Open'
  },
  history: [historySchema],
  statusHistory: [statusHistorySchema],
  requester: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  comments: [commentSchema],
  attachments: [attachmentSchema],
  resolvedAt: {
    type: Date,
    default: null
  },
  closedAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for better query performance
ticketSchema.index({ category: 1, status: 1 });
ticketSchema.index({ requester: 1 });
ticketSchema.index({ assignedTo: 1 });
ticketSchema.index({ createdAt: -1 });

// Combined pre-save hook for ticket number generation and auto-assignment
ticketSchema.pre('save', async function(next) {
  try {
    // Generate ticket number for new tickets
    if (this.isNew) {
      const prefix = 'TKT';
      const year = new Date().getFullYear();
      const month = String(new Date().getMonth() + 1).padStart(2, '0');
      
      // Find the latest ticket number for this month
      const latestTicket = await this.constructor.findOne({
        ticketNumber: new RegExp(`^${prefix}${year}${month}`)
      }).sort({ ticketNumber: -1 });

      let sequence = 1;
      if (latestTicket) {
        // Extract the sequence number from the latest ticket
        const lastSequence = parseInt(latestTicket.ticketNumber.slice(-4));
        sequence = lastSequence + 1;
      }

      // Format: TKT2024030001
      this.ticketNumber = `${prefix}${year}${month}${String(sequence).padStart(4, '0')}`;
      console.log('Generated ticket number:', this.ticketNumber);

      // Analyze mood based on content
      const angryKeywords = ['angry', 'furious', 'terrible', 'horrible', 'worst', 'unacceptable', 'outrageous'];
      const frustratedKeywords = ['frustrated', 'annoyed', 'disappointed', 'upset', 'tired', 'fed up'];
      const urgentKeywords = ['urgent', 'emergency', 'asap', 'immediately', 'critical', 'important'];
      const satisfiedKeywords = ['thank', 'appreciate', 'good', 'great', 'excellent', 'happy'];

      const content = (this.title + ' ' + this.description).toLowerCase();
      
      if (angryKeywords.some(keyword => content.includes(keyword))) {
        this.mood = 'angry';
      } else if (frustratedKeywords.some(keyword => content.includes(keyword))) {
        this.mood = 'frustrated';
      } else if (urgentKeywords.some(keyword => content.includes(keyword))) {
        this.mood = 'urgent';
      } else if (satisfiedKeywords.some(keyword => content.includes(keyword))) {
        this.mood = 'satisfied';
      } else {
        this.mood = 'neutral';
      }
    }

    // Handle auto-assignment if needed
    if (this.isNew && !this.assignedTo) {
      const User = mongoose.model('User');
      let assignableRoles = [];
      
      switch (this.category) {
        case 'IT':
          assignableRoles = ['it'];
          break;
        case 'HR':
          assignableRoles = ['hr'];
          break;
        case 'Admin':
          assignableRoles = ['admin'];
          break;
      }
      
      // Find available users who can handle this ticket type
      const availableAgents = await User.find({
        role: { $in: assignableRoles },
        isActive: true
      });
      
      if (availableAgents.length > 0) {
        // Simple round-robin assignment
        const randomAgent = availableAgents[Math.floor(Math.random() * availableAgents.length)];
        this.assignedTo = randomAgent._id;
      } else {
        // If no specific role is available, assign to super-admin as fallback
        const superAdmin = await User.findOne({ role: 'super-admin', isActive: true });
        if (superAdmin) {
          this.assignedTo = superAdmin._id;
        }
      }
    }

    this.updatedAt = new Date();
    next();
  } catch (error) {
    console.error('Error in pre-save hook:', error);
    next(error);
  }
});

// Add department stats for Time Traveler preview
ticketSchema.statics.getDepartmentStats = async function(department) {
  // Find tickets for the department that are closed or resolved
  const tickets = await this.find({
    category: department,
    status: { $in: ['Closed', 'Resolved'] }
  }).lean();

  if (!tickets.length) return null;

  // Average number of steps (status changes)
  const avgSteps = tickets.reduce((sum, t) => sum + (t.statusHistory?.length || 0), 0) / tickets.length;

  // Average resolution time (in hours)
  const avgResolutionTime = tickets.reduce((sum, t) => {
    const created = new Date(t.createdAt);
    const closed = t.statusHistory?.findLast(h => h.status === 'Closed' || h.status === 'Resolved');
    if (!closed) return sum;
    const closedAt = new Date(closed.changedAt);
    return sum + (closedAt - created) / (1000 * 60 * 60);
  }, 0) / tickets.length;

  // Most common departments involved (assignedTo or comment authors)
  const deptCount = {};
  tickets.forEach(t => {
    if (t.assignedTo?.department) {
      deptCount[t.assignedTo.department] = (deptCount[t.assignedTo.department] || 0) + 1;
    }
    t.comments?.forEach(c => {
      if (c.author?.department) {
        deptCount[c.author.department] = (deptCount[c.author.department] || 0) + 1;
      }
    });
  });
  const sortedDepts = Object.entries(deptCount).sort((a, b) => b[1] - a[1]);
  const topDepts = sortedDepts.slice(0, 2).map(([dept]) => dept);

  return {
    avgSteps: Math.round(avgSteps),
    avgResolutionTime: Math.round(avgResolutionTime),
    topDepts
  };
};

module.exports = mongoose.model('Ticket', ticketSchema);
