'use client';

import type { NextPage } from 'next';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';
import { authenticateUser, checkLoginStatus, storeLoginSession } from '@/services/auth';
import { Loader2 } from 'lucide-react';

const loginSchema = z.object({
  userId: z.string().min(1, 'User ID / Phone Number is required'),
  password: z.string().optional(),
}).refine(data => {
    if (typeof data.userId === 'string' && data.userId.trim().toLowerCase() === 'admin') {
        return !!data.password && data.password.length > 0;
    }
    return true;
}, {
    message: 'Password is required for admin login',
    path: ['password'],
});


type LoginFormValues = z.infer<typeof loginSchema>;

const LoginPage: NextPage = () => {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (isClient) {
      const loggedInUser = checkLoginStatus();
      console.log("Login page: Checked login status on mount:", loggedInUser);
      if (loggedInUser && typeof loggedInUser === 'string') { 
        if (loggedInUser === 'admin') { // Check against lowercase 'admin'
          router.replace('/admin');
        } else {
          router.replace('/');
        }
      }
    }
  }, [router, isClient]);


  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      userId: '',
      password: '',
    },
    mode: 'onChange', 
  });

   const watchedUserId = form.watch('userId');

   useEffect(() => {
       if (typeof watchedUserId === 'string') {
           const trimmedUserId = watchedUserId.trim().toLowerCase();
           setShowPassword(trimmedUserId === 'admin');
           if (trimmedUserId !== 'admin') {
               form.setValue('password', ''); 
           }
       } else {
           setShowPassword(false); 
           form.setValue('password', ''); 
       }
   }, [watchedUserId, form]);


  const onSubmit = useCallback(async (data: LoginFormValues) => {
    setIsLoading(true);
    console.log('Login form submitted with raw data:', data);

    const rawUserId = data.userId;
    const rawPassword = data.password;
    const cleanUserId = typeof rawUserId === 'string' ? rawUserId.trim() : '';

    try {
      const isAuthenticated = await authenticateUser(cleanUserId, rawPassword);
      console.log('Authentication result for cleanUserId "', cleanUserId, '":', isAuthenticated);

      if (isAuthenticated) {
        let sessionUser = cleanUserId;
        if (cleanUserId.toLowerCase() === 'admin') {
          sessionUser = 'admin'; // Ensure 'admin' is used for session and routing logic
        }
        
        toast({
          title: 'Login Successful',
          description: `Welcome, ${sessionUser}! Redirecting...`, 
        });

        if (typeof window !== 'undefined') {
            storeLoginSession(sessionUser); 
            console.log('Stored session for:', sessionUser);
        }

        if (sessionUser === 'admin') {
          console.log('Redirecting admin to /admin');
          router.replace('/admin'); // Use replace for better history
        } else {
          console.log('Redirecting employee to /');
          router.replace('/'); // Use replace for better history
        }
      } else {
         toast({
           title: 'Login Failed',
           description: 'Invalid User ID / Phone Number or Password. Please check and try again.',
           variant: 'destructive',
         });
      }
    } catch (error: any) {
        console.error('Login error:', error);
         toast({
           title: 'Login Error',
           description: error.message || 'An unexpected error occurred. Please try again later.',
           variant: 'destructive',
         });
    } finally {
      setIsLoading(false);
    }
  }, [router, toast, form]);


  if (!isClient) {
    return (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-700 via-indigo-700 to-purple-800 dark:from-gray-800 dark:via-gray-900 dark:to-black">
             <Loader2 className="h-16 w-16 animate-spin text-white" />
        </div>
    );
  }

  return (
    <div className="relative flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 dark:from-gray-800 dark:via-gray-900 dark:to-black p-4 overflow-hidden">
      <Image
        data-ai-hint="indian truck"
        src="https://picsum.photos/seed/indiantruck/1920/1080"
        alt="Background truck"
        layout="fill"
        objectFit="cover"
        quality={70}
        className="absolute inset-0 z-0 opacity-20 dark:opacity-10"
        priority
      />
      <Card className="w-full max-w-sm z-10 shadow-2xl bg-card/95 backdrop-blur-sm dark:bg-card/90 border border-border/50 rounded-xl">
        <CardHeader className="text-center space-y-2 pt-8">
           <div className="mx-auto h-16 w-16 text-primary dark:text-primary-foreground">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
               <path d="M18.375 2.25c-1.035 0-1.875.84-1.875 1.875v15.75c0 1.035.84 1.875 1.875 1.875h.75c1.035 0 1.875-.84 1.875-1.875V4.125c0-1.035-.84-1.875-1.875-1.875h-.75ZM9.75 8.625c0-1.035.84-1.875 1.875-1.875h.75c1.035 0 1.875.84 1.875 1.875V21.75c0 1.035-.84 1.875-1.875 1.875h-.75c-1.035 0-1.875-.84-1.875-1.875V8.625ZM3 13.125c0-1.035.84-1.875 1.875-1.875h.75c1.035 0 1.875.84 1.875 1.875V21.75c0 1.035-.84 1.875-1.875 1.875h-.75A1.875 1.875 0 0 1 3 21.75V13.125Z" />
            </svg>
           </div>
          <CardTitle className="text-3xl font-bold text-primary dark:text-primary-foreground">FieldTrack Login</CardTitle>
          <CardDescription className="text-muted-foreground">E Wheels and Logistics</CardDescription>
        </CardHeader>
        <CardContent className="py-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="userId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground/80">User ID / Phone Number</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Admin ID or Phone Number"
                        {...field}
                        disabled={isLoading}
                        className="bg-background/80 dark:bg-muted/50 border-border/70 focus:ring-primary focus:border-primary rounded-lg"
                      />
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
                      <FormLabel className="text-foreground/80">Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Admin Password"
                          {...field}
                          disabled={isLoading}
                          className="bg-background/80 dark:bg-muted/50 border-border/70 focus:ring-primary focus:border-primary rounded-lg"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground dark:bg-primary dark:hover:bg-primary/80 rounded-lg py-3 text-base font-semibold shadow-md hover:shadow-lg transition-shadow" disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : 'Login'}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="text-center text-xs text-muted-foreground pb-8">
          Use your registered phone or admin credentials.
        </CardFooter>
      </Card>
    </div>
  );
};

export default LoginPage;
