/**
 * Secure Static Files Middleware
 * Protects sensitive uploaded files from unauthorized access
 */

const path = require('path');
const fs = require('fs');
const { verifyAccessToken } = require('../utils/generateToken');
const { User, Commande, Litige } = require('../models');

/**
 * Middleware to serve secure static files with authentication
 * Used for sensitive files like litige evidence
 */
const secureStaticMiddleware = (uploadDir) => {
  return async (req, res, next) => {
    const requestedPath = req.path;
    
    // Check if this is a litige file - these require authentication
    if (requestedPath.startsWith('/litiges/')) {
      // Get token from cookie or header
      let token = req.cookies?.accessToken;
      if (!token) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          token = authHeader.split(' ')[1];
        }
      }

      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required to access this file'
        });
      }

      const decoded = verifyAccessToken(token);
      if (!decoded) {
        return res.status(401).json({
          success: false,
          message: 'Invalid or expired token'
        });
      }

      // Get user
      const user = await User.findByPk(decoded.id);
      if (!user || !user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'User not found or inactive'
        });
      }

      // Admins can access all litige files
      if (user.role === 'admin') {
        return serveFile(req, res, uploadDir, requestedPath);
      }

      // For non-admins, verify they are party to the litige
      const filename = path.basename(requestedPath);
      const litige = await Litige.findOne({
        where: {
          piecesJointes: { 
            [require('sequelize').Op.like]: `%${filename}%` 
          }
        }
      });

      if (!litige) {
        return res.status(404).json({
          success: false,
          message: 'File not found'
        });
      }

      // Check if user is client or prestataire of this litige
      if (litige.clientId !== user.id && litige.prestataireId !== user.id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this file'
        });
      }

      return serveFile(req, res, uploadDir, requestedPath);
    }

    // For non-sensitive files (avatars, plats), serve normally
    next();
  };
};

/**
 * Serve a file from the upload directory
 */
const serveFile = (req, res, uploadDir, filePath) => {
  const fullPath = path.join(uploadDir, filePath);
  
  // Prevent path traversal attacks
  const normalizedPath = path.normalize(fullPath);
  if (!normalizedPath.startsWith(uploadDir)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied'
    });
  }

  // Check if file exists
  if (!fs.existsSync(normalizedPath)) {
    return res.status(404).json({
      success: false,
      message: 'File not found'
    });
  }

  // Set appropriate headers
  res.sendFile(normalizedPath);
};

module.exports = { secureStaticMiddleware };
