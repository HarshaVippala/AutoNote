"use client";

import React from 'react';

interface CodeBlockProps {
  code: string;
  language?: string; // Optional language prop for potential syntax highlighting
  theme?: 'light' | 'dark'; // Optional theme prop
}

const CodeBlock: React.FC<CodeBlockProps> = ({ 
  code, 
  language = 'plaintext', // Default language
  theme = 'light' // Default theme
}) => {
  // Basic styling - can be enhanced with syntax highlighting library
  const preStyle: React.CSSProperties = {
    padding: '0.35rem',
    borderRadius: '0.5rem',
    overflowX: 'auto',
    fontSize: '0.75rem',
    lineHeight: '1.2',
    backgroundColor: theme === 'dark' ? '#1F2937' : '#F3F4F6', // gray-800 or gray-100
    color: theme === 'dark' ? '#E5E7EB' : '#111827', // gray-200 or gray-900
    maxHeight: '85vh'
  };

  return (
    <pre style={preStyle}>
      <code>
        {code}
      </code>
    </pre>
  );
};

export default CodeBlock; 