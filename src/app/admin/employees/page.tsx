'use client';

import type { NextPage } from 'next';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { getEmployees, addEmployee, updateEmployee, deleteEmployee, Employee } from '@/services/attendance';
import { PlusCircle, Edit, Trash2, LogOut, ArrowLeft, Loader2 } from 'lucide-react';

// Schema for adding/editing an employee
const employeeSchema = z.object({
  id: z.string().optional(), // Internal ID, only present when editing
  employeeId: z.string().min(1, 'Employee ID is required'),
  name: z.string().min(1, 'Name is required'),
  // Ensure phone number is 10 digits and doesn't start with country code
   phone: z.string()
        .length(10, 'Phone number must be exactly 10 digits')
        .regex(/^[6-9]\d{9}$/, 'Invalid Indian phone number format (must be 10 digits, starting with 6-9)'), // Simplified regex for common Indian mobile numbers
  shiftTiming: z.string().min(1, 'Shift Timing is required (e.g., 9 AM - 5 PM)'),
  workingLocation: z.string().min(1, 'Working Location is required'),
});

type EmployeeFormValues = z.infer<typeof employeeSchema>;

const EmployeeManagementPage: NextPage = () => {
  const router = useRouter();
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null); // Track employee being edited

  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      employeeId: '',
      name: '',
      phone: '',
      shiftTiming: '',
      workingLocation: '',
    },
  });

  // Check login status
  useEffect(() => {
    const loggedInUser = localStorage.getItem('loggedInUser');
    if (!loggedInUser || loggedInUser.toLowerCase() !== 'admin') {
      toast({ title: 'Unauthorized', description: 'Redirecting to login...', variant: 'destructive' });
      router.replace('/login');
    } else {
      fetchEmployees();
    }
  }, [router, toast]);

  // Fetch employees
  const fetchEmployees = useCallback(async () => {
    setIsLoading(true);
    try {
      const fetchedEmployees = await getEmployees();
      setEmployees(fetchedEmployees);
    } catch (error) {
      console.error('Failed to fetch employees:', error);
      toast({ title: 'Error', description: 'Could not fetch employees.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Handle opening the dialog for adding or editing
  const handleOpenDialog = (employee: Employee | null = null) => {
    setEditingEmployee(employee);
    if (employee) {
      // Populate form with existing employee data for editing
      form.reset({
        id: employee.id,
        employeeId: employee.employeeId,
        name: employee.name,
        phone: employee.phone,
        shiftTiming: employee.shiftTiming,
        workingLocation: employee.workingLocation,
      });
       console.log("Editing employee:", employee);
    } else {
      // Reset form for adding a new employee
      form.reset({
        employeeId: '',
        name: '',
        phone: '',
        shiftTiming: '',
        workingLocation: '',
        id: undefined, // Ensure id is undefined when adding
      });
       console.log("Adding new employee");
    }
    setIsDialogOpen(true);
  };

  // Handle closing the dialog
  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingEmployee(null); // Clear editing state
    form.reset(); // Reset form fields
  };

  // Handle form submission (add or update)
  const onSubmit = async (data: EmployeeFormValues) => {
    setIsSubmitting(true);
    console.log("Submitting form data:", data);
    try {
      if (editingEmployee && data.id) {
        // Update existing employee
        const updatedData: Employee = {
             ...data, // Contains potentially updated fields
             id: data.id, // Keep the original internal ID
        };
         console.log("Attempting to update employee:", updatedData);
        await updateEmployee(updatedData);
        toast({ title: 'Success', description: 'Employee updated successfully.' });
      } else {
        // Add new employee (remove id field if present)
         const { id, ...newData } = data; // Destructure to remove id
         console.log("Attempting to add employee:", newData);
        await addEmployee(newData);
        toast({ title: 'Success', description: 'Employee added successfully.' });
      }
      fetchEmployees(); // Refresh the employee list
      handleCloseDialog(); // Close the dialog on success
    } catch (error: any) {
      console.error('Failed to save employee:', error);
       let errorMessage = 'Failed to save employee. Please try again.';
       if (error instanceof Error) {
         errorMessage = error.message; // Use specific error message if available
       }
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle deleting an employee
  const handleDelete = async (employeeId: string) => {
    if (!confirm(`Are you sure you want to delete employee ${employeeId}? This action cannot be undone.`)) {
      return;
    }
    setIsLoading(true); // Indicate loading state while deleting
    try {
       const employeeToDelete = employees.find(emp => emp.employeeId === employeeId);
        if (!employeeToDelete || !employeeToDelete.id) {
            throw new Error("Cannot find employee internal ID for deletion.");
        }
      await deleteEmployee(employeeToDelete.id); // Use internal ID for deletion
      toast({ title: 'Success', description: 'Employee deleted successfully.' });
      fetchEmployees(); // Refresh the list
    } catch (error) {
      console.error('Failed to delete employee:', error);
      toast({ title: 'Error', description: 'Could not delete employee.', variant: 'destructive' });
       setIsLoading(false); // Ensure loading state is turned off on error
    }
     // No finally block needed here as fetchEmployees sets loading to false on success
  };

  // Go back to Admin Dashboard
  const goBack = () => {
    router.push('/admin');
  };

  // Logout handler
  const handleLogout = useCallback(() => {
    localStorage.removeItem('loggedInUser');
    toast({ title: 'Logged Out', description: 'You have been logged out.' });
    router.replace('/login');
  }, [router, toast]);

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-100 dark:from-gray-800 dark:via-gray-900 dark:to-black p-4 md:p-8">
      <header className="mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
         <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={goBack} aria-label="Go back to admin dashboard">
                 <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl md:text-3xl font-bold text-primary">Manage Employees</h1>
         </div>
        <div className="flex gap-2 flex-wrap justify-center">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog()}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add Employee
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] z-50"> {/* Ensure dialog is above other elements */}
              <DialogHeader>
                <DialogTitle>{editingEmployee ? 'Edit Employee' : 'Add New Employee'}</DialogTitle>
                <DialogDescription>
                  {editingEmployee ? 'Update the details for this employee.' : 'Fill in the details for the new employee.'}
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
                        <FormLabel>Phone Number (10 digits)</FormLabel>
                        <FormControl>
                          <Input type="tel" placeholder="e.g., 9876543210" {...field} disabled={isSubmitting} maxLength={10} />
                        </FormControl>
                         <FormDescription>
                            Enter 10-digit mobile number without country code.
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
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={handleCloseDialog} disabled={isSubmitting}>
                      Cancel
                    </Button>
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

      <Card className="flex-grow shadow-xl">
        <CardHeader>
          <CardTitle>Registered Employees</CardTitle>
          <CardDescription>List of all employees in the system.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <p>Loading employees...</p> {/* Or use a spinner */}
            </div>
          ) : (
            <ScrollArea className="h-[60vh] rounded-md border">
              <Table>
                <TableCaption>
                  {employees.length === 0 ? 'No employees added yet.' : 'List of registered employees.'}
                </TableCaption>
                <TableHeader className="sticky top-0 bg-secondary">
                  <TableRow>
                    <TableHead>Employee ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                     <TableHead>Shift Timing</TableHead>
                     <TableHead>Working Location</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.length > 0 ? (
                    employees.map((emp) => (
                      <TableRow key={emp.id}>
                        <TableCell>{emp.employeeId}</TableCell>
                        <TableCell>{emp.name}</TableCell>
                        <TableCell>{emp.phone}</TableCell>
                         <TableCell>{emp.shiftTiming}</TableCell>
                         <TableCell>{emp.workingLocation}</TableCell>
                        <TableCell className="flex gap-2">
                          <Button variant="outline" size="icon" onClick={() => handleOpenDialog(emp)} aria-label={`Edit employee ${emp.name}`}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="destructive" size="icon" onClick={() => handleDelete(emp.employeeId)} aria-label={`Delete employee ${emp.name}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                     <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center">
                           No employees found. Click "Add Employee" to start.
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
