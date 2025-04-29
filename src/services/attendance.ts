// In a real application, you would replace localStorage with API calls to your backend.
// For demonstration purposes, we'll use localStorage.

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
  inTime?: Date; // First record of the day
  outTime?: Date; // Last record of the day
}

// --- Employee Management ---

/**
 * Fetches all registered employees.
 * In a real app, this would fetch from a backend API.
 */
export const getEmployees = async (): Promise<Employee[]> => {
  console.log("Fetching employees from localStorage");
  const employeesJson = localStorage.getItem('employees');
  return employeesJson ? JSON.parse(employeesJson) : [];
};

/**
 * Adds a new employee.
 * In a real app, this would send data to a backend API.
 * Returns the added employee (potentially with a server-assigned ID).
 */
export const addEmployee = async (employeeData: Omit<Employee, 'id'>): Promise<Employee> => {
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
    const newEmployee: Employee = { ...employeeData, id: `emp_${Date.now()}` };
    employees.push(newEmployee);
    localStorage.setItem('employees', JSON.stringify(employees));
    console.log("Employee added:", newEmployee);
    return newEmployee;
};


/**
 * Updates an existing employee.
 * In a real app, this would send data to a backend API.
 */
export const updateEmployee = async (updatedEmployeeData: Employee): Promise<Employee> => {
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


    employees[employeeIndex] = updatedEmployeeData;
    localStorage.setItem('employees', JSON.stringify(employees));
    console.log("Employee updated:", updatedEmployeeData);
    return updatedEmployeeData;
};


/**
 * Deletes an employee.
 * In a real app, this would send a request to a backend API.
 */
export const deleteEmployee = async (employeeInternalId: string): Promise<void> => {
  console.log("Deleting employee from localStorage, ID:", employeeInternalId);
  let employees = await getEmployees();
  const initialLength = employees.length;
  employees = employees.filter(emp => emp.id !== employeeInternalId);

  if (employees.length === initialLength) {
     console.warn(`Employee with internal ID "${employeeInternalId}" not found for deletion.`);
     // Depending on requirements, you might throw an error or just log a warning
     // throw new Error(`Employee with internal ID "${employeeInternalId}" not found.`);
  } else {
    localStorage.setItem('employees', JSON.stringify(employees));
    console.log("Employee deleted successfully.");
     // Optional: Delete associated attendance records
     // await deleteAttendanceRecordsForEmployee(employeeId); // Implement this if needed
  }
};

/**
 * Fetches a single employee by their user ID (phone or employeeId).
 * Needed for the attendance page to get employee details.
 */
export const getEmployeeById = async (userId: string): Promise<Employee | null> => {
  console.log(`Fetching employee data for ID/Phone: ${userId}`);
  const employees = await getEmployees();
  const employee = employees.find(emp => emp.phone === userId || emp.employeeId === userId);
  return employee || null;
};


// --- Attendance Management ---

/**
 * Fetches all attendance records, optionally filtered by date range.
 * In a real app, this would fetch from a backend API with date filtering parameters.
 */
export const getAttendanceRecords = async (startDate?: Date, endDate?: Date): Promise<AttendanceRecord[]> => {
  console.log(`Fetching attendance records from localStorage. Dates: ${startDate} to ${endDate}`);
  const recordsJson = localStorage.getItem('attendanceRecords');
  let records: AttendanceRecord[] = recordsJson ? JSON.parse(recordsJson) : [];

  // Ensure timestamps are Date objects
   records = records.map(record => ({
        ...record,
        timestamp: new Date(record.timestamp) // Convert string back to Date
   }));

  if (startDate || endDate) {
    records = records.filter(record => {
      const recordDate = record.timestamp;
      // Set time to 00:00:00 for start date comparison
       const start = startDate ? new Date(startDate.setHours(0, 0, 0, 0)) : null;
       // Set time to 23:59:59 for end date comparison
       const end = endDate ? new Date(endDate.setHours(23, 59, 59, 999)) : null;

      const isAfterStart = start ? recordDate >= start : true;
      const isBeforeEnd = end ? recordDate <= end : true;
      return isAfterStart && isBeforeEnd;
    });
  }

  // Sort by timestamp, most recent first
  records.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  return records;
};

