const express = require('express');
const { auth, authorize } = require('../middleware/auth');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const router = express.Router();

// Middleware to check if user is admin, hr, or it
const isAdminOrStaff = (req, res, next) => {
  if (!['admin', 'hr', 'it', 'super-admin'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied' });
  }
  next();
};

// @route   GET /api/admin/dashboard
// @desc    Get dashboard analytics
// @access  Private (Admin/HR/IT)
router.get('/dashboard', auth, isAdminOrStaff, async (req, res) => {
  try {
    // Get ticket statistics
    const ticketStats = await Ticket.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get category statistics
    const categoryStats = await Ticket.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get priority statistics
    const priorityStats = await Ticket.aggregate([
      {
        $group: {
          _id: '$priority',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get recent tickets
    const recentTickets = await Ticket.find()
      .populate('requester', 'name email')
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 })
      .limit(5);

    // Get user statistics
    const userStats = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get department statistics
    const departmentStats = await User.aggregate([
      {
        $group: {
          _id: '$department',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get ticket resolution time statistics
    const resolutionTimeStats = await Ticket.aggregate([
      {
        $match: {
          status: { $in: ['Resolved', 'Closed'] }
        }
      },
      {
        $project: {
          resolutionTime: {
            $divide: [
              { $subtract: ['$resolvedAt', '$createdAt'] },
              1000 * 60 * 60 // Convert to hours
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          avgResolutionTime: { $avg: '$resolutionTime' },
          minResolutionTime: { $min: '$resolutionTime' },
          maxResolutionTime: { $max: '$resolutionTime' }
        }
      }
    ]);

    // Get monthly ticket trends
    const monthlyTrends = await Ticket.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      },
      {
        $limit: 12
      }
    ]);

    res.json({
      ticketStats,
      categoryStats,
      priorityStats,
      recentTickets,
      userStats,
      departmentStats,
      resolutionTimeStats: resolutionTimeStats[0] || {
        avgResolutionTime: 0,
        minResolutionTime: 0,
        maxResolutionTime: 0
      },
      monthlyTrends
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/admin/users
// @desc    Get all users with filtering
// @access  Private (Admin/HR/IT)
router.get('/users', auth, isAdminOrStaff, async (req, res) => {
  try {
    const { role, department, page = 1, limit = 10 } = req.query;
    const query = {};

    if (role) query.role = role;
    if (department) query.department = department;

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    res.json({
      users,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/admin/tickets
// @desc    Get all tickets with filtering
// @access  Private (Admin/HR/IT)
router.get('/tickets', auth, isAdminOrStaff, async (req, res) => {
  try {
    const { status, category, priority, page = 1, limit = 10 } = req.query;
    const query = {};

    if (status) query.status = status;
    if (category) query.category = category;
    if (priority) query.priority = priority;

    const tickets = await Ticket.find(query)
      .populate('requester', 'name email')
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Ticket.countDocuments(query);

    res.json({
      tickets,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Get tickets error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 