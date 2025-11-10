// @ts-nocheck

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path
  });
}

module.exports = { notFoundHandler };
