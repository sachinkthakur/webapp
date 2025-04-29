{'use client';

import * as React from 'react';
import type { ToastProps } from '@/components/ui/toast';

const TOAST_LIMIT = 3; // Allow more than one toast
const TOAST_REMOVE_DELAY = 5000; // 5 seconds

export type ToastActionElement = React.ReactElement<{ altText: string } & React.HTMLAttributes<HTMLButtonElement>>;

// Define the shape of a toast object managed by the context
type ToasterToast = Omit<ToastProps, 'id'> & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

// Define the shape of the context value
interface ToastContextValue {
  toasts: ToasterToast[];
  toast: (props: Omit<ToasterToast, 'id'>) => { id: string; dismiss: () => void };
  dismiss: (toastId?: string) => void;
}

// Create the context with a default value (or undefined and check in hook)
const ToastContext = React.createContext<ToastContextValue | undefined>(undefined);

// Custom hook to access the toast context
export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

// Helper to generate unique IDs
let count = 0;
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

// Provider component
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToasterToast[]>([]);
  const dismissTimeouts = React.useRef<Map<string, NodeJS.Timeout>>(new Map());

  const scheduleDismiss = React.useCallback((toastId: string) => {
    // Clear any existing timeout for this toast
    const existingTimeout = dismissTimeouts.current.get(toastId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set a new timeout
    const newTimeout = setTimeout(() => {
      setToasts((currentToasts) => currentToasts.filter((t) => t.id !== toastId));
      dismissTimeouts.current.delete(toastId);
    }, TOAST_REMOVE_DELAY);

    dismissTimeouts.current.set(toastId, newTimeout);
  }, []);

  const toast = React.useCallback(
    (props: Omit<ToasterToast, 'id'>): { id: string; dismiss: () => void } => {
      const id = genId();
      const newToast: ToasterToast = {
        ...props,
        id,
        open: true, // Toasts are open by default when added
        onOpenChange: (open) => {
            if (!open) {
                // Remove the toast immediately when dismissed via UI (e.g., close button)
                setToasts((currentToasts) => currentToasts.filter((t) => t.id !== id));
                 const existingTimeout = dismissTimeouts.current.get(id);
                 if (existingTimeout) {
                    clearTimeout(existingTimeout);
                    dismissTimeouts.current.delete(id);
                 }
            }
        }
      };

      setToasts((currentToasts) => [newToast, ...currentToasts].slice(0, TOAST_LIMIT));
      scheduleDismiss(id); // Schedule auto-dismissal

      return {
        id: id,
        dismiss: () => {
             setToasts((currentToasts) => currentToasts.filter((t) => t.id !== id));
              const existingTimeout = dismissTimeouts.current.get(id);
              if (existingTimeout) {
                 clearTimeout(existingTimeout);
                 dismissTimeouts.current.delete(id);
              }
        },
      };
    },
    [scheduleDismiss]
  );

   const dismiss = React.useCallback((toastId?: string) => {
        setToasts((currentToasts) => {
            if (toastId) {
                 const existingTimeout = dismissTimeouts.current.get(toastId);
                 if (existingTimeout) {
                     clearTimeout(existingTimeout);
                     dismissTimeouts.current.delete(toastId);
                 }
                 return currentToasts.filter((t) => t.id !== toastId);
            } else {
                // Dismiss all - clear all timeouts
                dismissTimeouts.current.forEach(timeoutId => clearTimeout(timeoutId));
                dismissTimeouts.current.clear();
                return []; // Remove all toasts
            }
        });
    }, []);


  // Clear timeouts on unmount
  React.useEffect(() => {
    const timeouts = dismissTimeouts.current;
    return () => {
      timeouts.forEach(timeoutId => clearTimeout(timeoutId));
    };
  }, []);

  const contextValue = React.useMemo(() => ({ toasts, toast, dismiss }), [toasts, toast, dismiss]);

  // Return the provider with the calculated value, ensuring standard JSX syntax
  return (
    <ToastContext.Provider value={contextValue}>
      {children}
    </ToastContext.Provider>
  );
}
