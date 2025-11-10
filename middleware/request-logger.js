// @ts-nocheck

const { createLogger } = require('../dist/utils/logger');

const logger = createLogger('Server');

function requestLogger(req, res, next) {
  logger.info(`${req.method} ${req.path}`);
  next();
}

module.exports = { requestLogger };
