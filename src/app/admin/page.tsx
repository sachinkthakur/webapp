'use client';

import type { NextPage } from 'next';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { getAttendanceRecords, generateAttendanceCsv, AttendanceRecord } from '@/services/attendance';
import { Download, Filter, LogOut, Users } from 'lucide-react';
import { DatePickerWithRange } from '@/components/ui/date-range-picker'; // Ensure this component exists
import type { DateRange } from 'react-day-picker';

const AdminPage: NextPage = () => {
  const router = useRouter();
  const { toast } = useToast();
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  // Check login status
  useEffect(() => {
    const loggedInUser = localStorage.getItem('loggedInUser');
    if (!loggedInUser || loggedInUser.toLowerCase() !== 'admin') {
      toast({ title: 'Unauthorized', description: 'Redirecting to login...', variant: 'destructive' });
      router.replace('/login');
    } else {
      // Fetch initial records if logged in as admin
      fetchRecords();
    }
  }, [router, toast]); // Added toast dependency

  // Fetch attendance records based on date range
  const fetchRecords = useCallback(async (range?: DateRange) => {
    setIsLoading(true);
    console.log("Fetching records for range:", range);
    try {
      const records = await getAttendanceRecords(range?.from, range?.to);
      // Ensure timestamp is a Date object
       const processedRecords = records.map(record => ({
            ...record,
            timestamp: new Date(record.timestamp) // Convert string/number back to Date if needed
       }));
       setAttendanceRecords(processedRecords);
       toast({ title: 'Records Loaded', description: `${records.length} records found.` });
    } catch (error) {
      console.error('Failed to fetch attendance records:', error);
      toast({ title: 'Error', description: 'Could not fetch attendance records.', variant: 'destructive' });
      setAttendanceRecords([]); // Clear records on error
    } finally {
      setIsLoading(false);
    }
  }, [toast]); // Added toast dependency

  // Handle date range change and fetch records
  const handleDateChange = (range: DateRange | undefined) => {
    setDateRange(range);
    fetchRecords(range); // Fetch records when date range changes
  };


  // Download attendance data as CSV
  const handleDownloadCsv = useCallback(() => {
    if (attendanceRecords.length === 0) {
      toast({ title: 'No Data', description: 'There are no records to download.', variant: 'warning' });
      return;
    }
    setIsDownloading(true);
    try {
      const csvData = generateAttendanceCsv(attendanceRecords);
      const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);

      // Generate filename with date range if available
      let filename = 'attendance_report';
      if (dateRange?.from) {
        filename += `_${dateRange.from.toISOString().split('T')[0]}`;
      }
      if (dateRange?.to) {
        filename += `_to_${dateRange.to.toISOString().split('T')[0]}`;
      } else if (dateRange?.from) {
        // If only 'from' date is selected, use it as a single date report
        filename += `_on_${dateRange.from.toISOString().split('T')[0]}`;
      }
       filename += '.csv';

      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url); // Clean up blob URL
      toast({ title: 'Download Started', description: 'CSV file is being generated.' });
    } catch (error) {
      console.error('Failed to generate CSV:', error);
      toast({ title: 'Download Error', description: 'Could not generate the CSV file.', variant: 'destructive' });
    } finally {
      setIsDownloading(false);
    }
  }, [attendanceRecords, dateRange, toast]); // Added dateRange and toast dependencies


  // Logout handler
  const handleLogout = useCallback(() => {
    localStorage.removeItem('loggedInUser');
    toast({ title: 'Logged Out', description: 'You have been logged out.' });
    router.replace('/login');
  }, [router, toast]); // Added toast dependency

  // Navigate to Employee Management
  const goToEmployeeManagement = () => {
    router.push('/admin/employees');
  };

   // Memoize the records to prevent unnecessary re-renders of the table
  const memoizedRecords = useMemo(() => attendanceRecords, [attendanceRecords]);

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-100 dark:from-gray-800 dark:via-gray-900 dark:to-black p-4 md:p-8">
      <header className="mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
        <h1 className="text-3xl font-bold text-primary">Admin Dashboard</h1>
        <div className="flex gap-2 flex-wrap justify-center">
           <Button variant="outline" onClick={goToEmployeeManagement}>
              <Users className="mr-2 h-4 w-4" /> Manage Employees
           </Button>
           <Button variant="outline" onClick={handleLogout}>
             <LogOut className="mr-2 h-4 w-4" /> Logout
           </Button>
        </div>
      </header>

      <Card className="flex-grow shadow-xl">
        <CardHeader>
          <CardTitle>Attendance Records</CardTitle>
          <CardDescription>View and manage employee attendance data.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filter and Download Section */}
          <div className="flex flex-col md:flex-row gap-4 justify-between items-center p-4 bg-muted/50 rounded-lg border">
             <div className="flex items-center gap-2">
                 <Filter className="h-5 w-5 text-muted-foreground" />
                 <DatePickerWithRange date={dateRange} onDateChange={handleDateChange} />
             </div>
            <Button
              onClick={handleDownloadCsv}
              disabled={isDownloading || isLoading || attendanceRecords.length === 0}
              className="w-full md:w-auto"
            >
              <Download className="mr-2 h-4 w-4" />
              {isDownloading ? 'Downloading...' : 'Download CSV'}
            </Button>
          </div>

          {/* Attendance Table */}
          <div className="mt-4">
            {isLoading ? (
              <div className="flex justify-center items-center h-64">
                 <p>Loading records...</p> {/* Or a spinner component */}
              </div>
            ) : (
              <ScrollArea className="h-[60vh] rounded-md border">
                <Table>
                  <TableCaption>
                    {memoizedRecords.length === 0 ? 'No attendance records found for the selected date range.' : `Showing ${memoizedRecords.length} records.`}
                  </TableCaption>
                  <TableHeader className="sticky top-0 bg-secondary">
                    <TableRow>
                      <TableHead>Employee ID</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                       <TableHead>In Time</TableHead>
                       <TableHead>Out Time</TableHead>
                      <TableHead>Location (Lat, Lon)</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>Method</TableHead>
                       <TableHead>Shift</TableHead>
                       <TableHead>Work Location</TableHead>
                       <TableHead>Photo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {memoizedRecords.length > 0 ? (
                      memoizedRecords.map((record) => (
                        <TableRow key={record.id || record.timestamp.toISOString()}>
                          <TableCell>{record.employeeId}</TableCell>
                          <TableCell>{record.phone}</TableCell>
                          <TableCell>{record.name}</TableCell>
                           {/* Ensure timestamp is formatted correctly */}
                          <TableCell>{record.timestamp instanceof Date ? record.timestamp.toLocaleDateString() : 'Invalid Date'}</TableCell>
                          <TableCell>{record.timestamp instanceof Date ? record.timestamp.toLocaleTimeString() : 'Invalid Time'}</TableCell>
                           {/* Format In/Out times */}
                          <TableCell>{record.inTime ? new Date(record.inTime).toLocaleTimeString() : '--'}</TableCell>
                           <TableCell>{record.outTime ? new Date(record.outTime).toLocaleTimeString() : '--'}</TableCell>
                          <TableCell>{`${record.latitude.toFixed(4)}, ${record.longitude.toFixed(4)}`}</TableCell>
                          <TableCell className="max-w-xs truncate" title={record.address}>{record.address}</TableCell>
                          <TableCell>{record.captureMethod}</TableCell>
                           <TableCell>{record.shiftTiming || '--'}</TableCell>
                           <TableCell>{record.workingLocation || '--'}</TableCell>
                           <TableCell>
                             {record.photoDataUri ? (
                               <a href={record.photoDataUri} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                 View
                               </a>
                             ) : (
                               'N/A'
                             )}
                           </TableCell>
                        </TableRow>
                      ))
                    ) : (
                       <TableRow>
                         <TableCell colSpan={13} className="h-24 text-center">
                           No records found for the selected criteria.
                         </TableCell>
                       </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminPage;
