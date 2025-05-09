'use client';

import type { NextPage } from 'next';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import * as faceapi from 'face-api.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { getCurrentPosition, getAddressFromCoordinates, GeolocationError } from '@/services/geo-location';
import { saveAttendance, getEmployeeById, Employee } from '@/services/attendance';
import { checkLoginStatus, logoutUser } from '@/services/auth';
import { Camera, MapPin, User, LogOut, Loader2, AlertTriangle, CheckCircle, RefreshCw, XCircle } from 'lucide-react';
import Image from 'next/image';

const AttendancePage: NextPage = () => {
  const router = useRouter();
  const { toast } = useToast();

  // Authentication and User Data
  const [loggedInUserPhone, setLoggedInUserPhone] = useState<string | null>(null);
  const [employeeDetails, setEmployeeDetails] = useState<Employee | null>(null);
  const [authCheckCompleted, setAuthCheckCompleted] = useState(false);

  // UI and Loading States
  const [isLoading, setIsLoading] = useState(true); // General loading for setup phases
  const [isProcessing, setIsProcessing] = useState(false); // For attendance marking
  const [statusMessage, setStatusMessage] = useState('Initializing...');
  const [progress, setProgress] = useState(0);

  // Camera and Face Detection States
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsLoadedError, setModelsLoadedError] = useState(false);
  const [isFaceDetected, setIsFaceDetected] = useState(false);
  const [captureCooldownActive, setCaptureCooldownActive] = useState(false);

  // Geolocation States
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const faceDetectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const autoCaptureTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // 1. Authentication Check
  useEffect(() => {
    if (!isClient) return;

    setStatusMessage("Verifying user...");
    setProgress(10);
    const currentLoggedInUser = checkLoginStatus();
    console.log("AttendancePage: Auth Check. LoggedInUser from checkLoginStatus():", currentLoggedInUser);

    if (!currentLoggedInUser || typeof currentLoggedInUser !== 'string') {
      toast({ title: 'Authentication Required', description: 'You need to be logged in. Redirecting...', variant: 'destructive' });
      logoutUser();
      router.replace('/login');
      return;
    }
    
    if (currentLoggedInUser.toLowerCase() === 'admin') {
        toast({ title: 'Access Denied', description: 'Administrators cannot mark attendance. Redirecting...', variant: 'destructive' });
        logoutUser();
        router.replace('/login');
        return;
    }

    setLoggedInUserPhone(currentLoggedInUser);
    setAuthCheckCompleted(true);
    console.log("AttendancePage: User authenticated as employee:", currentLoggedInUser);
    setStatusMessage("User verified.");
    setProgress(20);

  }, [isClient, router, toast]);


  // 2. Fetch Employee Details
  useEffect(() => {
    if (!isClient || !authCheckCompleted || !loggedInUserPhone) return;

    const fetchDetails = async () => {
      setStatusMessage("Fetching employee details...");
      setProgress(30);
      console.log("AttendancePage: Fetching employee details for phone:", loggedInUserPhone);
      try {
        const details = await getEmployeeById(loggedInUserPhone);
        if (details) {
          setEmployeeDetails(details);
          console.log("AttendancePage: Employee details fetched:", details);
          setStatusMessage("Employee details loaded.");
          setProgress(40);
        } else {
          toast({ title: 'Error', description: 'Could not find employee details. Please contact support.', variant: 'destructive' });
          setStatusMessage("Error: Employee details not found.");
          logoutUser();
          router.replace('/login');
        }
      } catch (error) {
        console.error("AttendancePage: Error fetching employee details:", error);
        toast({ title: 'Error', description: 'Failed to fetch employee details.', variant: 'destructive' });
        setStatusMessage("Error: Could not fetch employee details.");
        logoutUser();
        router.replace('/login');
      }
    };
    fetchDetails();
  }, [isClient, authCheckCompleted, loggedInUserPhone, router, toast]);


  // 3. Load Face API Models
   useEffect(() => {
    const loadModels = async () => {
      const MODEL_URL = '/models';
      setStatusMessage('Loading face recognition models...');
      setProgress(50);
      setModelsLoading(true);
      setModelsLoadedError(false);
      try {
        console.log('Attempting to load models from:', MODEL_URL);
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
        ]);
        setModelsLoaded(true);
        setStatusMessage('Face recognition models loaded.');
        console.log('Face recognition models loaded successfully.');
        setProgress(60);
      } catch (error: any) {
        console.error('Error loading face recognition models (details):', error);
        setModelsLoadedError(true);
        setStatusMessage(`Error: Face models failed to load. ${error.message || 'Check console for details.'}`);
        toast({
          title: 'Model Loading Error',
          description: 'Failed to load face recognition models. Please ensure model files are in public/models and refresh.',
          variant: 'destructive',
        });
      } finally {
        setModelsLoading(false);
      }
    };

    if (isClient && authCheckCompleted && employeeDetails && !modelsLoaded && !modelsLoading && !modelsLoadedError) {
      loadModels();
    }
  }, [isClient, authCheckCompleted, employeeDetails, modelsLoaded, modelsLoading, modelsLoadedError, toast]);


  // 4. Get Camera Permission
  useEffect(() => {
    if (!isClient || !authCheckCompleted || !employeeDetails || !modelsLoaded) return;

    const getCameraPermission = async () => {
      setStatusMessage("Requesting camera access...");
      setProgress(70);
      console.log("AttendancePage: Requesting camera permission.");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
             videoRef.current?.play().catch(playError => {
                console.error("Error playing video stream:", playError);
                setStatusMessage("Error: Could not start camera video.");
                toast({title: "Camera Error", description: "Could not start camera video.", variant: "destructive"});
             });
          };
        }
        setHasCameraPermission(true);
        setStatusMessage("Camera access granted.");
        console.log("AttendancePage: Camera permission granted.");
        setProgress(80);
      } catch (error) {
        console.error('AttendancePage: Error accessing camera:', error);
        setHasCameraPermission(false);
        setStatusMessage("Error: Camera access denied or unavailable.");
        toast({
          variant: 'destructive',
          title: 'Camera Access Denied',
          description: 'Please enable camera permissions in your browser settings to mark attendance.',
        });
      }
    };
    getCameraPermission();
  }, [isClient, authCheckCompleted, employeeDetails, modelsLoaded, toast]);

  // 5. Get Location and Address
  const fetchLocationAndAddress = useCallback(async () => {
    if (!isClient || !authCheckCompleted || !employeeDetails) {
      console.log("fetchLocationAndAddress skipped, conditions not met.");
      return;
    }
    
    console.log("AttendancePage: Attempting to fetch location and address.");
    setStatusMessage("Getting your current location...");
    setLocationError(null);
    setProgress(85);

    try {
      const coords = await getCurrentPosition();
      setLocation({ latitude: coords.latitude, longitude: coords.longitude });
      console.log("AttendancePage: Coordinates fetched:", coords.latitude, coords.longitude);
      setStatusMessage("Location acquired. Fetching address...");
      setProgress(90);

      const addr = await getAddressFromCoordinates(coords.latitude, coords.longitude);
      setAddress(addr);
      console.log("AttendancePage: Address fetched:", addr);
      setStatusMessage("Location and address ready.");
      setProgress(100);
    } catch (error: any) {
      console.error('AttendancePage: Error fetching location or address:', error);
      let userFriendlyMessage = 'Could not get location or address. Please ensure GPS and network are active, and permissions are granted.';
      if (error instanceof GeolocationError) {
        userFriendlyMessage = error.message;
      }
      setLocationError(userFriendlyMessage);
      setStatusMessage(`Error: ${userFriendlyMessage}`);
      toast({ title: 'Location Error', description: userFriendlyMessage, variant: 'destructive' });
      setProgress(0); // Reset progress on error
    } finally {
      setIsLoading(false); // This indicates all initial setup (including location) is done or failed
    }
  }, [isClient, authCheckCompleted, employeeDetails, toast]);

  useEffect(() => {
    // Fetch location only after camera is ready and other details are present
    if (isClient && authCheckCompleted && employeeDetails && hasCameraPermission === true && modelsLoaded) {
        fetchLocationAndAddress();
    }
  }, [isClient, authCheckCompleted, employeeDetails, hasCameraPermission, modelsLoaded, fetchLocationAndAddress]);


  // Function to capture image and mark attendance
  const captureAndMarkAttendance = useCallback(async (method: 'auto' | 'manual') => {
    if (!videoRef.current || !canvasRef.current || !location || !address || !employeeDetails || isProcessing || captureCooldownActive) {
      let missingInfo = [];
      if (!videoRef.current?.srcObject) missingInfo.push("video feed active");
      if (!location) missingInfo.push("location data");
      if (!address) missingInfo.push("address data");
      if (!employeeDetails) missingInfo.push("employee details loaded");
      if (isProcessing) missingInfo.push("another process already running");
      if (captureCooldownActive) missingInfo.push("cooldown period active");
      
      const message = `Cannot Mark Attendance. Missing or waiting for: ${missingInfo.join(', ') || 'required information'}.`;
      console.warn(`Attendance capture skipped. Method: ${method}. ${message}`);
      if (method === 'manual' && !captureCooldownActive) {
        toast({ title: 'Cannot Mark Attendance', description: message, variant: 'warning' });
      }
      return;
    }

    setIsProcessing(true);
    setCaptureCooldownActive(true);
    setStatusMessage(`Capturing attendance (${method})...`);
    setProgress(50); // Mid-progress for capture
    console.log(`AttendancePage: Capturing attendance via ${method} method.`);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
        console.error("Failed to get canvas context");
        toast({title: "Capture Error", description: "Failed to initialize image capture.", variant: "destructive"});
        setIsProcessing(false);
        setCaptureCooldownActive(false);
        return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const photoDataUri = canvas.toDataURL('image/jpeg');

    const attendanceData = {
      employeeId: employeeDetails.employeeId,
      phone: employeeDetails.phone,
      name: employeeDetails.name,
      timestamp: new Date(),
      latitude: location.latitude,
      longitude: location.longitude,
      address: address,
      photoDataUri: photoDataUri,
      captureMethod: method,
      shiftTiming: employeeDetails.shiftTiming,
      workingLocation: employeeDetails.workingLocation,
    };

    try {
      await saveAttendance(attendanceData);
      setStatusMessage(`Attendance marked successfully via ${method} at ${new Date().toLocaleTimeString()}!`);
      setProgress(100);
      toast({ title: 'Attendance Marked', description: `Successfully marked for ${employeeDetails.name}.`, variant: 'default' });
      console.log("AttendancePage: Attendance saved successfully.", attendanceData);

    } catch (error: any) {
      console.error('AttendancePage: Error saving attendance:', error);
      setStatusMessage(`Error: Could not save attendance. ${error.message || ''}`);
      setProgress(0);
      toast({ title: 'Attendance Error', description: `Failed to save attendance. ${error.message || 'Please try again.'}`, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
      setTimeout(() => setCaptureCooldownActive(false), 5000); // 5 second cooldown
    }
  }, [location, address, employeeDetails, toast, isProcessing, captureCooldownActive]);


  // Face Detection Logic for Auto-Capture
  useEffect(() => {
    if (!isClient || !modelsLoaded || hasCameraPermission !== true || !videoRef.current || isLoading || !!locationError ) {
      if (faceDetectionIntervalRef.current) {
        clearInterval(faceDetectionIntervalRef.current);
        faceDetectionIntervalRef.current = null;
      }
      if (autoCaptureTimeoutRef.current) {
        clearTimeout(autoCaptureTimeoutRef.current);
        autoCaptureTimeoutRef.current = null;
      }
      setIsFaceDetected(false);
      return;
    }

    const video = videoRef.current;
    const startFaceDetection = () => {
      faceDetectionIntervalRef.current = setInterval(async () => {
        if (video && video.readyState === 4 && !isProcessing && !captureCooldownActive) {
          const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({scoreThreshold: 0.5}))
            .withFaceLandmarks()
            .withFaceExpressions();

          if (detections && detections.length > 0) {
            const mainFace = detections[0];
            const faceConfidence = mainFace.detection.score;
            const isSmiling = mainFace.expressions.happy > 0.6;
            
            if (faceConfidence > 0.75 && isSmiling) { // Stricter confidence
                setIsFaceDetected(true);
                if (!autoCaptureTimeoutRef.current) {
                    setStatusMessage("Face detected clearly! Auto-capturing in 2s...");
                    autoCaptureTimeoutRef.current = setTimeout(() => {
                        if (isFaceDetected && !isProcessing && !captureCooldownActive && location && address) {
                           console.log("AttendancePage: Auto-capturing attendance now.");
                           captureAndMarkAttendance('auto');
                        }
                        autoCaptureTimeoutRef.current = null;
                    }, 2000);
                }
            } else {
                setIsFaceDetected(false);
                if (autoCaptureTimeoutRef.current) {
                    clearTimeout(autoCaptureTimeoutRef.current);
                    autoCaptureTimeoutRef.current = null;
                }
                setStatusMessage("Position your face in the center and smile for auto-capture.");
            }
          } else {
            setIsFaceDetected(false);
            if (autoCaptureTimeoutRef.current) {
                clearTimeout(autoCaptureTimeoutRef.current);
                autoCaptureTimeoutRef.current = null;
            }
             setStatusMessage("No face detected. Ensure good lighting and clear view.");
          }
        }
      }, 700);
    };

    if (videoRef.current.srcObject) { // Ensure stream is active
        startFaceDetection();
    }


    return () => {
      if (faceDetectionIntervalRef.current) clearInterval(faceDetectionIntervalRef.current);
      if (autoCaptureTimeoutRef.current) clearTimeout(autoCaptureTimeoutRef.current);
    };
  }, [isClient, modelsLoaded, hasCameraPermission, isLoading, locationError, captureAndMarkAttendance, isProcessing, captureCooldownActive, location, address]);



  const handleManualCapture = () => {
    if (captureCooldownActive) {
        toast({title: "Cooldown Active", description: "Please wait a moment before trying again.", variant: "warning"});
        return;
    }
    if (!location || !address) {
        toast({title: "Location Missing", description: "Location data is not yet available. Please wait or try refreshing location.", variant: "warning"});
        return;
    }
    if (hasCameraPermission !== true || !videoRef.current?.srcObject) {
        toast({title: "Camera Issue", description: "Camera not ready or permission denied.", variant: "warning"});
        return;
    }
     if (!modelsLoaded) {
        toast({title: "Models Not Loaded", description: "Face recognition models are not ready. Please wait or refresh.", variant: "warning"});
        return;
    }
    captureAndMarkAttendance('manual');
  };

  const handleLogout = () => {
    logoutUser();
    toast({ title: 'Logged Out', description: 'You have been successfully logged out.' });
    router.replace('/login');
  };

  const handleRefreshLocation = () => {
    if (isLoading) return; // Prevent multiple calls if already fetching
    setIsLoading(true); // Set loading true for location refresh
    fetchLocationAndAddress();
  };


  // Initial Loading State (covering auth, employee details, models, camera, location)
  if (!isClient || !authCheckCompleted || isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-100 to-gray-300 dark:from-gray-800 dark:to-gray-900 p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">{statusMessage}</p>
        {(isLoading || modelsLoading) && <Progress value={progress} className="w-1/2 mt-4 h-2.5 rounded-full" />}
        {modelsLoadedError && (
             <Alert variant="destructive" className="mt-4 max-w-md">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Model Loading Failed</AlertTitle>
                <AlertDescription>
                  {statusMessage} Check console for details.
                  <Button onClick={() => window.location.reload()} className="mt-2 w-full" size="sm">
                    <RefreshCw className="mr-2 h-3 w-3" /> Refresh Page
                  </Button>
                </AlertDescription>
            </Alert>
        )}
      </div>
    );
  }
  

  return (
    <div className="relative flex flex-col items-center justify-start min-h-screen bg-gradient-to-br from-slate-100 via-gray-100 to-stone-200 dark:from-slate-800 dark:via-gray-900 dark:to-neutral-900 p-4 pt-8 md:pt-12 overflow-hidden">
       <Image
        data-ai-hint="abstract background"
        src="https://picsum.photos/seed/attendancebg/1920/1080"
        alt="Abstract background"
        fill
        style={{objectFit:"cover"}}
        quality={50}
        className="absolute inset-0 z-0 opacity-5 dark:opacity-[0.03]"
      />

      <header className="relative z-10 w-full max-w-4xl mb-6 flex justify-between items-center">
        <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-full">
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-primary">
               <path d="M18.375 2.25c-1.035 0-1.875.84-1.875 1.875v15.75c0 1.035.84 1.875 1.875 1.875h.75c1.035 0 1.875-.84 1.875-1.875V4.125c0-1.035-.84-1.875-1.875-1.875h-.75ZM9.75 8.625c0-1.035.84-1.875 1.875-1.875h.75c1.035 0 1.875.84 1.875 1.875V21.75c0 1.035-.84 1.875 1.875 1.875h-.75c-1.035 0-1.875-.84-1.875-1.875V8.625ZM3 13.125c0-1.035.84-1.875 1.875-1.875h.75c1.035 0 1.875.84 1.875 1.875V21.75c0 1.035-.84 1.875-1.875 1.875h-.75A1.875 1.875 0 0 1 3 21.75V13.125Z" />
             </svg>
            </div>
            <div>
                <h1 className="text-2xl md:text-3xl font-bold text-primary">FieldTrack</h1>
                <p className="text-sm text-muted-foreground">E Wheels and Logistics</p>
            </div>
        </div>
        <Button variant="outline" onClick={handleLogout} size="sm">
          <LogOut className="mr-2 h-4 w-4" /> Logout
        </Button>
      </header>

      <main className="relative z-10 w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
        <Card className="shadow-xl col-span-1 bg-card/80 backdrop-blur-sm dark:bg-card/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Camera className="text-primary" /> Camera Feed
            </CardTitle>
            <CardDescription>
              {hasCameraPermission === null && "Initializing camera..."}
              {hasCameraPermission === false && "Camera access denied. Please grant permission."}
              {hasCameraPermission && !modelsLoaded && modelsLoading && "Loading face models..."}
              {hasCameraPermission && modelsLoaded && "Position your face in the center and smile."}
              {hasCameraPermission && modelsLoadedError && "Error loading face models. Refresh."}
            </CardDescription>
          </CardHeader>
          <CardContent className="relative aspect-[4/3] overflow-hidden rounded-b-lg bg-muted dark:bg-muted/30">
            <video
              ref={videoRef}
              className="absolute top-0 left-0 w-full h-full object-cover rounded-b-lg"
              autoPlay
              playsInline
              muted
            />
            <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full object-cover hidden" />
            {hasCameraPermission === false && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white p-4 rounded-b-lg text-center">
                <XCircle className="w-12 h-12 mb-2 text-destructive" />
                <p>Camera permission denied. Please enable it in your browser settings and refresh.</p>
              </div>
            )}
             {hasCameraPermission === true && modelsLoaded && videoRef.current?.srcObject && (
                <div className={`absolute bottom-2 right-2 px-2 py-1 rounded text-xs font-medium ${isFaceDetected ? 'bg-green-500/90 text-white' : 'bg-red-500/90 text-white'}`}>
                    {isFaceDetected ? 'Face Clear' : 'Face Not Clear'}
                </div>
             )}
             {hasCameraPermission === true && !modelsLoaded && modelsLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white p-4 rounded-b-lg">
                    <Loader2 className="w-8 h-8 animate-spin mb-2" />
                    <p>Loading models...</p>
                </div>
             )}
          </CardContent>
        </Card>

        <Card className="shadow-xl col-span-1 bg-card/80 backdrop-blur-sm dark:bg-card/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <User className="text-primary" /> Employee Details
            </CardTitle>
            {employeeDetails ? (
              <CardDescription>Welcome, {employeeDetails.name}! Ready to mark attendance.</CardDescription>
            ) : (
              <CardDescription>Loading employee information...</CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {employeeDetails ? (
              <>
                <p><strong>ID:</strong> {employeeDetails.employeeId}</p>
                <p><strong>Phone:</strong> {employeeDetails.phone}</p>
                <p><strong>Shift:</strong> {employeeDetails.shiftTiming}</p>
                <p><strong>Work Site:</strong> {employeeDetails.workingLocation}</p>
              </>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground"> 
                <Loader2 className="h-4 w-4 animate-spin" /> Loading details...
              </div>
            )}
            <hr className="my-3 border-border/50"/>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold text-primary">
                    <MapPin size={18} /> Current Location:
                </div>
                <Button variant="outline" size="sm" onClick={handleRefreshLocation} disabled={isLoading && location === null}>
                    <RefreshCw className={`h-3 w-3 ${isLoading && location === null ? 'animate-spin' : ''}`} />
                </Button>
            </div>
            {isLoading && location === null && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Fetching location...</div>}
            {locationError && <Alert variant="destructive" className="text-xs mt-2"><AlertTriangle className="h-4 w-4" /><AlertTitle>Location Error</AlertTitle><AlertDescription>{locationError}</AlertDescription></Alert>}
            {location && (
              <p className="text-muted-foreground">
                Lat: {location.latitude.toFixed(5)}, Lon: {location.longitude.toFixed(5)}
              </p>
            )}
            {address ? <p className="text-muted-foreground text-xs">{address}</p> : location && <p className="text-muted-foreground text-xs">Fetching address...</p>}
          </CardContent>
        </Card>
        
        <Card className="md:col-span-2 shadow-xl bg-card/80 backdrop-blur-sm dark:bg-card/70">
            <CardContent className="p-4 space-y-3">
                 <div className="flex items-center justify-center text-center text-sm min-h-[40px] p-2 rounded-md bg-muted/50 dark:bg-muted/30">
                    {isProcessing ? <Loader2 className="h-5 w-5 animate-spin mr-2 text-primary" /> : 
                     statusMessage.includes("Error:") ? <AlertTriangle className="h-5 w-5 mr-2 text-destructive" /> :
                     statusMessage.includes("success") || statusMessage.includes("Location and address ready") || statusMessage.includes("Face recognition models loaded") ? <CheckCircle className="h-5 w-5 mr-2 text-green-500" /> :
                     <Loader2 className="h-5 w-5 animate-spin mr-2 text-primary" />} {/* Default to loader if no other icon fits */}
                    <span className={`${statusMessage.includes("Error:") ? 'text-destructive' : (statusMessage.includes("success") || statusMessage.includes("Location and address ready") || statusMessage.includes("Face recognition models loaded")) ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                        {statusMessage}
                    </span>
                </div>
                {(isProcessing || (isLoading && progress < 100)) && <Progress value={progress} className="w-full h-2" />}

                 <Button 
                    onClick={handleManualCapture} 
                    className="w-full py-3 text-base font-semibold"
                    disabled={isProcessing || captureCooldownActive || !modelsLoaded || hasCameraPermission !== true || !!locationError || !location || !address || modelsLoadedError}
                    aria-label="Mark Attendance Manually"
                  >
                  {isProcessing ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Camera className="mr-2 h-5 w-5" />}
                  {isProcessing ? 'Processing...' : captureCooldownActive ? 'Cooldown...' : 'Mark Manually'}
                </Button>
                <p className="text-xs text-center text-muted-foreground/80">
                    {captureCooldownActive ? "Please wait before trying again." : 
                     (modelsLoaded && hasCameraPermission === true && location && address && !isLoading && !isProcessing && !modelsLoadedError) ? "Auto-capture active if face is clear and smiling." : 
                     "Ensure camera, location & models are ready for attendance."}
                </p>
                {modelsLoadedError && <p className="text-xs text-center text-destructive">Face models failed to load. Manual capture might not work. Please refresh.</p>}
            </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default AttendancePage;
