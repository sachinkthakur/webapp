'use client';

import type { NextPage } from 'next';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label'; // Keep if used explicitly
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast'; // Use context hook
import { getEmployees, addEmployee, updateEmployee, deleteEmployee, Employee } from '@/services/attendance';
import { checkLoginStatus, logoutUser } from '@/services/auth'; // Auth utilities
import { PlusCircle, Edit, Trash2, LogOut, ArrowLeft, Loader2, AlertTriangle } from 'lucide-react';
import Image from 'next/image'; // For background

// Schema for adding/editing an employee
const employeeSchema = z.object({
  id: z.string().optional(), // Internal ID, only present when editing
  employeeId: z.string().min(1, 'Employee ID is required'),
  name: z.string().min(1, 'Name is required'),
  // Ensure phone number is 10 digits and doesn't start with country code
   phone: z.string()
        .length(10, 'Phone number must be exactly 10 digits')
        .regex(/^[6-9]\d{9}$/, 'Invalid Indian mobile number format (must be 10 digits, starting with 6-9)')
        .trim(), // Trim whitespace
  shiftTiming: z.string().min(1, 'Shift Timing is required (e.g., 9 AM - 5 PM)').trim(),
  workingLocation: z.string().min(1, 'Working Location is required').trim(),
});

type EmployeeFormValues = z.infer<typeof employeeSchema>;

