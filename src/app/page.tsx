'use client';

import type { NextPage } from 'next';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import * as faceapi from 'face-api.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast'; // Corrected: Ensure this path is valid
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
  const [isLoading, setIsLoading] = useState(true);
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
    const currentLoggedInUser = checkLoginStatus();
    console.log("AttendancePage: Auth Check. LoggedInUser from checkLoginStatus():", currentLoggedInUser);

    if (!currentLoggedInUser || typeof currentLoggedInUser !== 'string') {
      toast({ title: 'Authentication Required', description: 'You need to be logged in to mark attendance. Redirecting to login...', variant: 'destructive' });
      logoutUser(); // Ensure any invalid session is cleared
      router.replace('/login');
      return;
    }
    
    if (currentLoggedInUser.toLowerCase() === 'admin') {
        toast({ title: 'Access Denied', description: 'Administrators cannot mark attendance. Redirecting...', variant: 'destructive' });
        logoutUser(); // Log out admin if they somehow reach employee page
        router.replace('/login'); // Or router.replace('/admin') if you prefer
        return;
    }

    setLoggedInUserPhone(currentLoggedInUser);
    setAuthCheckCompleted(true);
    console.log("AttendancePage: User authenticated as employee:", currentLoggedInUser);

  }, [isClient, router, toast]);


  // 2. Fetch Employee Details
  useEffect(() => {
    if (!isClient || !authCheckCompleted || !loggedInUserPhone) return;

    const fetchDetails = async () => {
      setStatusMessage("Fetching employee details...");
      console.log("AttendancePage: Fetching employee details for phone:", loggedInUserPhone);
      try {
        const details = await getEmployeeById(loggedInUserPhone);
        if (details) {
          setEmployeeDetails(details);
          console.log("AttendancePage: Employee details fetched:", details);
          setStatusMessage("Employee details loaded.");
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
      } catch (error) {
        console.error('Error loading face recognition models (details):', error);
        setModelsLoadedError(true);
        setStatusMessage('Error: Face models failed to load. Ensure models are in public/models and refresh.');
        toast({
          title: 'Model Loading Error',
          description: 'Failed to load face recognition models. Please check your internet connection, ensure model files are correctly placed, and then refresh the page.',
          variant: 'destructive',
        });
      } finally {
        setModelsLoading(false);
      }
    };

    if (isClient && authCheckCompleted && loggedInUserPhone && !modelsLoaded && !modelsLoading && !modelsLoadedError) {
      loadModels();
    }
  }, [isClient, authCheckCompleted, loggedInUserPhone, modelsLoaded, modelsLoading, modelsLoadedError, toast]);


  // 4. Get Camera Permission
  useEffect(() => {
    if (!isClient || !authCheckCompleted || !loggedInUserPhone || !modelsLoaded) return;

    const getCameraPermission = async () => {
      setStatusMessage("Requesting camera access...");
      console.log("AttendancePage: Requesting camera permission.");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // Ensure video plays on all browsers
          videoRef.current.onloadedmetadata = () => {
             videoRef.current?.play().catch(playError => {
                console.error("Error playing video stream:", playError);
                toast({title: "Camera Error", description: "Could not start camera video.", variant: "destructive"});
             });
          };
        }
        setHasCameraPermission(true);
        setStatusMessage("Camera access granted. Position your face in the frame.");
        console.log("AttendancePage: Camera permission granted.");
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
  }, [isClient, authCheckCompleted, loggedInUserPhone, modelsLoaded, toast]);


  // 5. Get Location and Address
  const fetchLocationAndAddress = useCallback(async () => {
    if (!isClient || !authCheckCompleted || !loggedInUserPhone) return;
    
    console.log("AttendancePage: Attempting to fetch location and address.");
    setStatusMessage("Getting your current location...");
    setLocationError(null);
    setIsLoading(true); // Start loading indication for location
    setProgress(30);

    try {
      const coords = await getCurrentPosition();
      setLocation({ latitude: coords.latitude, longitude: coords.longitude });
      console.log("AttendancePage: Coordinates fetched:", coords.latitude, coords.longitude);
      setStatusMessage("Location acquired. Fetching address...");
      setProgress(60);

      const addr = await getAddressFromCoordinates(coords.latitude, coords.longitude);
      setAddress(addr);
      console.log("AttendancePage: Address fetched:", addr);
      setStatusMessage("Location and address ready.");
      setProgress(100);
    } catch (error: any) {
      console.error('AttendancePage: Error fetching location or address:', error);
      let userFriendlyMessage = 'Could not get location or address. Please ensure GPS and network are active, and permissions are granted.';
      if (error instanceof GeolocationError) {
        userFriendlyMessage = error.message; // Use the specific message from GeolocationError
      }
      setLocationError(userFriendlyMessage);
      setStatusMessage(`Error: ${userFriendlyMessage}`);
      toast({ title: 'Location Error', description: userFriendlyMessage, variant: 'destructive' });
      setProgress(0);
    } finally {
        setIsLoading(false); // End loading indication for location
    }
  }, [isClient, authCheckCompleted, loggedInUserPhone, toast]);

  useEffect(() => {
    if (isClient && authCheckCompleted && loggedInUserPhone && hasCameraPermission === true) { // Only fetch if camera is ready
        fetchLocationAndAddress();
    }
  }, [isClient, authCheckCompleted, loggedInUserPhone, hasCameraPermission, fetchLocationAndAddress]);


  // Function to capture image and mark attendance
  const captureAndMarkAttendance = useCallback(async (method: 'auto' | 'manual') => {
    if (!videoRef.current || !canvasRef.current || !location || !address || !employeeDetails || isProcessing || captureCooldownActive) {
      let missingInfo = [];
      if (!videoRef.current) missingInfo.push("video feed");
      if (!location) missingInfo.push("location");
      if (!address) missingInfo.push("address");
      if (!employeeDetails) missingInfo.push("employee details");
      if (isProcessing) missingInfo.push("another process running");
      if (captureCooldownActive) missingInfo.push("cooldown active");
      
      console.warn(`Attendance capture skipped. Method: ${method}. Missing: ${missingInfo.join(', ')}`);
      if (method === 'manual' && !captureCooldownActive) { // Only toast for manual if not on cooldown
        toast({ title: 'Cannot Mark Attendance', description: `Information missing: ${missingInfo.join(', ')}. Please wait or refresh.`, variant: 'warning' });
      }
      return;
    }

    setIsProcessing(true);
    setCaptureCooldownActive(true); // Activate cooldown
    setStatusMessage(`Capturing attendance (${method})...`);
    setProgress(50);
    console.log(`AttendancePage: Capturing attendance via ${method} method.`);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    context?.drawImage(video, 0, 0, canvas.width, canvas.height);
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

      // Optional: Redirect or show success message then logout/clear state
      // setTimeout(() => {
      //   logoutUser();
      //   router.replace('/login');
      // }, 3000); // Example: logout after 3 seconds

    } catch (error) {
      console.error('AttendancePage: Error saving attendance:', error);
      setStatusMessage('Error: Could not save attendance.');
      setProgress(0);
      toast({ title: 'Attendance Error', description: 'Failed to save attendance. Please try again.', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
      // Cooldown: Prevent immediate re-capture for a few seconds
      setTimeout(() => setCaptureCooldownActive(false), 5000); // 5 second cooldown
    }
  }, [location, address, employeeDetails, toast, isProcessing, captureCooldownActive]);


  // Face Detection Logic for Auto-Capture
  useEffect(() => {
    if (!isClient || !modelsLoaded || !hasCameraPermission || !videoRef.current || isLoading || locationError) {
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
        if (video && video.readyState === 4 && !isProcessing && !captureCooldownActive) { // video.HAVE_ENOUGH_DATA is 4
          const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks()
            .withFaceExpressions();

          if (detections && detections.length > 0) {
            const faceCenterConfidence = detections[0]?.detection.score; // Example metric
            const isSmiling = detections[0]?.expressions.happy > 0.6; // Example: require smile
            
            if (faceCenterConfidence > 0.7 && isSmiling) { // Adjust thresholds as needed
                setIsFaceDetected(true);
                setStatusMessage("Face detected clearly! Preparing for auto-capture...");

                if (!autoCaptureTimeoutRef.current) { // Start countdown if not already started
                    autoCaptureTimeoutRef.current = setTimeout(() => {
                        if (isFaceDetected && !isProcessing && !captureCooldownActive && location && address) { // Re-check conditions
                           console.log("AttendancePage: Auto-capturing attendance now.");
                           captureAndMarkAttendance('auto');
                        }
                        autoCaptureTimeoutRef.current = null; // Reset timeout ref
                    }, 2000); // 2-second delay after stable detection
                }
            } else {
                setIsFaceDetected(false);
                if (autoCaptureTimeoutRef.current) {
                    clearTimeout(autoCaptureTimeoutRef.current);
                    autoCaptureTimeoutRef.current = null;
                }
                // Optional: update status message if face not clear enough
                // setStatusMessage("Please look directly at the camera and smile.");
            }
          } else {
            setIsFaceDetected(false);
            if (autoCaptureTimeoutRef.current) {
                clearTimeout(autoCaptureTimeoutRef.current);
                autoCaptureTimeoutRef.current = null;
            }
          }
        }
      }, 700); // Detect every 700ms
    };

    startFaceDetection();

    return () => {
      if (faceDetectionIntervalRef.current) {
        clearInterval(faceDetectionIntervalRef.current);
      }
      if (autoCaptureTimeoutRef.current) {
        clearTimeout(autoCaptureTimeoutRef.current);
      }
    };
  }, [isClient, modelsLoaded, hasCameraPermission, isLoading, locationError, captureAndMarkAttendance, isProcessing, captureCooldownActive, location, address]);



  const handleManualCapture = () => {
    if (captureCooldownActive) {
        toast({title: "Cooldown Active", description: "Please wait a moment before trying again.", variant: "warning"});
        return;
    }
    if (!location || !address) {
        toast({title: "Location Missing", description: "Location data is not yet available. Please wait or refresh.", variant: "warning"});
        return;
    }
    if (!hasCameraPermission || !videoRef.current?.srcObject) {
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


  // Render Logic
  if (!isClient || !authCheckCompleted || (authCheckCompleted && !loggedInUserPhone)) {
    // Initial loading or redirecting state
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-100 to-gray-300 dark:from-gray-800 dark:to-gray-900 p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">{statusMessage}</p>
      </div>
    );
  }

  if (modelsLoadedError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center bg-destructive/10 dark:bg-destructive/20">
        <AlertTriangle className="w-16 h-16 text-destructive mb-4" />
        <h1 className="text-2xl font-bold text-destructive mb-2">An Error Occurred</h1>
        <p className="text-foreground dark:text-destructive-foreground/80">{statusMessage}</p>
        <Button onClick={() => window.location.reload()} className="mt-6">
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh Page
        </Button>
      </div>
    );
  }
  
  if (isLoading && (!location || !address)) {
     return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-100 to-gray-300 dark:from-gray-800 dark:to-gray-900 p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">{statusMessage}</p>
        {modelsLoading && <p className="text-sm text-muted-foreground mt-2">Loading face models...</p>}
        <Progress value={progress} className="w-1/2 mt-4" />
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
               <path d="M18.375 2.25c-1.035 0-1.875.84-1.875 1.875v15.75c0 1.035.84 1.875 1.875 1.875h.75c1.035 0 1.875-.84 1.875-1.875V4.125c0-1.035-.84-1.875-1.875-1.875h-.75ZM9.75 8.625c0-1.035.84-1.875 1.875-1.875h.75c1.035 0 1.875.84 1.875 1.875V21.75c0 1.035-.84 1.875-1.875 1.875h-.75c-1.035 0-1.875-.84-1.875-1.875V8.625ZM3 13.125c0-1.035.84-1.875 1.875-1.875h.75c1.035 0 1.875.84 1.875 1.875V21.75c0 1.035-.84 1.875-1.875 1.875h-.75A1.875 1.875 0 0 1 3 21.75V13.125Z" />
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
        {/* Camera Feed Section */}
        <Card className="shadow-xl col-span-1 bg-card/80 backdrop-blur-sm dark:bg-card/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Camera className="text-primary" /> Camera Feed
            </CardTitle>
            <CardDescription>
              {hasCameraPermission === null && "Initializing camera..."}
              {hasCameraPermission === false && "Camera access denied. Please grant permission."}
              {hasCameraPermission && !modelsLoaded && "Loading face models..."}
              {hasCameraPermission && modelsLoaded && "Position your face in the center."}
            </CardDescription>
          </CardHeader>
          <CardContent className="relative aspect-[4/3] overflow-hidden rounded-b-lg">
            <video
              ref={videoRef}
              className="absolute top-0 left-0 w-full h-full object-cover rounded-b-lg"
              autoPlay
              playsInline
              muted
              onPlay={() => console.log("Video playing")}
              onError={(e) => console.error("Video error:", e)}
            />
            <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full object-cover hidden" />
            {hasCameraPermission === false && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-white p-4 rounded-b-lg">
                <XCircle className="w-12 h-12 mb-2 text-destructive" />
                <p className="text-center">Camera permission denied. Please enable it in your browser settings and refresh.</p>
              </div>
            )}
             {hasCameraPermission && videoRef.current?.srcObject && ( // Show detection status only if camera is active
                <div className={`absolute bottom-2 right-2 px-2 py-1 rounded text-xs ${isFaceDetected ? 'bg-green-500/80 text-white' : 'bg-red-500/80 text-white'}`}>
                    {isFaceDetected ? 'Face Detected' : 'No Face'}
                </div>
             )}
          </CardContent>
        </Card>

        {/* Employee and Location Details Section */}
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
            <div className="flex items-center gap-2 font-semibold text-primary">
                <MapPin size={18} /> Current Location:
            </div>
            {isLoading && !location && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Fetching location...</div>}
            {locationError && <Alert variant="destructive" className="text-xs"><AlertTriangle className="h-4 w-4" /><AlertTitle>Location Error</AlertTitle><AlertDescription>{locationError}</AlertDescription></Alert>}
            {location && (
              <p className="text-muted-foreground">
                Lat: {location.latitude.toFixed(5)}, Lon: {location.longitude.toFixed(5)}
              </p>
            )}
            {address && <p className="text-muted-foreground text-xs">{address}</p>}
          </CardContent>
        </Card>
        
        {/* Status and Action Section */}
        <Card className="md:col-span-2 shadow-xl bg-card/80 backdrop-blur-sm dark:bg-card/70">
            <CardContent className="p-4 space-y-3">
                 <div className="flex items-center justify-center text-center text-sm min-h-[40px]">
                    {isProcessing ? <Loader2 className="h-5 w-5 animate-spin mr-2 text-primary" /> : 
                     statusMessage.includes("Error:") ? <AlertTriangle className="h-5 w-5 mr-2 text-destructive" /> :
                     statusMessage.includes("success") ? <CheckCircle className="h-5 w-5 mr-2 text-green-500" /> : null}
                    <span className={`${statusMessage.includes("Error:") ? 'text-destructive' : statusMessage.includes("success") ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                        {statusMessage}
                    </span>
                </div>
                {(isLoading || modelsLoading || isProcessing) && <Progress value={progress} className="w-full h-2" />}

                 <Button 
                    onClick={handleManualCapture} 
                    className="w-full py-3 text-base font-semibold"
                    disabled={isLoading || isProcessing || !modelsLoaded || !hasCameraPermission || !!locationError || captureCooldownActive || !location || !address}
                    aria-label="Mark Attendance Manually"
                  >
                  {isProcessing && captureCooldownActive ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Camera className="mr-2 h-5 w-5" />}
                  {isProcessing && captureCooldownActive ? 'Processing...' : captureCooldownActive ? 'Cooldown Active' : 'Mark Attendance Manually'}
                </Button>
                <p className="text-xs text-center text-muted-foreground/70">
                    {captureCooldownActive ? "Please wait before trying again." : (modelsLoaded && hasCameraPermission && location && address && !isLoading ? "Auto-capture active when face is clear and smiling." : "Ensure camera, location, and models are ready.")}
                </p>
            </CardContent>
        </Card>

      </main>
      <canvas ref={canvasRef} className="hidden"></canvas>
    </div>
  );
};

export default AttendancePage;
