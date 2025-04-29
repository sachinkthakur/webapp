// In a real application, you would replace localStorage with API calls to your backend.
// For demonstration purposes, we'll use localStorage.
// NOTE: Functions using localStorage are inherently client-side dependent.

// Define the structure of an Employee
export interface Employee {
  id: string; // Unique identifier (could be UUID generated on creation)
  employeeId: string; // The ID assigned by the company
  name: string;
  phone: string; // Should be unique for login/identification
  shiftTiming: string; // e.g., "9 AM - 5 PM"
  workingLocation: string; // e.g., "North Zone", "Site A"
  // Add other relevant employee details here
}

// Define the structure for an attendance record
export interface AttendanceRecord {
  id?: string; // Optional: Could be assigned by the backend/database
  employeeId: string; // Link to the Employee
  phone: string; // Store phone for easier lookup/display
  name: string; // Store name for easier display
  timestamp: Date;
  latitude: number;
  longitude: number;
  address: string;
  photoDataUri: string; // Selfie photo as base64 data URI
  captureMethod: 'auto' | 'manual'; // How the attendance was marked
  shiftTiming: string; // Record shift at time of attendance
  workingLocation: string; // Record location at time of attendance
  isLate?: boolean; // Optional: Calculated based on shift timing
  inTime?: Date; // First record of the day for this employee
  outTime?: Date; // Last record of the day for this employee (updated on subsequent marks)
}

// --- Employee Management ---

/**
 * Fetches all registered employees from localStorage.
 * Handles potential errors during access or parsing.
 */
export const getEmployees = async (): Promise<Employee[]> => {
  console.log("Fetching employees from localStorage");
  if (typeof window === 'undefined') {
    console.warn("localStorage is not available on the server. Cannot get employees.");
    return [];
  }
  try {
    const employeesJson = localStorage.getItem('employees');
    return employeesJson ? JSON.parse(employeesJson) : [];
  } catch (error) {
    console.error("Error fetching or parsing employees from localStorage:", error);
    // Optionally clear corrupted data: localStorage.removeItem('employees');
    return []; // Return empty array on error
  }
};

/**
 * Adds a new employee to localStorage.
 * Returns the added employee (potentially with a server-assigned ID).
 */
export const addEmployee = async (employeeData: Omit<Employee, 'id'>): Promise<Employee> => {
    if (typeof window === 'undefined') {
        throw new Error("Cannot add employee: localStorage is not available on the server.");
    }
    console.log("Adding employee to localStorage:", employeeData);
    const employees = await getEmployees();

    // Basic validation (add more robust validation as needed)
    if (!employeeData.employeeId || !employeeData.name || !employeeData.phone) {
        throw new Error("Employee ID, Name, and Phone Number are required.");
    }
     if (employees.some(emp => emp.employeeId === employeeData.employeeId)) {
       throw new Error(`Employee ID "${employeeData.employeeId}" already exists.`);
     }
    if (employees.some(emp => emp.phone === employeeData.phone)) {
        throw new Error(`Phone number "${employeeData.phone}" is already registered.`);
    }

    // Assign a simple unique ID for localStorage demo
    const newEmployee: Employee = { ...employeeData, id: `emp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}` }; // Added randomness

    try {
        employees.push(newEmployee);
        localStorage.setItem('employees', JSON.stringify(employees));
        console.log("Employee added:", newEmployee);
        return newEmployee;
    } catch (error) {
         console.error("Error saving employees to localStorage:", error);
         throw new Error("Failed to save employee data."); // Rethrow or handle appropriately
    }
};

/**
 * Updates an existing employee in localStorage.
 */
