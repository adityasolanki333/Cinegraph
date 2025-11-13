import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

// Get user identifier from request (userId or IP)
// Note: We rely on express-rate-limit's default behavior for IP handling
const keyGenerator = (req: Request): string => {
  const userId = req.headers['x-user-id'] as string;
  // If userId exists, use it; otherwise let express-rate-limit handle IP with IPv6 support
  if (userId) {
    return `user:${userId}`;
  }
  // Return undefined to let express-rate-limit use its default IP handler
  return undefined as any;
};

// Strict rate limiter for write operations (POST, PUT, DELETE)
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  message: 'Too many requests from this account. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests',
      message: 'You have exceeded the rate limit. Please try again in a few minutes.'
    });
  }
});

// Moderate rate limiter for AI/expensive operations
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: 'AI service rate limit exceeded. Please wait before making another request.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler: (req, res) => {
    res.status(429).json({
      error: 'AI service rate limit exceeded',
      message: 'You are making too many AI requests. Please wait a moment before trying again.'
    });
  }
});

// Lenient rate limiter for read operations (GET)
export const readLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: 'Too many requests. Please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  skipSuccessfulRequests: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'You are making requests too quickly. Please wait a moment.'
    });
  }
});

// Authentication rate limiter for login attempts
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 login attempts per 15 minutes
  message: 'Too many authentication attempts. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  // Use default IP-based rate limiting for auth to prevent account enumeration
  skipSuccessfulRequests: true, // Only count failed attempts
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many login attempts',
      message: 'You have made too many authentication attempts. Please wait 15 minutes before trying again.'
    });
  }
});

// Global rate limiter for all API requests (very lenient, just to prevent abuse)
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per 15 minutes
  message: 'Global rate limit exceeded.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Global rate limit exceeded',
      message: 'You have exceeded the global rate limit. Please try again later.'
    });
  }
});
