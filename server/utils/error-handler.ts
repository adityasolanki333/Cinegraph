import { Response } from "express";

/**
 * Standard error response format
 */
export interface ErrorResponse {
  error: string;
  message?: string;
  details?: unknown;
}

/**
 * Standardized error handler for API routes
 * Logs error and sends consistent JSON response
 */
export function handleApiError(
  res: Response,
  error: unknown,
  context: string,
  statusCode: number = 500
): void {
  // Log error with context
  console.error(`[API Error] ${context}:`, error);

  // Prepare error response
  const errorResponse: ErrorResponse = {
    error: context,
  };

  // Add error message if it's an Error instance
  if (error instanceof Error) {
    errorResponse.message = error.message;
  }

  // In development, include full error details
  if (process.env.NODE_ENV === 'development' && error) {
    errorResponse.details = error;
  }

  // Send response
  res.status(statusCode).json(errorResponse);
}

/**
 * Standardized validation error handler
 */
export function handleValidationError(
  res: Response,
  message: string,
  details?: unknown
): void {
  console.warn(`[Validation Error] ${message}`, details || '');
  
  const errorResponse: ErrorResponse = {
    error: "Validation failed",
    message,
  };

  if (details) {
    errorResponse.details = details;
  }

  res.status(400).json(errorResponse);
}

/**
 * Standardized not found error handler
 */
export function handleNotFoundError(
  res: Response,
  resource: string
): void {
  const errorResponse: ErrorResponse = {
    error: "Not found",
    message: `${resource} not found`,
  };

  res.status(404).json(errorResponse);
}

/**
 * Standardized unauthorized error handler
 */
export function handleUnauthorizedError(
  res: Response,
  message: string = "Unauthorized"
): void {
  const errorResponse: ErrorResponse = {
    error: "Unauthorized",
    message,
  };

  res.status(401).json(errorResponse);
}

/**
 * Standardized forbidden error handler
 */
export function handleForbiddenError(
  res: Response,
  message: string = "Forbidden"
): void {
  const errorResponse: ErrorResponse = {
    error: "Forbidden",
    message,
  };

  res.status(403).json(errorResponse);
}
