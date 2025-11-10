import { createLogger } from './logger';

const logger = createLogger('URLValidator');

export interface URLValidationOptions {
  allowHttp?: boolean; // Allow HTTP (default: false in production)
  allowLocalhost?: boolean; // Allow localhost (default: false in production)
  allowedHosts?: string[]; // Whitelist of allowed hostnames
  blockPrivateIPs?: boolean; // Block private IP ranges (default: true in production)
}

/**
 * Validates a URL for security purposes
 * Prevents SSRF attacks and open redirects
 */
export function validateURL(
  url: string,
  options: URLValidationOptions = {}
): { valid: boolean; error?: string; parsed?: URL } {
  const isProduction = process.env.NODE_ENV === 'production';

  // Set defaults based on environment
  const {
    allowHttp = !isProduction,
    allowLocalhost = !isProduction,
    allowedHosts = [],
    blockPrivateIPs = isProduction
  } = options;

  try {
    const parsed = new URL(url);

    // Check protocol
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return {
        valid: false,
        error: `Invalid protocol: ${parsed.protocol}. Only HTTP(S) allowed.`
      };
    }

    // Check if HTTP is allowed
    if (parsed.protocol === 'http:' && !allowHttp) {
      return {
        valid: false,
        error: 'HTTP not allowed in production. Use HTTPS.'
      };
    }

    // Check hostname
    const hostname = parsed.hostname.toLowerCase();

    // Check localhost
    if (!allowLocalhost && isLocalhost(hostname)) {
      return {
        valid: false,
        error: 'Localhost URLs not allowed in production'
      };
    }

    // Check private IP ranges
    if (blockPrivateIPs && isPrivateIP(hostname)) {
      return {
        valid: false,
        error: 'Private IP addresses not allowed'
      };
    }

    // Check whitelist
    if (allowedHosts.length > 0) {
      const isAllowed = allowedHosts.some(allowed => {
        // Exact match
        if (hostname === allowed.toLowerCase()) {
          return true;
        }
        // Subdomain match (*.example.com matches app.example.com)
        if (allowed.startsWith('*.')) {
          const domain = allowed.substring(2).toLowerCase();
          return hostname.endsWith(`.${domain}`) || hostname === domain;
        }
        return false;
      });

      if (!isAllowed) {
        return {
          valid: false,
          error: `Host ${hostname} not in allowed list`
        };
      }
    }

    return {
      valid: true,
      parsed
    };
  } catch (error) {
    return {
      valid: false,
      error: `Invalid URL format: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Check if hostname is localhost
 */
function isLocalhost(hostname: string): boolean {
  const localhostPatterns = [
    'localhost',
    '127.0.0.1',
    '::1',
    '[::1]',
    '0.0.0.0'
  ];

  return localhostPatterns.some(pattern =>
    hostname === pattern || hostname.startsWith(pattern + ':')
  );
}

/**
 * Check if hostname is a private IP address
 */
function isPrivateIP(hostname: string): boolean {
  // Remove brackets from IPv6
  const ip = hostname.replace(/^\[|\]$/g, '');

  // IPv4 private ranges
  const ipv4PrivateRanges = [
    /^10\./,                     // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
    /^192\.168\./,               // 192.168.0.0/16
    /^127\./,                    // 127.0.0.0/8 (loopback)
    /^169\.254\./,               // 169.254.0.0/16 (link-local)
  ];

  for (const range of ipv4PrivateRanges) {
    if (range.test(ip)) {
      return true;
    }
  }

  // IPv6 private ranges
  if (ip.includes(':')) {
    const ipv6PrivateRanges = [
      /^::1$/,                    // loopback
      /^fe80:/i,                  // link-local
      /^fc00:/i,                  // unique local
      /^fd00:/i,                  // unique local
    ];

    for (const range of ipv6PrivateRanges) {
      if (range.test(ip)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Validate OAuth redirect URL
 * More strict than general URL validation
 */
export function validateRedirectURL(
  url: string,
  allowedRedirectURLs: string[]
): { valid: boolean; error?: string } {
  if (!allowedRedirectURLs || allowedRedirectURLs.length === 0) {
    logger.warn('No allowed redirect URLs configured');
    return {
      valid: false,
      error: 'Redirect URL validation not configured'
    };
  }

  // Parse the URL
  const validation = validateURL(url, {
    allowHttp: process.env.NODE_ENV !== 'production',
    allowLocalhost: process.env.NODE_ENV !== 'production',
    blockPrivateIPs: true
  });

  if (!validation.valid) {
    return validation;
  }

  // Check against whitelist
  const isAllowed = allowedRedirectURLs.some(allowed => {
    try {
      const allowedURL = new URL(allowed);
      const targetURL = validation.parsed!;

      // Exact match (protocol + hostname + pathname)
      return (
        allowedURL.protocol === targetURL.protocol &&
        allowedURL.hostname === targetURL.hostname &&
        targetURL.pathname.startsWith(allowedURL.pathname)
      );
    } catch {
      return false;
    }
  });

  if (!isAllowed) {
    logger.warn('Redirect URL not in whitelist', { url, allowed: allowedRedirectURLs });
    return {
      valid: false,
      error: 'Redirect URL not allowed'
    };
  }

  return { valid: true };
}

/**
 * Validate MCP server URL
 */
export function validateMCPServerURL(url: string): { valid: boolean; error?: string } {
  return validateURL(url, {
    allowHttp: process.env.NODE_ENV !== 'production',
    allowLocalhost: process.env.NODE_ENV !== 'production',
    blockPrivateIPs: process.env.NODE_ENV === 'production'
  });
}
