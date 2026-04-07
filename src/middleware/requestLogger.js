const requestLogger = (req, res, next) => {
  const start = Date.now();
  const requestId = Math.random().toString(36).substring(7);
  
  // Add request ID
  req.requestId = requestId;
  
  // Log request
  console.log(`[${requestId}] ${req.method} ${req.path} - Started`);
  
  // Log response on finish
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusColor = res.statusCode >= 400 ? '🔴' : res.statusCode >= 200 ? '🟢' : '🟡';
    console.log(`[${requestId}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms) ${statusColor}`);
  });
  
  next();
};

module.exports = requestLogger;
