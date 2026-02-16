# 🥗 EATERZ Backend Documentation

## 📋 Table of Contents
- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [API Documentation](#api-documentation)
- [Installation & Setup](#installation--setup)
- [Configuration](#configuration)

## Overview
This is the backend API for the EATERZ platform, built with **Node.js** and **Express.js**, using **Sequelize** for database interactions.

## Tech Stack
- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Database:** MySQL 8
- **ORM:** Sequelize
- **Authentication:** JWT (JSON Web Tokens)
- **Real-time:** Socket.io
- **File Uploads:** Multer + Sharp (image processing)
- **Email:** Nodemailer
- **Testing:** Jest + Supertest
- **Logging:** Winston + Morgan
- **Monitoring:** Sentry

## Project Structure
The backend code resides in the `/server` directory.

```
server/
├── config/               # Configuration files (DB, logger, etc.)
├── controllers/          # Request handlers (business logic)
├── middleware/           # Express middleware (Auth, Validation, Error Handling)
├── models/               # Sequelize models (Database Schema)
├── routes/               # API route definitions
├── services/             # Email & Payment services
├── utils/                # Helper functions
├── uploads/              # File storage for uploads
├── server.js             # Main entry point
└── .env                  # Environment variables
```

## API Documentation

### Authentication
- `POST /api/auth/register` - Create a new account
- `POST /api/auth/login` - Login
- `POST /api/auth/refresh-token` - Refresh access token
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user profile

### Core Resources
- `/api/users` - User management
- `/api/plats` - Menu items management
- `/api/commandes` - Order processing
- `/api/categories` - Food categories
- `/api/promotions` - Discount codes
- `/api/avis` - Reviews and ratings
- `/api/favoris` - User favorites
- `/api/notifications` - User notifications
- `/api/litiges` - Dispute resolution

For detailed endpoints, check the `routes/` directory.

## Installation & Setup

### Prerequisites
- Node.js 18+
- MySQL Server 8+

### Installation
```bash
cd server
npm install
```

### Database Setup
1. Create a MySQL database (e.g. `eaterz`).
2. Run the schema script:
   ```bash
   mysql -u root -p eaterz < ../database/schema.sql
   ```
3. (Optional) seed data:
   ```bash
   mysql -u root -p eaterz < ../database/seed.sql
   ```

### Configuration
Create a `.env` file in `server/` based on `.env.example`:

```env
PORT=5000
NODE_ENV=development

# Database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=eaterz

# JWT Secrets
JWT_SECRET=your_secret_key
JWT_REFRESH_SECRET=your_refresh_secret

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email
SMTP_PASS=your_password
```

### Running API Server
```bash
# Development (with nodemon)
npm run dev

# Production
npm start
```
API will be available at: http://localhost:5000/api
