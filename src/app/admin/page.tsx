// @ts-nocheck
'use client';

import type { NextPage } from 'next';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { getAttendanceRecords, generateAttendanceCsv, AttendanceRecord } from '@/services/attendance';
import { checkLoginStatus, logoutUser } from '@/services/auth';
import { Download, Filter, LogOut, Users, AlertTriangle, Loader2 } from 'lucide-react';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import Image from 'next/image';

const AdminPage: NextPage = () => {
  const router = useRouter();
  const { toast } = useToast();
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true); 
  const [isDownloading, setIsDownloading] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [authCheckCompleted, setAuthCheckCompleted] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (isClient) {
      const currentLoginStatus = checkLoginStatus();
      console.log(`AdminPage: Auth Check. Current login status from checkLoginStatus(): "${currentLoginStatus}"`);

      if (currentLoginStatus === 'admin') {
        console.log("AdminPage: User IS admin. Setting isAdminAuthenticated to true.");
        setIsAdminAuthenticated(true);
      } else {
        setIsAdminAuthenticated(false);
        let unauthorizedReason = 'Unknown reason for unauthorized access.';
        if (currentLoginStatus) { 
          unauthorizedReason = `User "${currentLoginStatus}" is not an administrator.`;
        } else { 
          unauthorizedReason = 'No user is logged in or session is invalid.';
        }
        console.log(`AdminPage: User IS NOT admin. Status: "${currentLoginStatus}". Reason: ${unauthorizedReason}. Redirecting to login.`);
        
        toast({ 
          title: 'Unauthorized Access', 
          description: `${unauthorizedReason} You must be an administrator to view this page. Redirecting...`, 
          variant: 'destructive' 
        });
        
        logoutUser(); 
        router.replace('/login');
      }
      setAuthCheckCompleted(true); 
    }
  }, [isClient, router, toast]);

  const fetchRecords = useCallback(async (range?: DateRange) => {
    if (!isClient || !authCheckCompleted || !isAdminAuthenticated) {
      console.log("AdminPage: fetchRecords skipped. Conditions: isClient:", isClient, "authCheckCompleted:", authCheckCompleted, "isAdminAuthenticated:", isAdminAuthenticated);
      return;
    }

    setIsLoading(true);
    setError(null);
    console.log("AdminPage: Fetching records for range:", range);
    try {
      const records = await getAttendanceRecords(range?.from, range?.to);
      console.log(`AdminPage: Fetched ${records.length} records.`);

      const processedRecords = records.map(record => ({
        ...record,
        timestamp: record.timestamp instanceof Date ? record.timestamp : new Date(record.timestamp || 0),
        inTime: record.inTime ? (record.inTime instanceof Date ? record.inTime : new Date(record.inTime)) : undefined,
        outTime: record.outTime ? (record.outTime instanceof Date ? record.outTime : new Date(record.outTime)) : undefined,
        employeeId: record.employeeId ?? 'N/A',
        phone: record.phone ?? 'N/A',
        name: record.name ?? 'N/A',
        latitude: record.latitude ?? 0,
        longitude: record.longitude ?? 0,
        address: record.address ?? 'N/A',
        captureMethod: record.captureMethod ?? 'unknown',
        shiftTiming: record.shiftTiming ?? 'N/A',
        workingLocation: record.workingLocation ?? 'N/A',
        photoDataUri: record.photoDataUri ?? '',
      })).filter(record => !isNaN(record.timestamp.getTime()));

      setAttendanceRecords(processedRecords);
    } catch (error: any) {
      console.error('AdminPage: Failed to fetch attendance records:', error);
      setError('Could not fetch attendance records. Please try again.');
      toast({ title: 'Error', description: 'Could not fetch attendance records.', variant: 'destructive' });
      setAttendanceRecords([]);
    } finally {
      setIsLoading(false);
    }
  }, [toast, isClient, authCheckCompleted, isAdminAuthenticated]); 

  useEffect(() => {
    if (isClient && authCheckCompleted && isAdminAuthenticated) {
      console.log("AdminPage: Authenticated and auth check complete, setting initial date range and fetching records.");
      const today = new Date();
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(today.getDate() - 7);
      const initialRange = { from: sevenDaysAgo, to: today };
      setDateRange(initialRange); 
      fetchRecords(initialRange); 
    } else if (isClient && authCheckCompleted && !isAdminAuthenticated) {
      console.log("AdminPage: Auth check complete, user not authenticated. Data fetching skipped.");
    }
  }, [isClient, authCheckCompleted, isAdminAuthenticated, fetchRecords]);


  const handleDateChange = useCallback((range: DateRange | undefined) => {
    console.log("AdminPage: Date range selected:", range);
    setDateRange(range);
    if (isClient && authCheckCompleted && isAdminAuthenticated) {
        fetchRecords(range);
    } else {
      console.log("AdminPage: handleDateChange - fetchRecords skipped due to auth status.");
    }
  }, [fetchRecords, isClient, authCheckCompleted, isAdminAuthenticated]);


  const handleDownloadCsv = useCallback(() => {
    if (attendanceRecords.length === 0) {
      toast({ title: 'No Data', description: 'There are no records in the selected range to download.', variant: 'warning' });
      return;
    }
    setIsDownloading(true);
    try {
      const csvData = generateAttendanceCsv(attendanceRecords);
      if (!csvData) {
        throw new Error("CSV data generation returned empty.");
      }

      const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);

      let filename = 'attendance_report';
      if (dateRange?.from) {
        try { filename += `_${formatDate(dateRange.from)}`; } catch { filename += '_invalid-start-date'; }
      }
      if (dateRange?.to) {
        try { filename += `_to_${formatDate(dateRange.to)}`; } catch { filename += '_invalid-end-date'; }
      } else if (dateRange?.from) {
        try { filename += `_on_${formatDate(dateRange.from)}`; } catch { filename += '_invalid-date'; }
      }
      filename += '.csv';

      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast({ title: 'Download Started', description: 'Your attendance report CSV is being generated.' });
    } catch (error: any) {
      console.error('AdminPage: Failed to generate or download CSV:', error);
      toast({ title: 'Download Error', description: `Could not generate the CSV file: ${error.message}`, variant: 'destructive' });
    } finally {
      setIsDownloading(false);
    }
  }, [attendanceRecords, dateRange, toast]);


  const formatDate = (date: Date | undefined): string => {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return 'invalid_date';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDisplayDateTime = (date: Date | undefined | string, type: 'date' | 'time'): string => {
    if (!date) return '--';
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return 'Invalid';
    try {
      if (type === 'date') return d.toLocaleDateString();
      if (type === 'time') return d.toLocaleTimeString();
      return '--';
    } catch {
      return 'Format Error';
    }
  };

  const handleLogout = useCallback(() => {
    logoutUser();
    toast({ title: 'Logged Out', description: 'You have been logged out.' });
    router.replace('/login');
  }, [router, toast]);

  const goToEmployeeManagement = () => {
    router.push('/admin/employees');
  };

  const memoizedRecords = useMemo(() => attendanceRecords, [attendanceRecords]);

  if (!isClient || !authCheckCompleted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-100 via-indigo-100 to-purple-200 dark:from-gray-800 dark:via-gray-900 dark:to-black">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
        <p className="ml-4 text-lg mt-4">Verifying authentication...</p>
      </div>
    );
  }

  if (!isAdminAuthenticated) {
     return (
         <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-red-100 to-red-200 dark:from-gray-800 dark:to-black">
            <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
            <p className="text-lg text-destructive">Unauthorized. Redirecting to login...</p>
         </div>
    );
  }

  return (
    <div className="relative flex flex-col min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-100 dark:from-gray-800 dark:via-gray-900 dark:to-black p-4 md:p-8 overflow-hidden">
      <Image
        data-ai-hint="office background"
        src="https://picsum.photos/seed/adminbg/1920/1080"
        alt="Admin background"
        fill
        style={{objectFit:"cover"}}
        quality={60}
        className="absolute inset-0 z-0 opacity-10 dark:opacity-5"
      />
      <header className="relative z-10 mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex flex-col">
          <h1 className="text-2xl md:text-3xl font-bold text-primary">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground">E Wheels and Logistics</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-center md:justify-end">
          <Button variant="outline" onClick={goToEmployeeManagement}>
            <Users className="mr-2 h-4 w-4" /> Manage Employees
          </Button>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" /> Logout
          </Button>
        </div>
      </header>

      <Card className="relative z-10 flex-grow shadow-xl bg-card/90 backdrop-blur-sm dark:bg-card/80 border border-border/50">
        <CardHeader>
          <CardTitle>Attendance Records</CardTitle>
          <CardDescription>View, filter, and download employee attendance data.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row gap-4 justify-between items-center p-4 bg-muted/50 rounded-lg border">
            <div className="flex items-center gap-2 w-full md:w-auto">
              <Filter className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              <DatePickerWithRange
                date={dateRange}
                onDateChange={handleDateChange}
              />
            </div>
            <Button
              onClick={handleDownloadCsv}
              disabled={isDownloading || isLoading || memoizedRecords.length === 0}
              className="w-full md:w-auto flex-shrink-0"
            >
              {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              {isDownloading ? 'Downloading...' : 'Download CSV'}
            </Button>
          </div>

          {error && (
            <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-md flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="mt-4">
            {isLoading ? ( 
              <div className="flex flex-col justify-center items-center h-64 text-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">Loading records for the selected period...</p>
              </div>
            ) : (
              <ScrollArea className="h-[60vh] rounded-md border">
                <Table>
                  <TableCaption>
                    {memoizedRecords.length === 0
                      ? 'No attendance records found for the selected date range.'
                      : `Showing ${memoizedRecords.length} records.`}
                  </TableCaption>
                  <TableHeader className="sticky top-0 bg-secondary/95 backdrop-blur-sm z-10">
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Employee ID</TableHead>
                      <TableHead className="whitespace-nowrap">Phone</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="whitespace-nowrap">Date</TableHead>
                      <TableHead className="whitespace-nowrap">Marked Time</TableHead>
                      <TableHead className="whitespace-nowrap">In Time</TableHead>
                      <TableHead className="whitespace-nowrap">Out Time</TableHead>
                      <TableHead className="whitespace-nowrap">Location (Lat, Lon)</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead className="whitespace-nowrap">Method</TableHead>
                      <TableHead className="whitespace-nowrap">Shift</TableHead>
                      <TableHead className="whitespace-nowrap">Work Location</TableHead>
                      <TableHead>Photo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {memoizedRecords.length > 0 ? (
                      memoizedRecords.map((record) => (
                        <TableRow key={record.id || record.timestamp.toISOString() + Math.random()}>
                          <TableCell className="whitespace-nowrap">{record.employeeId}</TableCell>
                          <TableCell className="whitespace-nowrap">{record.phone}</TableCell>
                          <TableCell>{record.name}</TableCell>
                          <TableCell className="whitespace-nowrap">{formatDisplayDateTime(record.timestamp, 'date')}</TableCell>
                          <TableCell className="whitespace-nowrap">{formatDisplayDateTime(record.timestamp, 'time')}</TableCell>
                          <TableCell className="whitespace-nowrap">{formatDisplayDateTime(record.inTime, 'time')}</TableCell>
                          <TableCell className="whitespace-nowrap">{formatDisplayDateTime(record.outTime, 'time')}</TableCell>
                          <TableCell className="whitespace-nowrap">{`${record.latitude?.toFixed(4) ?? 'N/A'}, ${record.longitude?.toFixed(4) ?? 'N/A'}`}</TableCell>
                          <TableCell className="min-w-[200px] max-w-xs truncate" title={record.address}>{record.address}</TableCell>
                          <TableCell className="whitespace-nowrap">{record.captureMethod}</TableCell>
                          <TableCell className="whitespace-nowrap">{record.shiftTiming}</TableCell>
                          <TableCell className="whitespace-nowrap">{record.workingLocation}</TableCell>
                          <TableCell>
                            {record.photoDataUri ? (
                              <a
                                href={record.photoDataUri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline text-sm"
                                title="View captured photo"
                              >
                                View
                              </a>
                            ) : (
                              <span className="text-muted-foreground text-sm">N/A</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={13} className="h-24 text-center text-muted-foreground">
                          No records found for the selected criteria. Adjust the date filter or add employees.
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
