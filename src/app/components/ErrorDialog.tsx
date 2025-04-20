"use client";

import React from 'react';

interface ErrorDialogProps {
  isOpen: boolean;
  title?: string;
  message: string;
  details?: string;
  onRetry?: () => void;
  onDismiss: () => void;
  showDetails?: boolean;
}

/**
 * A modal dialog component for displaying errors with options to retry or dismiss
 */
const ErrorDialog: React.FC<ErrorDialogProps> = ({
  isOpen,
  title = "Error",
  message,
  details,
  onRetry,
  onDismiss,
  showDetails = process.env.NODE_ENV === 'development'
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div 
        className="bg-white rounded-lg shadow-lg max-w-md w-full p-6 border border-red-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center mr-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900">
            {title}
          </h3>
        </div>

        <div className="mt-2">
          <p className="text-gray-700">
            {message}
          </p>
          
          {showDetails && details && (
            <details className="mt-3 p-2 bg-gray-50 rounded border border-gray-200">
              <summary className="cursor-pointer text-sm font-medium text-gray-600">
                Error details
              </summary>
              <pre className="mt-2 whitespace-pre-wrap text-xs overflow-auto max-h-40 p-2 bg-gray-100 rounded">
                {details}
              </pre>
            </details>
          )}
        </div>

        <div className="mt-4 flex justify-end space-x-3">
          {onRetry && (
            <button
              type="button"
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
              onClick={onRetry}
            >
              Retry
            </button>
          )}
          
          <button
            type="button"
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
            onClick={onDismiss}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

export default ErrorDialog; 