export const updateEmployee = async (updatedEmployeeData: Employee): Promise<Employee> => {
     if (typeof window === 'undefined') {
         throw new Error("Cannot update employee: localStorage is not available on the server.");
     }
    console.log("Updating employee in localStorage:", updatedEmployeeData);
    let employees = await getEmployees();

     // Basic validation
     if (!updatedEmployeeData.id) {
        throw new Error("Employee ID (internal) is required for updates.");
     }
    if (!updatedEmployeeData.employeeId || !updatedEmployeeData.name || !updatedEmployeeData.phone) {
        throw new Error("Employee ID, Name, and Phone Number are required.");
    }

    // Check for conflicts (excluding the current employee being updated)
    if (employees.some(emp => emp.employeeId === updatedEmployeeData.employeeId && emp.id !== updatedEmployeeData.id)) {
        throw new Error(`Employee ID "${updatedEmployeeData.employeeId}" already exists.`);
    }
    if (employees.some(emp => emp.phone === updatedEmployeeData.phone && emp.id !== updatedEmployeeData.id)) {
        throw new Error(`Phone number "${updatedEmployeeData.phone}" is already registered.`);
    }

    const employeeIndex = employees.findIndex(emp => emp.id === updatedEmployeeData.id);

    if (employeeIndex === -1) {
        throw new Error(`Employee with internal ID "${updatedEmployeeData.id}" not found.`);
    }

    try {
        employees[employeeIndex] = updatedEmployeeData;
        localStorage.setItem('employees', JSON.stringify(employees));
        console.log("Employee updated:", updatedEmployeeData);
        return updatedEmployeeData;
    } catch (error) {
        console.error("Error saving updated employees to localStorage:", error);
        throw new Error("Failed to update employee data."); // Rethrow or handle appropriately
    }
};

/**
 * Deletes an employee from localStorage.
 */
export const deleteEmployee = async (employeeInternalId: string): Promise<void> => {
   if (typeof window === 'undefined') {
      console.warn("Cannot delete employee: localStorage is not available on the server.");
      return; // Or throw error depending on requirements
   }
  console.log("Deleting employee from localStorage, ID:", employeeInternalId);
  let employees = await getEmployees();
  const initialLength = employees.length;
  employees = employees.filter(emp => emp.id !== employeeInternalId);

  if (employees.length === initialLength) {
     console.warn(`Employee with internal ID "${employeeInternalId}" not found for deletion.`);
     // Depending on requirements, you might throw an error or just log a warning
     // throw new Error(`Employee with internal ID "${employeeInternalId}" not found.`);
  } else {
     try {
        localStorage.setItem('employees', JSON.stringify(employees));
        console.log("Employee deleted successfully.");
         // Optional: Delete associated attendance records (ensure this is also client-side safe)
         // await deleteAttendanceRecordsForEmployee(employeeId); // Implement this if needed
     } catch (error) {
        console.error("Error saving employees after deletion to localStorage:", error);
        throw new Error("Failed to update employee list after deletion."); // Rethrow or handle appropriately
     }
  }
};

/**
 * Fetches a single employee by their user ID (phone or employeeId) from localStorage.
 * Needed for the attendance page to get employee details.
 */
export const getEmployeeById = async (userId: string): Promise<Employee | null> => {
  console.log(`Fetching employee data for ID/Phone: ${userId}`);
  if (typeof window === 'undefined') {
      console.warn("localStorage is not available on the server. Cannot get employee by ID.");
      return null;
  }
  try {
    const employees = await getEmployees();
    const employee = employees.find(emp => emp.phone === userId || emp.employeeId === userId);
    return employee || null;
  } catch (error) {
    console.error("Error fetching employee by ID:", error);
    return null;
  }
};


// --- Attendance Management ---

/**
 * Fetches all attendance records from localStorage, optionally filtered by date range.
 * Handles potential errors during access or parsing.
 */