/**
 * Saves a new attendance record.
 * In a real app, this would send data to a backend API.
 * This version also handles basic IN/OUT time logic for the demo.
 */
export const saveAttendance = async (record: AttendanceRecord): Promise<AttendanceRecord> => {
  console.log("Saving attendance record to localStorage:", record);
  const records = await getAttendanceRecords(); // Get all records first

  // Assign a simple unique ID for localStorage demo
  const newRecord = { ...record, id: `att_${Date.now()}` };

  // --- Basic IN/OUT Time Logic (Demonstration) ---
   // Find records for the same employee on the same day
   const today = new Date(record.timestamp);
   today.setHours(0, 0, 0, 0);
   const tomorrow = new Date(today);
   tomorrow.setDate(today.getDate() + 1);

  const todaysRecords = records.filter(r =>
    r.employeeId === record.employeeId &&
    r.timestamp >= today &&
    r.timestamp < tomorrow
   ).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()); // Sort oldest first for IN/OUT

   if (todaysRecords.length === 0) {
     // This is the first record of the day - consider it IN time
     newRecord.inTime = record.timestamp;
     console.log(`Setting IN time for ${record.employeeId} on ${today.toDateString()}: ${newRecord.inTime.toLocaleTimeString()}`);
   } else {
      // Subsequent record - update OUT time on the *last* record of the day
      // For simplicity in this demo, we just mark the current one as a potential OUT time.
      // A more robust solution would track IN/OUT pairs or use a dedicated flag.
      newRecord.outTime = record.timestamp;
      console.log(`Setting potential OUT time for ${record.employeeId} on ${today.toDateString()}: ${newRecord.outTime.toLocaleTimeString()}`);
      // You might want to update the *actual* last record's outTime here if needed.
   }
  // --- End IN/OUT Logic ---


  records.unshift(newRecord); // Add to the beginning for easy viewing (most recent first)
  localStorage.setItem('attendanceRecords', JSON.stringify(records));
  console.log("Attendance record saved:", newRecord);
  return newRecord;
};


// --- Utility Functions (Example) ---

/**
 * Generates a CSV string from attendance records.
 */
export const generateAttendanceCsv = (records: AttendanceRecord[]): string => {
  if (!records || records.length === 0) {
    return '';
  }

   // Define headers carefully - match the order in the rows
   const headers = [
    "Employee ID",
    "Phone Number",
    "Name",
    "Date",
    "Time",
    "In Time", // Add In Time column
    "Out Time", // Add Out Time column
    "Latitude",
    "Longitude",
    "Address",
    "Capture Method",
    "Shift Timing",
    "Working Location",
    // "Photo Data URI" // Usually too large for CSV, maybe link or omit
  ];

   // Function to format date/time, handling undefined
   const formatDateTime = (date: Date | undefined, type: 'date' | 'time') => {
     if (!date) return '';
     if (type === 'date') return date.toLocaleDateString();
     if (type === 'time') return date.toLocaleTimeString();
     return '';
   };

  const csvRows = [
    headers.join(','), // Header row
    ...records.map(record => [
      `"${record.employeeId}"`, // Enclose in quotes if necessary
      `"${record.phone}"`,
      `"${record.name}"`,
      formatDateTime(record.timestamp, 'date'),
      formatDateTime(record.timestamp, 'time'),
       formatDateTime(record.inTime, 'time'), // Format IN time
       formatDateTime(record.outTime, 'time'), // Format OUT time
      record.latitude,
      record.longitude,
      `"${record.address.replace(/"/g, '""')}"`, // Escape double quotes within address
      record.captureMethod,
      `"${record.shiftTiming}"`,
      `"${record.workingLocation}"`,
    ].join(',')) // Join values into a CSV row
  ];

  return csvRows.join('\n'); // Join rows with newline characters
};
