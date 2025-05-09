'use server'; // Keep as server action if possible, but localStorage makes it client-only conceptually

import type { Employee } from './attendance'; // Assuming Employee type is also here or imported
import { getEmployees } from './attendance';

// For this example, admin password. NEVER do this in production for real credentials.
const ADMIN_PASSWORD = '12345'; // Reverted to 12345 as per user's latest request

/**
 * Authenticates a user based on userId and password.
 * Checks against localStorage for employee data or admin credentials.
 * NOTE: Using localStorage makes this inherently client-side dependent.
 * If called during SSR without checks, it will fail.
 * Ensure this is only called from client components or within useEffect/event handlers.
 *
 * @param userId - The user ID (employee phone number or 'admin').
 * @param password - The password (only required for admin).
 * @returns Promise<boolean> - True if authentication is successful, false otherwise.
 */
export const authenticateUser = async (userId: string, password?: string): Promise<boolean> => {
  console.log(`[AuthService] authenticateUser: Attempting for userId: "${userId}"`);
  
  const trimmedUserId = typeof userId === 'string' ? userId.trim() : '';

  try {
    if (trimmedUserId.toLowerCase() === 'admin') {
      const isAdmin = password === ADMIN_PASSWORD;
      console.log(`[AuthService] authenticateUser: Admin login attempt. Password provided: "${password ? '******' : 'undefined'}". Result: ${isAdmin}`);
      return isAdmin;
    } else {
       if (typeof window !== 'undefined') {
         const employees = await getEmployees(); 
         const employeeExists = employees.some(emp => emp.phone === trimmedUserId);
         console.log(`[AuthService] authenticateUser: Employee login attempt for phone "${trimmedUserId}". Result: ${employeeExists}`);
         return employeeExists;
       } else {
          console.warn('[AuthService] authenticateUser: Called on server-side for non-admin. localStorage needed. Returning false.');
          return false;
       }
    }
  } catch (error) {
    console.error('[AuthService] authenticateUser: Error during authentication:', error);
    return false;
  }
};

/**
 * Checks if a user is currently logged in based on localStorage.
 * NOTE: Inherently client-side.
 * @returns string | null - The logged-in user ID (trimmed, and 'admin' is lowercased) or null if not logged in or empty.
 */
export const checkLoginStatus = (): string | null => {
   if (typeof window !== 'undefined') {
     try {
       const storedValue = localStorage.getItem('loggedInUser');
       console.log(`[AuthService] checkLoginStatus: Value from localStorage: "${storedValue}"`);

       if (storedValue) {
         const trimmedValue = storedValue.trim();
         console.log(`[AuthService] checkLoginStatus: Trimmed value: "${trimmedValue}"`);

         if (trimmedValue.toLowerCase() === 'admin') {
           console.log('[AuthService] checkLoginStatus: Recognized as admin. Returning "admin".');
           return 'admin';
         }
         
         if (trimmedValue !== '') {
           console.log(`[AuthService] checkLoginStatus: Recognized as non-admin user. Returning "${trimmedValue}".`);
           return trimmedValue;
         }
         console.log('[AuthService] checkLoginStatus: Value was empty after trim. Returning null.');
         return null; 
       }
       console.log('[AuthService] checkLoginStatus: No value found in localStorage. Returning null.');
       return null;
     } catch (error) {
       console.error('[AuthService] checkLoginStatus: Error accessing localStorage:', error);
       return null;
     }
   }
   console.warn('[AuthService] checkLoginStatus: Called on server-side. localStorage not available. Returning null.');
   return null;
};

/**
 * Logs the user out by removing the flag from localStorage.
 * NOTE: Inherently client-side.
 */
export const logoutUser = (): void => {
    if (typeof window !== 'undefined') {
      try {
        const oldValue = localStorage.getItem('loggedInUser');
        localStorage.removeItem('loggedInUser');
        console.log(`[AuthService] logoutUser: User logged out. Previous localStorage value was "${oldValue}".`);
      } catch (error) {
         console.error('[AuthService] logoutUser: Error removing item from localStorage during logout:', error);
      }
    } else {
      console.warn('[AuthService] logoutUser: Called on server-side. localStorage not available.');
    }
};

/**
 * Stores the logged-in user's ID in localStorage.
 * If the user is 'admin' (case-insensitive), it's stored as lowercase 'admin'.
 * NOTE: Inherently client-side.
 * @param userId - The ID of the user to store.
 */
export const storeLoginSession = (userId: string): void => {
    if (typeof window !== 'undefined') {
      try {
        let valueToStore = typeof userId === 'string' ? userId.trim() : ''; 
        console.log(`[AuthService] storeLoginSession: Original userId: "${userId}", Trimmed for storage: "${valueToStore}"`);

        if (valueToStore.toLowerCase() === 'admin') {
          valueToStore = 'admin'; // Standardize to lowercase 'admin' for storage
          console.log(`[AuthService] storeLoginSession: User is admin, standardized to: "${valueToStore}" for storage.`);
        }
        
        localStorage.setItem('loggedInUser', valueToStore);
        console.log(`[AuthService] storeLoginSession: Successfully stored "${valueToStore}" in localStorage for key "loggedInUser".`);
      } catch (error) {
        console.error('[AuthService] storeLoginSession: Error storing login session in localStorage:', error);
      }
    } else {
      console.warn('[AuthService] storeLoginSession: Called on server-side. localStorage not available.');
    }
};