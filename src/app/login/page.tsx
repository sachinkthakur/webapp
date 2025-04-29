'use client';

import type { NextPage } from 'next';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label'; // Keep if used explicitly, otherwise FormLabel is used
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast'; // Using the custom hook from context
import Image from 'next/image';
import { authenticateUser, checkLoginStatus, storeLoginSession, logoutUser } from '@/services/auth'; // Use utility functions
import { Loader2 } from 'lucide-react';

const loginSchema = z.object({
  userId: z.string().min(1, 'User ID / Phone Number is required'),
  password: z.string().optional(), // Password optional initially
}).refine(data => {
    // Require password only if userId is 'admin' (case-insensitive)
    if (data.userId.toLowerCase() === 'admin') {
        // If it's admin, password MUST be present and non-empty
        return !!data.password && data.password.length > 0;
    }
    // If userId is not admin, password validation is not needed here.
    // Employee existence is checked in authenticateUser.
    return true;
}, {
    message: 'Password is required for admin login',
    path: ['password'], // Specify the path of the error for the password field
});


type LoginFormValues = z.infer<typeof loginSchema>;

const LoginPage: NextPage = () => {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isClient, setIsClient] = useState(false); // Track if component has mounted

  // Set isClient to true once the component mounts
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Check login status on mount only on the client
  useEffect(() => {
    if (isClient) { // Only run when mounted on client
      const loggedInUser = checkLoginStatus(); // Use utility function
      console.log("Checked login status on mount:", loggedInUser);
      if (loggedInUser) {
        // If already logged in, redirect immediately
        if (loggedInUser.toLowerCase() === 'admin') {
          router.replace('/admin');
        } else {
          router.replace('/'); // Redirect employees to attendance page
        }
      }
    }
  }, [router, isClient]); // Depend on isClient state


  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      userId: '',
      password: '',
    },
    mode: 'onChange', // Validate on change to show password field dynamically
  });

   // Watch the userId field to show/hide password input
   const watchedUserId = form.watch('userId');

   // Use useEffect to react to changes in watchedUserId
   useEffect(() => {
       // Show password field if userId is 'admin' (case-insensitive)
       setShowPassword(watchedUserId?.toLowerCase() === 'admin');
       // If switching away from admin, clear the password field for better UX
       if (watchedUserId?.toLowerCase() !== 'admin') {
         form.setValue('password', '');
       }
   }, [watchedUserId, form]); // Add form to dependency array


  const onSubmit = useCallback(async (data: LoginFormValues) => {
    setIsLoading(true);
    console.log('Login form submitted with data:', data); // Debug log

    try {
      // Call the authentication function from the service
      const isAuthenticated = await authenticateUser(data.userId, data.password);
      console.log('Authentication result:', isAuthenticated);

      if (isAuthenticated) {
        toast({
          title: 'Login Successful',
          description: `Welcome, ${data.userId}! Redirecting...`,
        });

        // Store login state using utility function (only on client)
        if (typeof window !== 'undefined') {
            storeLoginSession(data.userId); // Use utility function
        }


        // Redirect based on user type AFTER state is stored
        if (data.userId.toLowerCase() === 'admin') {
          router.push('/admin');
        } else {
          router.push('/'); // Redirect employees to attendance page
        }
      } else {
         // Authentication failed
         toast({
           title: 'Login Failed',
           description: 'Invalid User ID / Phone Number or Password. Please check and try again.',
           variant: 'destructive',
         });
      }
    } catch (error: any) {
        // Handle unexpected errors during the login process
        console.error('Login error:', error);
         toast({
           title: 'Login Error',
           description: error.message || 'An unexpected error occurred. Please try again later.',
           variant: 'destructive',
         });
    } finally {
      setIsLoading(false); // Ensure loading state is turned off
    }
  }, [router, toast, form]); // Added form to dependencies for setValue


  // Render loading state or null if not yet mounted on client
  if (!isClient) {
    // Optional: Render a loading skeleton or null during SSR/initial hydration
    return (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-100 via-indigo-100 to-purple-200">
             <Loader2 className="h-16 w-16 animate-spin text-primary" />
        </div>
    );
  }

  return (
    <div className="relative flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-100 dark:from-gray-800 dark:via-gray-900 dark:to-black p-4 overflow-hidden">
      {/* Background Image */}
      <Image
        // Replace with a relevant Indian truck photo URL if available
        src="https://picsum.photos/seed/indiantruck/1920/1080" // Placeholder
        alt="Background truck"
        layout="fill"
        objectFit="cover"
        quality={70} // Adjust quality for performance
        className="absolute inset-0 z-0 opacity-20 dark:opacity-10" // Reduced opacity
        priority // Load image eagerly as it's part of the initial view
      />
      <Card className="w-full max-w-sm z-10 shadow-2xl bg-card/80 backdrop-blur-sm dark:bg-card/70 border border-border/50"> {/* Adjusted opacity and added border */}
        <CardHeader className="text-center space-y-2">
          {/* Optional: Add a company logo here */}
           <div className="mx-auto h-12 w-12 text-primary"> {/* Placeholder Icon/Logo */}
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
               <path d="M12.378 1.602a.75.75 0 0 0-.756 0L3 6.632l9 5.25 9-5.25-8.622-5.03ZM21.75 7.93l-9 5.25v9l8.628-5.032a.75.75 0 0 0 .372-.648V7.93ZM11.25 22.18v-9l-9-5.25v8.57a.75.75 0 0 0 .372.648l8.628 5.032Z" />
             </svg>
           </div>
          <CardTitle className="text-2xl font-bold text-primary">FieldTrack Login</CardTitle>
          <CardDescription className="text-muted-foreground">E Wheels and Logistics Attendance</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            {/* Ensure onSubmit is correctly passed */}
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="userId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>User ID / Phone Number</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter admin ID or your phone number"
                        {...field}
                        disabled={isLoading}
                        className="bg-input/50 dark:bg-input/30" // Slightly transparent input
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {/* Conditionally render password field */}
              {showPassword && (
                 <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Enter admin password"
                          {...field}
                          disabled={isLoading}
                          className="bg-input/50 dark:bg-input/30"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Login'}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="text-center text-xs text-muted-foreground mt-4">
          Login with your registered phone number or admin credentials.
        </CardFooter>
      </Card>
    </div>
  );
};

export default LoginPage;
