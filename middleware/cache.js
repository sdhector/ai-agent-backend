// @ts-nocheck

const cache = new Map();

function cacheMiddleware(ttl = 3600000) {
  return (req, res, next) => {
    const key = req.originalUrl;
    const cached = cache.get(key);

    if (cached && Date.now() < cached.expiry) {
      return res.json(cached.data);
    }

    const originalJson = res.json.bind(res);
    res.json = (data) => {
      cache.set(key, {
        data,
        expiry: Date.now() + ttl
      });
      return originalJson(data);
    };

    next();
  };
}

function clearCache() {
  cache.clear();
}

function removeCacheEntry(key) {
  cache.delete(key);
}

module.exports = { 
  cacheMiddleware, 
  clearCache, 
  removeCacheEntry 
};
