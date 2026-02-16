/**
 * Audit Logger for sensitive admin actions
 * Logs actions to both console and file for compliance/security review
 */

const logger = require('../config/logger');

/**
 * Log an admin action
 * @param {Object} params
 * @param {number} params.adminId - ID of the admin performing the action
 * @param {string} params.adminEmail - Email of the admin
 * @param {string} params.action - Action type (e.g., 'USER_STATUS_CHANGE', 'PASSWORD_RESET')
 * @param {number} params.targetId - ID of the target resource
 * @param {string} params.targetType - Type of target (e.g., 'user', 'order')
 * @param {Object} params.details - Additional details about the action
 * @param {string} params.ip - IP address of the requester
 */
const logAdminAction = ({ adminId, adminEmail, action, targetId, targetType, details = {}, ip }) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    type: 'ADMIN_AUDIT',
    adminId,
    adminEmail,
    action,
    targetType,
    targetId,
    details,
    ip,
  };

  // Log to winston (will go to file and console based on config)
  logger.info('Admin action', logEntry);

  // In production, you might also want to:
  // - Store in a separate audit table in the database
  // - Send to a SIEM system
  // - Send alerts for critical actions

  return logEntry;
};

/**
 * Audit action types
 */
const AUDIT_ACTIONS = {
  USER_STATUS_CHANGE: 'USER_STATUS_CHANGE',
  USER_DELETE: 'USER_DELETE',
  USER_UPDATE: 'USER_UPDATE',
  PASSWORD_RESET: 'PASSWORD_RESET',
  ROLE_CHANGE: 'ROLE_CHANGE',
  ORDER_REFUND: 'ORDER_REFUND',
  LITIGE_RESOLUTION: 'LITIGE_RESOLUTION',
  PROMOTION_CREATE: 'PROMOTION_CREATE',
  PROMOTION_DELETE: 'PROMOTION_DELETE',
};

module.exports = {
  logAdminAction,
  AUDIT_ACTIONS,
};
