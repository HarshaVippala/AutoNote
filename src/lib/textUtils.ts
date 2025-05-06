
/**
 * Text utility functions for the application
 */

/**
 * Capitalizes the first letter of a string
 * @param text - The text to capitalize
 * @returns The text with first letter capitalized
 */
export function capitalizeFirstLetter(text: string): string {
  if (!text || typeof text !== 'string') return '';
  
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Gets the initials from a name (up to 2 characters)
 * @param name - The full name to extract initials from
 * @returns The initials (uppercase)
 */
export function getNameInitials(name: string): string {
  if (!name || typeof name !== 'string') return '';
  
  const parts = name.trim().split(/\s+/);
  
  if (parts.length === 1) {
    // For single names, return the first letter
    return parts[0].charAt(0).toUpperCase();
  } else {
    // For multiple names, take first letter of first and last name
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }
}
