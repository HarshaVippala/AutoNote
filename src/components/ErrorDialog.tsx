"use client";

import React from 'react';
import { Dialog } from '@headlessui/react';
import { ExclamationTriangleIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useTheme } from "@/contexts/ThemeContext";

export interface ErrorDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  details?: string;
  retryAction?: (() => void) | null;
  onDismiss: () => void;
}

/**
 * A modal dialog component for displaying errors with options to retry or dismiss
 */
const ErrorDialog: React.FC<ErrorDialogProps> = ({ 
  isOpen, 
  title, 
  message, 
  details, 
  retryAction, 
  onDismiss 
}) => {
  const { theme } = useTheme();
  
  const bgColor = theme === 'dark' ? 'bg-gray-800' : 'bg-white';
  const textColor = theme === 'dark' ? 'text-gray-200' : 'text-gray-900';
  const borderColor = theme === 'dark' ? 'border-gray-700' : 'border-gray-200';
  const secondaryTextColor = theme === 'dark' ? 'text-gray-400' : 'text-gray-500';
  
  return (
    <Dialog
      open={isOpen}
      onClose={onDismiss}
      className="relative z-50"
    >
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className={`mx-auto max-w-md rounded-lg ${bgColor} p-6 shadow-xl border ${borderColor}`}>
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <ExclamationTriangleIcon className="h-6 w-6 text-red-500" aria-hidden="true" />
            </div>
            <div className="ml-3 flex-1">
              <div className="flex w-full justify-between">
                <Dialog.Title as="h3" className={`text-lg font-medium leading-6 ${textColor}`}>
                  {title}
                </Dialog.Title>
                <button
                  type="button"
                  className="ml-2 inline-flex rounded-md bg-transparent text-gray-400 hover:text-gray-500"
                  onClick={onDismiss}
                >
                  <span className="sr-only">Close</span>
                  <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <div className="mt-2">
                <p className={`text-sm ${textColor}`}>{message}</p>
                {details && (
                  <div className="mt-3">
                    <details>
                      <summary className={`text-xs cursor-pointer ${secondaryTextColor}`}>Technical details</summary>
                      <p className={`mt-2 text-xs whitespace-pre-wrap font-mono overflow-auto max-h-40 ${secondaryTextColor}`}>
                        {details}
                      </p>
                    </details>
                  </div>
                )}
              </div>
              <div className="mt-4 flex justify-end space-x-3">
                {retryAction && (
                  <button
                    type="button"
                    className={`inline-flex justify-center rounded-md border ${theme === 'dark' ? 'border-gray-700 bg-gray-700 text-gray-200 hover:bg-gray-600' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'} px-4 py-2 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
                    onClick={retryAction}
                  >
                    Retry
                  </button>
                )}
                <button
                  type="button"
                  className={`inline-flex justify-center rounded-md ${theme === 'dark' ? 'bg-red-700 hover:bg-red-600 text-white' : 'bg-red-600 hover:bg-red-700 text-white'} px-4 py-2 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2`}
                  onClick={onDismiss}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
};

export default ErrorDialog; 