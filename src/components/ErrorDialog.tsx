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
  
  // Dark theme is now the only theme
  const bgColor = 'bg-slate-800';
  const textColor = 'text-slate-200';
  const borderColor = 'border-slate-700';
  const secondaryTextColor = 'text-slate-400';
  
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
                  className={`ml-2 inline-flex rounded-md bg-transparent ${theme === 'dark' ? 'text-slate-400 hover:text-slate-300' : 'text-gray-400 hover:text-gray-500'}`}
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
                    className={`inline-flex justify-center rounded-md border ${theme === 'dark' ? 'border-slate-600 bg-slate-700 text-slate-200 hover:bg-slate-600' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'} px-4 py-2 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 ${theme === 'dark' ? 'focus:ring-offset-slate-800' : 'focus:ring-offset-white'}`}
                    onClick={retryAction}
                  >
                    Retry
                  </button>
                )}
                <button
                  type="button"
                  className={`inline-flex justify-center rounded-md ${theme === 'dark' ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-red-600 hover:bg-red-700 text-white'} px-4 py-2 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ${theme === 'dark' ? 'focus:ring-offset-slate-800' : 'focus:ring-offset-white'}`}
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