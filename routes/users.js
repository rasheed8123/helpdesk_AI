const express = require('express');
const { body, validationResult, param } = require('express-validator');
const User = require('../models/User');
const { auth, authorize } = require('../middleware/auth');
const { sendWelcomeEmail } = require('../services/emailService');
const multer = require('multer');
const faceVerificationService = require('../services/faceVerification');

const router = express.Router();

// Configure multer for face image upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// @route   GET /api/users/stats
// @desc    Get user statistics
// @access  Private (admin and super-admin only)
router.get('/stats', auth, authorize('admin', 'super-admin'), async (req, res) => {
  try {
    const roleStats = await User.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);

    const departmentStats = await User.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$department', count: { $sum: 1 } } }
    ]);

    const totalUsers = await User.countDocuments({ isActive: true });
    const activeUsers = await User.countDocuments({ isActive: true, lastLogin: { $exists: true } });

    res.json({
      roleStats,
      departmentStats,
      totalUsers,
      activeUsers
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/users/change-password
// @desc    Change user password
// @access  Private
router.put('/change-password', auth, [
  body('currentPassword').exists().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters long')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/users
// @desc    Get all users (admin and super-admin only)
// @access  Private
router.get('/', auth, authorize('admin', 'super-admin'), async (req, res) => {
  try {
    const { role, department, page = 1, limit = 20 } = req.query;
    
    const filter = { isActive: true };
    if (role) filter.role = role;
    if (department) filter.department = new RegExp(department, 'i');

    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await User.countDocuments(filter);

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

// @route   GET /api/users/:id
// @desc    Get user by ID
// @access  Private
router.get('/:id', auth, [
  param('id').isMongoId().withMessage('Invalid user ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Users can only view their own profile unless they're admin/super-admin
    if (req.user._id.toString() !== req.params.id && 
        !['admin', 'super-admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/users
// @desc    Create a new user (admin and super-admin only)
// @access  Private
router.post('/', auth, authorize('admin', 'super-admin'), upload.single('faceImage'), async (req, res) => {
  try {
    const { name, email, password, role, department } = req.body;

    // Check if user exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Create new user
    user = new User({
      name,
      email,
      password,
      role,
      department
    });

    // Save user
    await user.save();

    // Save face image if provided
    if (req.file) {
      await faceVerificationService.saveFaceImage(user._id, req.file.buffer);
    }

    // Send welcome email
    await sendWelcomeEmail(user.email, user.name);

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department
      }
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/users/:id
// @desc    Update user
// @access  Private
router.put('/:id', auth, [
  param('id').isMongoId().withMessage('Invalid user ID'),
  body('name').optional().trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters long'),
  body('email').optional().isEmail().normalizeEmail().withMessage('Please enter a valid email'),
  body('role').optional().isIn(['employee', 'hr', 'admin', 'it', 'super-admin']).withMessage('Invalid role')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Users can only update their own profile unless they're admin/super-admin
    const canUpdate = req.user._id.toString() === req.params.id || 
                     ['admin', 'super-admin'].includes(req.user.role);
    
    if (!canUpdate) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Only super-admin can change roles
    if (req.body.role && req.user.role !== 'super-admin') {
      return res.status(403).json({ message: 'Only super-admin can change user roles' });
    }

    const allowedUpdates = ['name', 'email', 'department'];
    if (req.user.role === 'super-admin') {
      allowedUpdates.push('role', 'isActive');
    }

    const updates = {};
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      message: 'User updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/users/:id
// @desc    Deactivate user (super-admin only)
// @access  Private
router.delete('/:id', auth, authorize('super-admin'), [
  param('id').isMongoId().withMessage('Invalid user ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent self-deletion
    if (req.user._id.toString() === req.params.id) {
      return res.status(400).json({ message: 'Cannot deactivate your own account' });
    }

    // Soft delete (deactivate)
    user.isActive = false;
    await user.save();

    res.json({ message: 'User deactivated successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
