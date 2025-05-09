'use server'; // Keep as server action if possible, but localStorage makes it client-only conceptually

import type { Employee } from './attendance'; // Assuming Employee type is also here or imported
import { getEmployees } from './attendance';

// For this example, admin password. NEVER do this in production for real credentials.
const ADMIN_PASSWORD = '12345';

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
  console.log(`Attempting authentication for userId: ${userId}`);
  
  // Trim userId at the very beginning
  const trimmedUserId = typeof userId === 'string' ? userId.trim() : '';

  try {
    if (trimmedUserId.toLowerCase() === 'admin') {
      // Securely compare passwords. Avoid storing plain text passwords.
      const isAdmin = password === ADMIN_PASSWORD;
      console.log(`Admin login attempt with password "${password}". Result: ${isAdmin}`);
      return isAdmin;
    } else {
      // Check if it's a registered employee based on phone number
       if (typeof window !== 'undefined') {
         const employees = await getEmployees(); // Fetch employees (uses localStorage)
         const employeeExists = employees.some(emp => emp.phone === trimmedUserId);
         console.log(`Employee login attempt result for phone ${trimmedUserId}: ${employeeExists}`);
         // For now, employees don't need a password, just existence
         return employeeExists;
       } else {
          console.warn('authenticateUser called on the server-side for non-admin user. This requires client-side localStorage.');
          return false; // Cannot authenticate non-admin on server
       }
    }
  } catch (error) {
    console.error('Error during authentication:', error);
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
       let loggedInUser = localStorage.getItem('loggedInUser');
       if (loggedInUser) {
         loggedInUser = loggedInUser.trim();
         // Normalize to lowercase 'admin' on retrieval if it's an admin user
         if (loggedInUser.toLowerCase() === 'admin') {
           return 'admin'; 
         }
         // Return other non-empty user IDs as is
         if (loggedInUser !== '') {
           return loggedInUser;
         }
       }
       return null; // Return null if not found, null, or empty string after trim
     } catch (error) {
       console.error('Error accessing localStorage for login status:', error);
       return null;
     }
   }
   return null; // Cannot check status on server
};

/**
 * Logs the user out by removing the flag from localStorage.
 * NOTE: Inherently client-side.
 */
export const logoutUser = (): void => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('loggedInUser');
        console.log('User logged out.');
      } catch (error) {
         console.error('Error removing item from localStorage during logout:', error);
      }
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

        if (valueToStore.toLowerCase() === 'admin') {
          valueToStore = 'admin'; // Standardize to lowercase 'admin' for storage
        }
        
        localStorage.setItem('loggedInUser', valueToStore);
        console.log(`Stored login session for user: "${valueToStore}"`);
      } catch (error) {
        console.error('Error storing login session in localStorage:', error);
      }
    }
};
