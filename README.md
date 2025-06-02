
# HelpHub AI Backend

A Node.js backend API for the HelpHub AI Internal Helpdesk Portal.

## Features

- **Authentication**: JWT-based authentication with role-based access control
- **User Management**: CRUD operations for users with different roles (employee, hr, admin, it, super-admin)
- **Ticket System**: Complete ticket management with smart category-based assignment
- **Role-based Access**: Different permissions for different user roles
- **MongoDB Integration**: Mongoose ODM with proper indexing and validation
- **Security**: Helmet, rate limiting, input validation, and password hashing

## Setup Instructions

### Prerequisites

- Node.js (v16 or higher)
- MongoDB (local or cloud instance)
- npm or yarn

### Installation

1. Navigate to the server directory:
   ```bash
   cd server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create environment file:
   ```bash
   cp .env.example .env
   ```

4. Update the `.env` file with your configuration:
   ```
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/helphub-ai
   JWT_SECRET=your_super_secret_jwt_key_here_make_it_very_long_and_secure
   NODE_ENV=development
   ```

5. Start MongoDB service (if using local MongoDB)

6. Seed the database with sample data:
   ```bash
   node scripts/seedDatabase.js
   ```

7. Start the development server:
   ```bash
   npm run dev
   ```

The server will start on http://localhost:5000

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - User logout

### Users
- `GET /api/users` - Get all users (admin/super-admin only)
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create new user (super-admin only)
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Deactivate user (super-admin only)

### Tickets
- `GET /api/tickets` - Get tickets (filtered by role)
- `GET /api/tickets/:id` - Get ticket by ID
- `POST /api/tickets` - Create new ticket
- `PUT /api/tickets/:id` - Update ticket
- `POST /api/tickets/:id/comments` - Add comment to ticket
- `GET /api/tickets/stats/dashboard` - Get ticket statistics

### Health Check
- `GET /api/health` - Server health check

## User Roles

- **employee**: Can create tickets and view their own tickets
- **hr**: Can handle HR category tickets and view/manage HR-related tickets
- **it**: Can handle IT category tickets and view/manage IT-related tickets  
- **admin**: Can handle Admin category tickets and view/manage admin-related tickets
- **super-admin**: Full access to all features including user management

## Default Users (after seeding)

- **Super Admin**: admin@helphub.com / admin123
- **HR Manager**: hr@helphub.com / hr123
- **IT Support**: it@helphub.com / it123
- **Admin User**: admin-user@helphub.com / admin123
- **Employee**: employee@helphub.com / emp123

## Smart Ticket Assignment

Tickets are automatically assigned based on category:
- **IT tickets** → Assigned to IT role users
- **HR tickets** → Assigned to HR role users
- **Admin tickets** → Assigned to Admin role users

Super-admin and admin users can handle any category of tickets.

## Security Features

- Password hashing with bcrypt
- JWT token authentication
- Rate limiting (100 requests per 15 minutes)
- Input validation and sanitization
- Helmet security headers
- CORS configuration
- MongoDB injection protection

## Development

### Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `node scripts/seedDatabase.js` - Seed database with sample data

### Database Schema

The application uses MongoDB with Mongoose ODM. Main collections:
- **users**: User accounts with role-based access
- **tickets**: Support tickets with comments and assignments

## Production Deployment

1. Set `NODE_ENV=production` in environment variables
2. Update `MONGODB_URI` to production MongoDB instance
3. Generate a secure `JWT_SECRET`
4. Configure proper CORS origins
5. Set up SSL/TLS certificates
6. Use PM2 or similar for process management

## Contributing

1. Follow the existing code style
2. Add proper error handling
3. Include input validation
4. Update API documentation
5. Test all endpoints before committing
