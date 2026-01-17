/**
 * Shared validation utilities for forms.
 */

/** RFC 5322 compliant email regex */
export const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/

/**
 * Validate email format (RFC 5322 compliant).
 * @param email - Email string to validate
 * @returns true if valid email format
 */
export const isValidEmail = (email: string): boolean => EMAIL_REGEX.test(email)

/**
 * Validate password meets minimum requirements.
 * @param password - Password string to validate
 * @returns true if password meets requirements (8+ chars)
 */
export const isValidPassword = (password: string): boolean => password.length >= 8
