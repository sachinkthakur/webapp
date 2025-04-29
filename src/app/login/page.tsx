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
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/components/ui/use-toast';
import Image from 'next/image';
import { authenticateUser } from '@/services/auth'; // Assuming auth service exists
import { Loader2 } from 'lucide-react';

const loginSchema = z.object({
  userId: z.string().min(1, 'User ID / Phone Number is required'),
  password: z.string().optional(), // Password optional initially
}).refine(data => {
    // Require password only if userId is 'admin'
    if (data.userId.toLowerCase() === 'admin') {
        return data.password && data.password.length > 0;
    }
    // If userId is not admin, password can be empty or missing (or implement other employee login logic)
    // For now, allow non-admin users without password for simplicity, assuming phone number is the primary identifier.
    // In a real app, you'd likely verify the phone number via OTP or check against registered employees.
    return true;
}, {
    message: 'Password is required for admin login',
    path: ['password'], // Specify the path of the error
});


type LoginFormValues = z.infer<typeof loginSchema>;

const LoginPage: NextPage = () => {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
       setShowPassword(watchedUserId?.toLowerCase() === 'admin');
   }, [watchedUserId]);


  const onSubmit = useCallback(async (data: LoginFormValues) => {
    setIsLoading(true);
    console.log('Login attempt:', data); // Debug log

    try {
      // Simulate authentication
      const isAuthenticated = await authenticateUser(data.userId, data.password);

      if (isAuthenticated) {
        toast({
          title: 'Login Successful',
          description: `Welcome, ${data.userId}!`,
        });

        // Store login state (e.g., in localStorage or context)
        localStorage.setItem('loggedInUser', data.userId); // Simple example

        // Redirect based on user type
        if (data.userId.toLowerCase() === 'admin') {
          router.push('/admin');
        } else {
          router.push('/'); // Redirect employees to attendance page
        }
      } else {
         toast({
           title: 'Login Failed',
           description: 'Invalid credentials. Please try again.',
           variant: 'destructive',
         });
      }
    } catch (error) {
        console.error('Login error:', error);
         toast({
           title: 'Login Error',
           description: 'An unexpected error occurred. Please try again later.',
           variant: 'destructive',
         });
    } finally {
      setIsLoading(false);
    }
  }, [router, toast]);

  // Check login status on mount
  useEffect(() => {
    const loggedInUser = localStorage.getItem('loggedInUser');
    if (loggedInUser) {
      if (loggedInUser.toLowerCase() === 'admin') {
        router.replace('/admin');
      } else {
        router.replace('/');
      }
    }
  }, [router]);

  return (
    <div className="relative flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700 p-4">
       {/* Background Image */}
      <Image
        src="https://picsum.photos/seed/truck/1920/1080" // Placeholder truck image
        alt="Background truck"
        layout="fill"
        objectFit="cover"
        quality={75}
        className="absolute inset-0 z-0 opacity-30" // Adjust opacity as needed
      />
      <Card className="w-full max-w-sm z-10 shadow-2xl bg-card/90 backdrop-blur-sm"> {/* Added backdrop blur */}
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">FieldTrack Login</CardTitle>
          <CardDescription>E Wheels and Logistics</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="userId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>User ID / Phone Number</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter your ID or Phone Number" {...field} disabled={isLoading} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {showPassword && (
                 <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Enter admin password" {...field} disabled={isLoading} />
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
        {/* <CardFooter className="text-center text-sm text-muted-foreground">
          Contact support if you face issues.
        </CardFooter> */}
      </Card>
    </div>
  );
};

export default LoginPage;