export const getAttendanceRecords = async (startDate?: Date, endDate?: Date): Promise<AttendanceRecord[]> => {
  console.log(`Fetching attendance records from localStorage. Dates: ${startDate?.toISOString()} to ${endDate?.toISOString()}`);
   if (typeof window === 'undefined') {
      console.warn("localStorage is not available on the server. Cannot get attendance records.");
      return [];
   }

  let records: AttendanceRecord[] = [];
  try {
      const recordsJson = localStorage.getItem('attendanceRecords');
      if (recordsJson) {
        // Safely parse and ensure timestamp is a Date object
        const parsedData = JSON.parse(recordsJson);
        if (Array.isArray(parsedData)) {
            records = parsedData.map(record => ({
                ...record,
                // Ensure timestamp exists and is valid before creating Date
                timestamp: record.timestamp ? new Date(record.timestamp) : new Date(0), // Default to epoch if invalid/missing
                inTime: record.inTime ? new Date(record.inTime) : undefined,
                outTime: record.outTime ? new Date(record.outTime) : undefined,
            })).filter(record => !isNaN(record.timestamp.getTime())); // Filter out records with invalid dates
        } else {
             console.warn("Attendance records in localStorage are not an array. Resetting.");
             localStorage.removeItem('attendanceRecords');
        }
      }
  } catch (error) {
      console.error("Error fetching or parsing attendance records from localStorage:", error);
      // Optionally clear corrupted data: localStorage.removeItem('attendanceRecords');
      return []; // Return empty array on error
  }


  // Filter by date range if provided
  if (startDate || endDate) {
    records = records.filter(record => {
       if (!(record.timestamp instanceof Date) || isNaN(record.timestamp.getTime())) {
         return false; // Skip records with invalid timestamps
       }
       const recordDate = record.timestamp;
       // Set time to 00:00:00 for start date comparison
       const start = startDate ? new Date(startDate.setHours(0, 0, 0, 0)) : null;
       // Set time to 23:59:59 for end date comparison
       const end = endDate ? new Date(endDate.setHours(23, 59, 59, 999)) : null;

      const isAfterStart = start ? recordDate >= start : true;
      const isBeforeEnd = end ? recordDate <= end : true;
      // console.log(`Record ${record.id} timestamp: ${recordDate.toISOString()}, Start: ${start?.toISOString()}, End: ${end?.toISOString()}, Filter Result: ${isAfterStart && isBeforeEnd}`);
      return isAfterStart && isBeforeEnd;
    });
  }

  // Sort by timestamp, most recent first (descending)
  records.sort((a, b) => {
     const timeA = a.timestamp instanceof Date ? a.timestamp.getTime() : 0;
     const timeB = b.timestamp instanceof Date ? b.timestamp.getTime() : 0;
     return timeB - timeA;
  });

  // console.log(`Filtered and sorted records count: ${records.length}`);
  return records;
};

/**
 * Saves a new attendance record to localStorage.
 * Handles IN/OUT time logic.
 */
