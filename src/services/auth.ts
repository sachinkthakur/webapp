'use server'; // Keep as server action if possible, but localStorage makes it client-only conceptually

import { getEmployees } from './attendance'; // Assuming Employee type is also here or imported

// Define the structure of an Employee if not already imported
// export interface Employee { ... }


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
  try {
    if (userId.toLowerCase() === 'admin') {
      // Securely compare passwords. Avoid storing plain text passwords.
      // For this example, we use a hardcoded password. NEVER do this in production.
      const isAdmin = password === '1234';
      console.log(`Admin login attempt result: ${isAdmin}`);
      return isAdmin;
    } else {
      // Check if it's a registered employee based on phone number
       // Access localStorage only on the client-side
       if (typeof window !== 'undefined') {
         const employees = await getEmployees(); // Fetch employees (uses localStorage)
         const employeeExists = employees.some(emp => emp.phone === userId);
         console.log(`Employee login attempt result for phone ${userId}: ${employeeExists}`);
         // For now, employees don't need a password, just existence
         return employeeExists;
       } else {
          console.warn('authenticateUser called on the server-side for non-admin user. This requires client-side localStorage.');
          return false; // Cannot authenticate non-admin on server
       }
    }
  } catch (error) {
    console.error('Error during authentication:', error);
    // Handle potential errors during employee fetching or comparison
    return false;
  }
};

/**
 * Checks if a user is currently logged in based on localStorage.
 * NOTE: Inherently client-side.
 * @returns string | null - The logged-in user ID or null if not logged in.
 */
export const checkLoginStatus = (): string | null => {
   if (typeof window !== 'undefined') {
     try {
       const loggedInUser = localStorage.getItem('loggedInUser');
       return loggedInUser;
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
 * NOTE: Inherently client-side.
 * @param userId - The ID of the user to store.
 */
export const storeLoginSession = (userId: string): void => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('loggedInUser', userId);
        console.log(`Stored login session for user: ${userId}`);
      } catch (error) {
        console.error('Error storing login session in localStorage:', error);
      }
    }
};
