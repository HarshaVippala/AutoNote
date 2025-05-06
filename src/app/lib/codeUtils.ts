/**
 * Utility functions for code formatting and preprocessing
 */

/**
 * Preprocesses code by moving inline comments to their own lines before the code they were commenting on.
 * This improves readability and enables better syntax highlighting in narrow code panes.
 * 
 * Example:
 * Input:  "while left < right: # While two pointers do not meet"
 * Output: "# While two pointers do not meet
 *          while left < right:"
 * 
 * @param code The source code to preprocess
 * @returns Processed code with comments moved to their own lines
 */
export const preprocessCode = (code: string): string => {
  if (!code) return '';
  
  // Move inline comments to separate lines above the code line
  // This regex matches "#" comments that are not at the beginning of a line and have at least one space before them
  return code.replace(/^(.*?)(\s+#\s*.*)$/gm, (match, codePart, commentPart) => {
    // If code part is just whitespace, keep the comment as is
    if (codePart.trim() === '') return match;
    // Otherwise, move the comment to a new line above the code
    return commentPart.trim() + '\n' + codePart;
  });
}; 