const EmployeeManagementPage: NextPage = () => {
  const router = useRouter();
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true); // Loading employees state
  const [isSubmitting, setIsSubmitting] = useState(false); // Form submission state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null); // Track employee being edited
  const [error, setError] = useState<string | null>(null); // Page-level error
  const [isClient, setIsClient] = useState(false); // Track client-side mount

  // Set isClient on mount
   useEffect(() => {
     setIsClient(true);
   }, []);


  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      employeeId: '',
      name: '',
      phone: '',
      shiftTiming: '',
      workingLocation: '',
      id: undefined, // Explicitly undefined initially
    },
  });

  // Check login status
   useEffect(() => {
      if (isClient) { // Only run on client
         const loggedInUser = checkLoginStatus();
         if (!loggedInUser || loggedInUser.toLowerCase() !== 'admin') {
           toast({ title: 'Unauthorized', description: 'Redirecting to login...', variant: 'destructive' });
           logoutUser();
           router.replace('/login');
         } else {
           fetchEmployees(); // Fetch employees if logged in as admin
         }
      }
   }, [router, toast, isClient]); // Add isClient dependency

  // Fetch employees
  const fetchEmployees = useCallback(async () => {
     if (!isClient) return; // Ensure client-side execution

    setIsLoading(true);
    setError(null); // Clear previous errors
    try {
      const fetchedEmployees = await getEmployees();
       // Sort employees alphabetically by name for consistent display
       fetchedEmployees.sort((a, b) => a.name.localeCompare(b.name));
      setEmployees(fetchedEmployees);
       // Avoid toast spamming, maybe only show success on first load if desired
    } catch (error: any) {
      console.error('Failed to fetch employees:', error);
      setError('Could not fetch employee list. Please try refreshing the page.');
      toast({ title: 'Error', description: 'Could not fetch employees.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [toast, isClient]); // Add isClient dependency

  // Handle opening the dialog for adding or editing
  const handleOpenDialog = (employee: Employee | null = null) => {
    setEditingEmployee(employee);
    setError(null); // Clear errors when opening dialog
    form.clearErrors(); // Clear form errors as well

    if (employee) {
      // Populate form with existing employee data for editing
      console.log("Editing employee:", employee);
      form.reset({
        id: employee.id,
        employeeId: employee.employeeId,
        name: employee.name,
        phone: employee.phone,
        shiftTiming: employee.shiftTiming,
        workingLocation: employee.workingLocation,
      });
    } else {
      // Reset form for adding a new employee
       console.log("Adding new employee");
      form.reset({
        employeeId: '',
        name: '',
        phone: '',
        shiftTiming: '',
        workingLocation: '',
        id: undefined, // Ensure id is undefined when adding
      });
    }
    setIsDialogOpen(true);
  };

  // Handle closing the dialog
  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingEmployee(null); // Clear editing state
    form.reset(); // Reset form fields
    setError(null); // Clear any errors shown in the dialog
  };

  // Handle form submission (add or update)
  const onSubmit = async (data: EmployeeFormValues) => {
    setIsSubmitting(true);
    setError(null); // Clear previous submission errors
    console.log("Submitting form data:", data);
    try {
      if (editingEmployee && data.id) {
        // ----- Update existing employee -----
        // Ensure ID is correctly passed for update
        const updatedData: Employee = {
             ...data, // Contains potentially updated fields from form
             id: data.id, // Keep the original internal ID
             // Ensure all required fields from Employee interface are present
             employeeId: data.employeeId,
             name: data.name,
             phone: data.phone,
             shiftTiming: data.shiftTiming,
             workingLocation: data.workingLocation,
        };
         console.log("Attempting to update employee:", updatedData);
        await updateEmployee(updatedData);
        toast({ title: 'Success', description: 'Employee updated successfully.' });
      } else {
        // ----- Add new employee -----
        // Remove 'id' before adding, as it's generated by the service
         const { id, ...newData } = data;
         console.log("Attempting to add employee:", newData);
        await addEmployee(newData);
        toast({ title: 'Success', description: 'Employee added successfully.' });
      }
      await fetchEmployees(); // Refresh the employee list immediately
      handleCloseDialog(); // Close the dialog ONLY on success
    } catch (error: any) {
      console.error('Failed to save employee:', error);
       let errorMessage = 'Failed to save employee. Please try again.';
       if (error instanceof Error) {
         errorMessage = error.message; // Use specific error message if available
       }
       // Display error within the dialog or using toast
       setError(errorMessage); // Set error state to display in dialog footer
       // Optionally use toast as well:
       toast({ title: 'Save Error', description: errorMessage, variant: 'destructive' });
       // Keep the dialog open on error so user can correct input
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle deleting an employee
  const handleDelete = async (employeeToDelete: Employee) => {
     // Use the full employee object for better confirmation message
    if (!confirm(`Are you sure you want to delete employee "${employeeToDelete.name}" (ID: ${employeeToDelete.employeeId})? This action cannot be undone.`)) {
      return;
    }

    // Indicate loading state specifically for delete action if needed,
    // or rely on the main isLoading if fetchEmployees is called after delete.
    // setIsLoading(true); // Optional: More specific loading state
    setIsSubmitting(true); // Prevent other actions during delete
    setError(null); // Clear previous errors

    try {
       // Ensure we have the internal ID required by the delete function
       if (!employeeToDelete.id) {
          throw new Error("Cannot delete employee: Internal ID is missing.");
       }
       await deleteEmployee(employeeToDelete.id); // Use internal ID for deletion
       toast({ title: 'Success', description: `Employee "${employeeToDelete.name}" deleted successfully.` });
       await fetchEmployees(); // Refresh the list after successful deletion
    } catch (error: any) {
       console.error('Failed to delete employee:', error);
       setError(`Could not delete employee: ${error.message || 'Unknown error'}`);
       toast({ title: 'Deletion Error', description: `Could not delete employee: ${error.message || 'Unknown error'}`, variant: 'destructive' });
    } finally {
       // setIsLoading(false); // Reset specific loading state if used
       setIsSubmitting(false); // Re-enable buttons
    }
  };

  // Go back to Admin Dashboard
  const goBack = () => {
    router.push('/admin');
  };

  // Logout handler
  const handleLogout = useCallback(() => {
    logoutUser(); // Use utility
    toast({ title: 'Logged Out', description: 'You have been logged out.' });
    router.replace('/login');
  }, [router, toast]);

   // Render initial loading or null if not client-side yet
   if (!isClient) {
       return (
           <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-indigo-100 via-purple-100 to-pink-200">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
           </div>
       );
   }

  return (
    <div className="relative flex flex-col min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-100 dark:from-gray-800 dark:via-gray-900 dark:to-black p-4 md:p-8 overflow-hidden">
       {/* Background Image */}
       <Image
         src="https://picsum.photos/seed/employeebg/1920/1080" // Placeholder background
         alt="Employee background"
         layout="fill"
         objectFit="cover"
         quality={60}
         className="absolute inset-0 z-0 opacity-10 dark:opacity-5"
       />

       {/* Header */}
      <header className="relative z-10 mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
         <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={goBack} aria-label="Go back to admin dashboard">
                 <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl md:text-3xl font-bold text-primary">Manage Employees</h1>
         </div>
        <div className="flex gap-2 flex-wrap justify-center md:justify-end">
          {/* Dialog Trigger Button */}
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog()}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add Employee
              </Button>
            </DialogTrigger>
             {/* Dialog Content */}
            <DialogContent className="sm:max-w-[480px] z-50 bg-card/95 backdrop-blur-sm dark:bg-card/90 border border-border/50">
              <DialogHeader>
                <DialogTitle>{editingEmployee ? 'Edit Employee' : 'Add New Employee'}</DialogTitle>
                <DialogDescription>
                  {editingEmployee ? 'Update the details for this employee.' : 'Fill in the details for the new employee. Use their 10-digit phone number for login.'}
                </DialogDescription>
              </DialogHeader>
              {/* Form within Dialog */}
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                  {/* Employee ID */}
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
                  {/* Full Name */}
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
                  {/* Phone Number */}
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
                   {/* Shift Timing */}
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
                  {/* Working Location */}
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
                  {/* Display Submission Error if any */}
                  {error && (
                      <p className="text-sm text-destructive flex items-center gap-2">
                         <AlertTriangle className="h-4 w-4 flex-shrink-0"/> {error}
                      </p>
                  )}
                  {/* Dialog Actions */}
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
           {/* Logout Button */}
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" /> Logout
          </Button>
        </div>
      </header>

       {/* Main Content Card */}
      <Card className="relative z-10 flex-grow shadow-xl bg-card/90 backdrop-blur-sm dark:bg-card/80 border border-border/50">
        <CardHeader>
          <CardTitle>Registered Employees</CardTitle>
          <CardDescription>List of all employees in the system. Click '+' to add, or use actions to edit/delete.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Display Page-level Error if any */}
           {error && !isDialogOpen && ( // Show page error only if dialog is closed
                 <div className="mb-4 p-4 bg-destructive/10 border border-destructive/30 rounded-md flex items-center gap-3">
                      <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0" />
                      <p className="text-sm text-destructive">{error}</p>
                 </div>
            )}
          {/* Loading State */}
          {isLoading ? (
            <div className="flex flex-col justify-center items-center h-64 text-center">
               <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
               <p className="text-muted-foreground">Loading employee list...</p>
            </div>
          ) : (
             // Employee Table
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
