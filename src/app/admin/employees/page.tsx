'use client';

import type { NextPage } from 'next';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { getEmployees, addEmployee, updateEmployee, deleteEmployee, Employee } from '@/services/attendance';
import { checkLoginStatus, logoutUser } from '@/services/auth';
import { PlusCircle, Edit, Trash2, LogOut, ArrowLeft, Loader2, AlertTriangle } from 'lucide-react';
import Image from 'next/image';

const employeeSchema = z.object({
  id: z.string().optional(),
  employeeId: z.string().min(1, 'Employee ID is required'),
  name: z.string().min(1, 'Name is required'),
  phone: z.string()
    .length(10, 'Phone number must be exactly 10 digits')
    .regex(/^[6-9]\d{9}$/, 'Invalid Indian mobile number format (must be 10 digits, starting with 6-9)')
    .trim(),
  shiftTiming: z.string().min(1, 'Shift Timing is required (e.g., 9 AM - 5 PM)').trim(),
  workingLocation: z.string().min(1, 'Working Location is required').trim(),
});

type EmployeeFormValues = z.infer<typeof employeeSchema>;

const EmployeeManagementPage: NextPage = () => {
  const router = useRouter();
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true); 
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
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
      console.log(`EmployeeManagementPage: Auth Check. Current login status from checkLoginStatus(): "${currentLoginStatus}"`);

      if (currentLoginStatus === 'admin') {
        console.log("EmployeeManagementPage: User IS admin. Setting isAdminAuthenticated to true.");
        setIsAdminAuthenticated(true);
      } else {
        setIsAdminAuthenticated(false);
        let unauthorizedReason = 'Unknown reason for unauthorized access.';
        if (currentLoginStatus) { 
          unauthorizedReason = `User "${currentLoginStatus}" is not an administrator.`;
        } else { 
          unauthorizedReason = 'No user is logged in or session is invalid.';
        }
        console.log(`EmployeeManagementPage: User IS NOT admin. Status: "${currentLoginStatus}". Reason: ${unauthorizedReason}. Redirecting to login.`);
        
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


  const fetchEmployees = useCallback(async () => {
    if (!isClient || !authCheckCompleted || !isAdminAuthenticated) {
      console.log("EmployeeManagementPage: fetchEmployees skipped. Conditions: isClient:", isClient, "authCheckCompleted:", authCheckCompleted, "isAdminAuthenticated:", isAdminAuthenticated);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const fetchedEmployees = await getEmployees();
      fetchedEmployees.sort((a, b) => a.name.localeCompare(b.name));
      setEmployees(fetchedEmployees);
    } catch (error: any) {
      console.error('EmployeeManagementPage: Failed to fetch employees:', error);
      setError('Could not fetch employee list. Please try refreshing the page.');
      toast({ title: 'Error', description: 'Could not fetch employees.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [toast, isClient, authCheckCompleted, isAdminAuthenticated]);

  useEffect(() => {
    if (isClient && authCheckCompleted && isAdminAuthenticated) {
      console.log("EmployeeManagementPage: Authenticated and auth check complete, fetching employees.");
      fetchEmployees();
    } else if (isClient && authCheckCompleted && !isAdminAuthenticated) {
      console.log("EmployeeManagementPage: Auth check complete, user not authenticated. Data fetching skipped.");
    }
  }, [isClient, authCheckCompleted, isAdminAuthenticated, fetchEmployees]);


  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      employeeId: '',
      name: '',
      phone: '',
      shiftTiming: '',
      workingLocation: '',
      id: undefined,
    },
  });


  const handleOpenDialog = (employee: Employee | null = null) => {
    setEditingEmployee(employee);
    setError(null);
    form.clearErrors();

    if (employee) {
      form.reset({
        id: employee.id,
        employeeId: employee.employeeId,
        name: employee.name,
        phone: employee.phone,
        shiftTiming: employee.shiftTiming,
        workingLocation: employee.workingLocation,
      });
    } else {
      form.reset({
        employeeId: '',
        name: '',
        phone: '',
        shiftTiming: '',
        workingLocation: '',
        id: undefined,
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingEmployee(null);
    form.reset();
    setError(null);
  };

  const onSubmit = async (data: EmployeeFormValues) => {
    setIsSubmitting(true);
    setError(null);
    try {
      if (editingEmployee && data.id) {
        const updatedData: Employee = {
          ...data,
          id: data.id,
          employeeId: data.employeeId,
          name: data.name,
          phone: data.phone,
          shiftTiming: data.shiftTiming,
          workingLocation: data.workingLocation,
        };
        await updateEmployee(updatedData);
        toast({ title: 'Success', description: 'Employee updated successfully.' });
      } else {
        const { id, ...newData } = data;
        await addEmployee(newData);
        toast({ title: 'Success', description: 'Employee added successfully.' });
      }
      await fetchEmployees();
      handleCloseDialog();
    } catch (error: any) {
      console.error('EmployeeManagementPage: Failed to save employee:', error);
      let errorMessage = 'Failed to save employee. Please try again.';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      setError(errorMessage);
      toast({ title: 'Save Error', description: errorMessage, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (employeeToDelete: Employee) => {
    if (!confirm(`Are you sure you want to delete employee "${employeeToDelete.name}" (ID: ${employeeToDelete.employeeId})? This action cannot be undone.`)) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      if (!employeeToDelete.id) {
        throw new Error("Cannot delete employee: Internal ID is missing.");
      }
      await deleteEmployee(employeeToDelete.id);
      toast({ title: 'Success', description: `Employee "${employeeToDelete.name}" deleted successfully.` });
      await fetchEmployees();
    } catch (error: any) {
      console.error('EmployeeManagementPage: Failed to delete employee:', error);
      setError(`Could not delete employee: ${error.message || 'Unknown error'}`);
      toast({ title: 'Deletion Error', description: `Could not delete employee: ${error.message || 'Unknown error'}`, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const goBack = () => {
    router.push('/admin');
  };

  const handleLogout = useCallback(() => {
    logoutUser();
    toast({ title: 'Logged Out', description: 'You have been logged out.' });
    router.replace('/login');
  }, [router, toast]);

  if (!isClient || !authCheckCompleted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-indigo-100 via-purple-100 to-pink-200 dark:from-gray-800 dark:via-gray-900 dark:to-black">
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
    <div className="relative flex flex-col min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-100 dark:from-gray-800 dark:via-gray-900 dark:to-black p-4 md:p-8 overflow-hidden">
      <Image
        data-ai-hint="office background"
        src="https://picsum.photos/seed/employeebg/1920/1080"
        alt="Employee background"
        fill
        style={{objectFit:"cover"}}
        quality={60}
        className="absolute inset-0 z-0 opacity-10 dark:opacity-5"
      />

      <header className="relative z-10 mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goBack} aria-label="Go back to admin dashboard">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl md:text-3xl font-bold text-primary">Manage Employees</h1>
        </div>
        <div className="flex gap-2 flex-wrap justify-center md:justify-end">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog()}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add Employee
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px] z-50 bg-card/95 backdrop-blur-sm dark:bg-card/90 border border-border/50">
              <DialogHeader>
                <DialogTitle>{editingEmployee ? 'Edit Employee' : 'Add New Employee'}</DialogTitle>
                <DialogDescription>
                  {editingEmployee ? 'Update the details for this employee.' : 'Fill in the details for the new employee. Use their 10-digit phone number for login.'}
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                  <FormField
                    control={form.control}
                    name="employeeId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Employee ID</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., EMP123" {...field} disabled={isSubmitting} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., John Doe" {...field} disabled={isSubmitting} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number (10 digits - for login)</FormLabel>
                        <FormControl>
                          <Input type="tel" placeholder="e.g., 9876543210" {...field} disabled={isSubmitting} maxLength={10} />
                        </FormControl>
                        <FormDescription>
                          Enter 10-digit mobile number without country code. This will be their login ID.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="shiftTiming"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Shift Timing</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., 9:00 AM - 6:00 PM" {...field} disabled={isSubmitting} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="workingLocation"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Working Location</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Main Office / Site A" {...field} disabled={isSubmitting} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {error && (
                    <p className="text-sm text-destructive flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0" /> {error}
                    </p>
                  )}
                  <DialogFooter className="mt-6">
                    <DialogClose asChild>
                      <Button type="button" variant="outline" onClick={handleCloseDialog} disabled={isSubmitting}>
                        Cancel
                      </Button>
                    </DialogClose>
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {editingEmployee ? 'Save Changes' : 'Add Employee'}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" /> Logout
          </Button>
        </div>
      </header>

      <Card className="relative z-10 flex-grow shadow-xl bg-card/90 backdrop-blur-sm dark:bg-card/80 border border-border/50">
        <CardHeader>
          <CardTitle>Registered Employees</CardTitle>
          <CardDescription>List of all employees in the system. Click '+' to add, or use actions to edit/delete.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && !isDialogOpen && (
            <div className="mb-4 p-4 bg-destructive/10 border border-destructive/30 rounded-md flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
          {isLoading && isAdminAuthenticated ? ( 
            <div className="flex flex-col justify-center items-center h-64 text-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">Loading employee list...</p>
            </div>
          ) : (
            <ScrollArea className="h-[60vh] rounded-md border">
              <Table>
                <TableCaption>
                  {employees.length === 0 ? 'No employees added yet.' : `Showing ${employees.length} registered employees.`}
                </TableCaption>
                <TableHeader className="sticky top-0 bg-secondary/95 backdrop-blur-sm z-10">
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Employee ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="whitespace-nowrap">Phone (Login ID)</TableHead>
                    <TableHead className="whitespace-nowrap">Shift Timing</TableHead>
                    <TableHead className="whitespace-nowrap">Working Location</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.length > 0 ? (
                    employees.map((emp) => (
                      <TableRow key={emp.id}>
                        <TableCell className="font-medium whitespace-nowrap">{emp.employeeId}</TableCell>
                        <TableCell>{emp.name}</TableCell>
                        <TableCell className="whitespace-nowrap">{emp.phone}</TableCell>
                        <TableCell className="whitespace-nowrap">{emp.shiftTiming}</TableCell>
                        <TableCell className="whitespace-nowrap">{emp.workingLocation}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button variant="outline" size="icon" onClick={() => handleOpenDialog(emp)} aria-label={`Edit employee ${emp.name}`} disabled={isSubmitting}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="destructive" size="icon" onClick={() => handleDelete(emp)} aria-label={`Delete employee ${emp.name}`} disabled={isSubmitting}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        No employees found. Click "Add Employee" to start building your team list.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default EmployeeManagementPage;