export const saveAttendance = async (record: Omit<AttendanceRecord, 'id'>): Promise<AttendanceRecord> => {
   if (typeof window === 'undefined') {
        throw new Error("Cannot save attendance: localStorage is not available on the server.");
   }
  console.log("Saving attendance record to localStorage (data):", { ...record, photoDataUri: 'omitted for brevity' });
  const allRecords = await getAttendanceRecords(); // Get all records first

  // Assign a simple unique ID for localStorage demo
  const newRecord: AttendanceRecord = {
     ...record,
     id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`, // Added randomness
     timestamp: new Date(record.timestamp), // Ensure it's a Date object
   };


  // --- IN/OUT Time Logic ---
  const todayStart = new Date(newRecord.timestamp);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayStart.getDate() + 1);

  // Find records for the same employee on the same calendar day
  const todaysEmployeeRecords = allRecords
    .filter(r =>
        r.employeeId === newRecord.employeeId &&
        r.timestamp >= todayStart &&
        r.timestamp < todayEnd
    )
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()); // Sort oldest first


   if (todaysEmployeeRecords.length === 0) {
     // This is the first record of the day for this employee
     newRecord.inTime = newRecord.timestamp;
     newRecord.outTime = undefined; // Explicitly set outTime to undefined
     console.log(`Setting IN time for ${newRecord.employeeId} on ${todayStart.toDateString()}: ${newRecord.inTime.toLocaleTimeString()}`);
   } else {
      // This is a subsequent record for the day
      // Use the IN time from the earliest record of the day
      newRecord.inTime = todaysEmployeeRecords[0].inTime || todaysEmployeeRecords[0].timestamp; // Fallback to timestamp if inTime missing
      // This new record becomes the latest OUT time for the day so far
      newRecord.outTime = newRecord.timestamp;
       console.log(`Setting OUT time for ${newRecord.employeeId} on ${todayStart.toDateString()}: ${newRecord.outTime.toLocaleTimeString()} (In: ${newRecord.inTime.toLocaleTimeString()})`);

      // --- Crucially, update the outTime on *previous* records for this day ---
      // This ensures the Admin view shows the correct latest outTime for the day on all records of that day
      todaysEmployeeRecords.forEach(existingRecord => {
         if (existingRecord.id) { // Only update if it has an ID (it should)
            const index = allRecords.findIndex(r => r.id === existingRecord.id);
            if (index !== -1) {
               allRecords[index].outTime = newRecord.outTime; // Update the outTime
               allRecords[index].inTime = newRecord.inTime; // Also update inTime for consistency on older records
               // console.log(`Updating existing record ${allRecords[index].id} with Out: ${newRecord.outTime.toLocaleTimeString()}, In: ${newRecord.inTime.toLocaleTimeString()}`);
            }
         }
      });
   }
  // --- End IN/OUT Logic ---

  // Add the *new* record to the main list
  allRecords.unshift(newRecord); // Add to the beginning

  // Filter out any potentially duplicated records before saving (just in case)
   const uniqueRecords = Array.from(new Map(allRecords.map(item => [item.id, item])).values());

   // Sort again before saving to maintain order (optional, but good practice)
   uniqueRecords.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());


  try {
      localStorage.setItem('attendanceRecords', JSON.stringify(uniqueRecords));
      console.log(`Attendance record saved: ${newRecord.id}, Total records now: ${uniqueRecords.length}`);
      return newRecord; // Return the newly created record with potentially added in/out times
  } catch (error) {
      console.error("Error saving attendance records to localStorage:", error);
      throw new Error("Failed to save attendance data."); // Rethrow or handle appropriately
  }
};


// --- Utility Functions (Example) ---

/**
 * Generates a CSV string from attendance records.
 */
export const generateAttendanceCsv = (records: AttendanceRecord[]): string => {
  console.log(`Generating CSV for ${records.length} records.`);
  if (!records || records.length === 0) {
    return '';
  }

   // Define headers carefully - match the order in the rows
   const headers = [
    "Employee ID",
    "Phone Number",
    "Name",
    "Date",
    "Marked Time", // Renamed from "Time" for clarity
    "In Time", // Add In Time column
    "Out Time", // Add Out Time column
    "Shift Timing",
    "Working Location",
    "Latitude",
    "Longitude",
    "Address",
    "Capture Method",
    // "Photo Data URI" // Usually too large for CSV, maybe link or omit
  ];

   // Function to format date/time, handling undefined or invalid dates
    const formatDateTime = (date: Date | undefined | string, type: 'date' | 'time'): string => {
        if (!date) return '--';
        const d = date instanceof Date ? date : new Date(date); // Ensure it's a Date object
        if (isNaN(d.getTime())) return 'Invalid Date'; // Check if the date is valid

        try {
            if (type === 'date') return d.toLocaleDateString();
            if (type === 'time') return d.toLocaleTimeString();
            return '--';
        } catch (e) {
            console.error("Error formatting date:", d, e);
            return 'Format Error';
        }
    };

    // Helper to escape CSV fields containing commas or double quotes
    const escapeCsvField = (field: string | number | undefined): string => {
        if (field === undefined || field === null) return '""';
        const stringField = String(field);
        // If the field contains a comma, double quote, or newline, enclose in double quotes and escape existing double quotes
        if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
            return `"${stringField.replace(/"/g, '""')}"`;
        }
        return stringField; // Return as is if no special characters
    };


  const csvRows = [
    headers.join(','), // Header row
    ...records.map(record => [
      escapeCsvField(record.employeeId),
      escapeCsvField(record.phone),
      escapeCsvField(record.name),
      formatDateTime(record.timestamp, 'date'),
      formatDateTime(record.timestamp, 'time'), // Marked time
      formatDateTime(record.inTime, 'time'), // Format IN time
      formatDateTime(record.outTime, 'time'), // Format OUT time
      escapeCsvField(record.shiftTiming),
      escapeCsvField(record.workingLocation),
      escapeCsvField(record.latitude?.toFixed(6)), // Add precision if needed
      escapeCsvField(record.longitude?.toFixed(6)),
      escapeCsvField(record.address),
      escapeCsvField(record.captureMethod),
    ].join(',')) // Join values into a CSV row
  ];

  return csvRows.join('\n'); // Join rows with newline characters
};
