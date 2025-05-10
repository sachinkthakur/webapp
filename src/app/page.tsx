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
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Initializing...');
  const [progress, setProgress] = useState(0);

  // Camera and Face Detection States
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsLoadedError, setModelsLoadedError] = useState<string | null>(null); // Store error message string
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
      setModelsLoadedError(null); 
      console.log('AttendancePage: Attempting to load Face API models from:', MODEL_URL);
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
        ]);
        setModelsLoaded(true);
        setStatusMessage('Face recognition models loaded.');
        console.log('AttendancePage: Face recognition models loaded successfully.');
        setProgress(60);
      } catch (error: any) {
        console.error('AttendancePage: Error loading face recognition models:', error);
        let detailedErrorMessage = 'Error: Face models failed to load.';
        if (error.message && String(error.message).toLowerCase().includes('failed to fetch')) {
          detailedErrorMessage += ' This often means a model file (like a .json or .weights file) could not be found (e.g., 404 error from server).';
        } else if (error.message) {
          detailedErrorMessage += ` Details: ${error.message}.`;
        }
        detailedErrorMessage += " Please ensure all necessary face-api.js model files are present in your 'public/models' directory and that the web server can serve them. Auto-capture is disabled.";
        
        setModelsLoadedError(detailedErrorMessage);
        setStatusMessage(detailedErrorMessage); 
        toast({
          title: 'Critical Error: Models Failed',
          description: detailedErrorMessage + " Please refresh the page after verifying model files.",
          variant: 'destructive',
          duration: 15000, 
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
    if (!isClient || !authCheckCompleted || !employeeDetails || !modelsLoaded) {
      return;
    }

    const getCameraPermission = async () => {
      setStatusMessage("Requesting camera access...");
      setProgress(70);
      console.log("AttendancePage: Attempting to get camera permission.");

      if (typeof navigator === 'undefined' || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        console.error('AttendancePage: navigator.mediaDevices.getUserMedia is not available or not a function.');
        setHasCameraPermission(false);
        setStatusMessage("Error: Camera API not available or not supported by this browser.");
        toast({
          variant: 'destructive',
          title: 'Camera Not Supported',
          description: 'Your browser does not support the required camera features or camera access is disabled.',
        });
        return; 
      }

      try {
        console.log("AttendancePage: Calling navigator.mediaDevices.getUserMedia.");
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch(playError => {
              console.error("Error playing video stream:", playError);
              setStatusMessage("Error: Could not start camera video.");
              toast({ title: "Camera Error", description: "Could not start camera video.", variant: "destructive" });
            });
          };
        }
        setHasCameraPermission(true);
        setStatusMessage("Camera access granted.");
        console.log("AttendancePage: Camera permission granted.");
        setProgress(80);
      } catch (error: any) {
        console.error('AttendancePage: Error accessing camera:', error, 'Error Name:', error.name, 'Error Message:', error.message);
        setHasCameraPermission(false);
        let title = 'Camera Access Issue';
        let description = 'An unexpected error occurred while trying to access the camera.';

        if (error instanceof DOMException) {
            switch(error.name) {
                case 'NotFoundError':
                    title = 'Camera Not Found';
                    description = 'No camera detected. Please ensure your camera is connected and enabled.';
                    break;
                case 'NotAllowedError': 
                    title = 'Permission Denied';
                    description = 'Camera access was denied. Please enable camera permissions in your browser settings.';
                    break;
                case 'NotReadableError':
                    title = 'Camera Conflict';
                    description = 'The camera is currently in use by another application or a hardware error occurred.';
                    break;
                case 'OverconstrainedError':
                    title = 'Camera Capabilities Error';
                    description = 'The requested camera settings (e.g., resolution) are not supported by your device.';
                    break;
                case 'SecurityError':
                    title = 'Security Restriction';
                    description = 'Camera access is blocked due to security settings (e.g., non-secure origin if not localhost).';
                    break;
                case 'TypeError': 
                    title = 'Configuration Error';
                    description = 'There was an issue with the camera configuration.';
                    break;
                default:
                    title = 'Camera Error';
                    description = `Could not access camera: ${error.message}.`;
            }
        } else {
            description = error.message || 'An unknown error occurred.';
        }
        
        setStatusMessage(`Error: ${description}`);
        toast({
          variant: 'destructive',
          title: title,
          description: description,
        });
      }
    };

    getCameraPermission();
  }, [isClient, authCheckCompleted, employeeDetails, modelsLoaded, toast]);

  // 5. Get Location and Address
  const fetchLocationAndAddress = useCallback(async () => {
    if (!isClient || !authCheckCompleted || !employeeDetails) {
      console.log("AttendancePage: fetchLocationAndAddress skipped, conditions not met.", {isClient, authCheckCompleted, employeeDetailsLoaded: !!employeeDetails});
      if (isLoading) setIsLoading(false);
      return;
    }
    
    console.log("AttendancePage: Attempting to fetch location and address.");
    setIsLoading(true); 
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
      setProgress(0); 
    } finally {
      setIsLoading(false); 
    }
  }, [isClient, authCheckCompleted, employeeDetails, toast, isLoading]); // Added isLoading to deps

  useEffect(() => {
    if (isClient && authCheckCompleted && employeeDetails && hasCameraPermission === true && modelsLoaded) {
        fetchLocationAndAddress();
    } else if (isClient && authCheckCompleted && employeeDetails && (hasCameraPermission === false || !modelsLoaded)) {
        if(isLoading){ // if still in initial loading phase but camera/models not ready
             setIsLoading(false);
             if (!statusMessage.toLowerCase().includes("error") && !modelsLoadedError) {
                setStatusMessage("Setup incomplete (camera/models). Location not fetched.");
             }
        }
    }
     if(isClient && authCheckCompleted && employeeDetails && (modelsLoadedError || hasCameraPermission === false) && isLoading){
        setIsLoading(false); 
        if (!statusMessage.toLowerCase().includes("error") && !modelsLoadedError) { 
          setStatusMessage("Setup incomplete. Location not fetched.");
        }
     }

  }, [isClient, authCheckCompleted, employeeDetails, hasCameraPermission, modelsLoaded, fetchLocationAndAddress, modelsLoadedError, isLoading, statusMessage]);


  // Function to capture image and mark attendance
  const captureAndMarkAttendance = useCallback(async (method: 'auto' | 'manual') => {
    if (!videoRef.current || !canvasRef.current || !location || !address || !employeeDetails || isProcessing || captureCooldownActive || modelsLoadedError) {
      let missingInfo = [];
      if (!videoRef.current?.srcObject && hasCameraPermission === true) missingInfo.push("video feed not active despite permission");
      else if (hasCameraPermission !== true) missingInfo.push("camera permission not granted or camera not found");
      if (!location) missingInfo.push("location data");
      if (!address) missingInfo.push("address data");
      if (!employeeDetails) missingInfo.push("employee details loaded");
      if (isProcessing) missingInfo.push("another process already running");
      if (captureCooldownActive) missingInfo.push("cooldown period active");
      if (modelsLoadedError) missingInfo.push("face models failed to load");
      
      const message = `Cannot Mark Attendance. Missing or waiting for: ${missingInfo.join(', ') || 'required information or models'}.`;
      console.warn(`AttendancePage: Attendance capture skipped. Method: ${method}. ${message}`);
      if (method === 'manual' && !captureCooldownActive) { 
        toast({ title: 'Cannot Mark Attendance', description: message, variant: 'warning' });
      }
      return;
    }

    setIsProcessing(true);
    setCaptureCooldownActive(true); 
    setStatusMessage(`Capturing attendance (${method})...`);
    setProgress(50); 
    console.log(`AttendancePage: Capturing attendance via ${method} method.`);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
        console.error("AttendancePage: Failed to get canvas context for image capture.");
        toast({title: "Capture Error", description: "Failed to initialize image capture. Please try again.", variant: "destructive"});
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
      setTimeout(() => setCaptureCooldownActive(false), 5000); 
    }
  }, [location, address, employeeDetails, toast, isProcessing, captureCooldownActive, modelsLoadedError, hasCameraPermission]);


  // Face Detection Logic for Auto-Capture
  useEffect(() => {
    if (!isClient || !modelsLoaded || modelsLoadedError || hasCameraPermission !== true || !videoRef.current || isLoading || !!locationError ) {
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

    if (!video.srcObject || video.paused || video.ended || video.readyState < 3) { 
        console.log("AttendancePage: Video stream not ready for face detection. Waiting...");
        return; 
    }


    const startFaceDetection = () => {
      console.log("AttendancePage: Starting face detection interval.");
      faceDetectionIntervalRef.current = setInterval(async () => {
        if (video && video.srcObject && video.readyState === 4 && !isProcessing && !captureCooldownActive && modelsLoaded && !modelsLoadedError && location && address) {
          const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({scoreThreshold: 0.5}))
            .withFaceLandmarks()
            .withFaceExpressions();

          if (detections && detections.length > 0) {
            const mainFace = detections[0]; 
            const faceConfidence = mainFace.detection.score;
            const isSmiling = mainFace.expressions.happy > 0.6; 
            

            if (faceConfidence > 0.75 && isSmiling) { 
                setIsFaceDetected(true);
                if (!autoCaptureTimeoutRef.current) { 
                    setStatusMessage("Face detected clearly! Auto-capturing in 2s...");
                    autoCaptureTimeoutRef.current = setTimeout(() => {
                        
                        if (isFaceDetected && !isProcessing && !captureCooldownActive && location && address && modelsLoaded && !modelsLoadedError && hasCameraPermission === true) {
                           console.log("AttendancePage: Auto-capturing attendance now.");
                           captureAndMarkAttendance('auto');
                        } else {
                            console.log("AttendancePage: Auto-capture aborted. Conditions changed.", {isFaceDetected, isProcessing, captureCooldownActive, locationExists: !!location, addressExists: !!address});
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
                 if (faceConfidence <= 0.75 && isSmiling && !statusMessage.includes("capturing") && !statusMessage.includes("marked")) setStatusMessage("Face not clear enough. Adjust position.");
                 else if (faceConfidence > 0.75 && !isSmiling && !statusMessage.includes("capturing") && !statusMessage.includes("marked")) setStatusMessage("Please smile for the camera!");
                 else if (!statusMessage.includes("capturing") && !statusMessage.includes("marked")) setStatusMessage("Position your face in the center and smile for auto-capture.");
            }
          } else { 
            setIsFaceDetected(false);
            if (autoCaptureTimeoutRef.current) { 
                clearTimeout(autoCaptureTimeoutRef.current);
                autoCaptureTimeoutRef.current = null;
            }
             if (!statusMessage.includes("capturing") && !statusMessage.includes("marked")) setStatusMessage("No face detected. Ensure good lighting and clear view.");
          }
        }
      }, 1000); 
    };

    startFaceDetection();


    return () => {
      if (faceDetectionIntervalRef.current) clearInterval(faceDetectionIntervalRef.current);
      if (autoCaptureTimeoutRef.current) clearTimeout(autoCaptureTimeoutRef.current);
      console.log("AttendancePage: Face detection interval cleared.");
    };
  }, [isClient, modelsLoaded, modelsLoadedError, hasCameraPermission, isLoading, locationError, captureAndMarkAttendance, isProcessing, captureCooldownActive, location, address, statusMessage]);



  const handleManualCapture = () => {
    console.log("AttendancePage: Manual capture initiated.");
    if (captureCooldownActive) {
        toast({title: "Cooldown Active", description: "Please wait a moment before trying again.", variant: "warning"});
        return;
    }
    if (modelsLoadedError) {
        toast({title: "Models Error", description: `Face models failed: ${modelsLoadedError}. Cannot capture.`, variant: "destructive"});
        return;
    }
    if (hasCameraPermission !== true || !videoRef.current?.srcObject) {
        toast({title: "Camera Issue", description: "Camera not ready or permission denied.", variant: "warning"});
        return;
    }
    if (!location || !address) {
        toast({title: "Location Missing", description: "Location data is not yet available. Please wait or try refreshing location.", variant: "warning"});
        return;
    }
    if (!modelsLoaded) { 
        toast({title: "Models Not Ready", description: "Face recognition models are still loading or failed. Please wait.", variant: "warning"});
        return;
    }
    captureAndMarkAttendance('manual');
  };

  const handleLogout = () => {
    logoutUser();
    if (faceDetectionIntervalRef.current) clearInterval(faceDetectionIntervalRef.current); 
    if (autoCaptureTimeoutRef.current) clearTimeout(autoCaptureTimeoutRef.current);
    toast({ title: 'Logged Out', description: 'You have been successfully logged out.' });
    router.replace('/login');
  };

  const handleRefreshLocation = () => {
    if (isLoading && location === null && !locationError) return; 
    
    if (!isLoading || (isLoading && location !== null) || locationError) { 
      fetchLocationAndAddress(); 
    } else if (isLoading && location === null && !locationError) {
      toast({title: "Please Wait", description: "Initial location fetch in progress.", variant: "default"});
    }
  };


  const overallInitialLoading = isLoading && !modelsLoadedError && progress < 100 && !locationError && authCheckCompleted && employeeDetails;

  if (!isClient || !authCheckCompleted || !employeeDetails) { // Early exit if auth or employee details not ready
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-100 to-gray-300 dark:from-gray-800 dark:to-gray-900 p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">{statusMessage}</p>
        { (isLoading || modelsLoading) && 
          <Progress value={progress} className="w-1/2 mt-4 h-2.5 rounded-full" />
        }
      </div>
    );
  }

  // This loading state covers model loading, camera permission, and initial location fetch
  // AFTER auth and employee details are confirmed.
  if (isLoading && (!modelsLoaded || hasCameraPermission === null || !location) && !modelsLoadedError && !locationError) {
     return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-100 to-gray-300 dark:from-gray-800 dark:to-gray-900 p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">{statusMessage}</p>
        <Progress value={progress} className="w-1/2 mt-4 h-2.5 rounded-full" />
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
              {modelsLoadedError ? modelsLoadedError : 
               hasCameraPermission === null ? "Initializing camera..." :
               hasCameraPermission === false ? "Camera access denied. Please grant permission." :
               !modelsLoaded && modelsLoading ? "Loading face models..." :
               hasCameraPermission && modelsLoaded ? "Position your face in the center and smile." :
               "Camera status unknown. Ensure permissions are granted." 
              }
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
             {hasCameraPermission === true && modelsLoaded && !modelsLoadedError && videoRef.current?.srcObject && (
                <div className={`absolute bottom-2 right-2 px-2 py-1 rounded text-xs font-medium ${isFaceDetected ? 'bg-green-500/90 text-white' : 'bg-red-500/90 text-white'}`}>
                    {isFaceDetected ? 'Face Clear' : 'Face Not Clear'}
                </div>
             )}
             {hasCameraPermission === true && !modelsLoaded && modelsLoading && !modelsLoadedError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white p-4 rounded-b-lg">
                    <Loader2 className="w-8 h-8 animate-spin mb-2" />
                    <p>Loading face models...</p>
                </div>
             )}
             {modelsLoadedError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-destructive/80 text-white p-4 rounded-b-lg text-center">
                    <AlertTriangle className="w-12 h-12 mb-2" />
                    <p>{modelsLoadedError}</p>
                     <Button onClick={() => window.location.reload()} className="mt-2" size="sm" variant="secondary">
                        <RefreshCw className="mr-2 h-3 w-3" /> Refresh
                     </Button>
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
                <Button variant="outline" size="sm" onClick={handleRefreshLocation} disabled={isLoading && location === null && !locationError}> 
                    <RefreshCw className={`h-3 w-3 ${(isLoading && location === null && !locationError) ? 'animate-spin' : ''}`} />
                </Button>
            </div>
            {isLoading && location === null && !locationError && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Fetching location...</div>}
            {locationError && <Alert variant="destructive" className="text-xs mt-2"><AlertTriangle className="h-4 w-4" /><AlertTitle>Location Error</AlertTitle><AlertDescription>{locationError}</AlertDescription></Alert>}
            {location && (
              <p className="text-muted-foreground">
                Lat: {location.latitude.toFixed(5)}, Lon: {location.longitude.toFixed(5)}
              </p>
            )}
            {address ? <p className="text-muted-foreground text-xs">{address}</p> : (location && !locationError && <p className="text-muted-foreground text-xs flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Fetching address...</p>)}
          </CardContent>
        </Card>
        
        <Card className="md:col-span-2 shadow-xl bg-card/80 backdrop-blur-sm dark:bg-card/70">
            <CardContent className="p-4 space-y-3">
                 <div className="flex items-center justify-center text-center text-sm min-h-[40px] p-2 rounded-md bg-muted/50 dark:bg-muted/30">
                    {isProcessing ? <Loader2 className="h-5 w-5 animate-spin mr-2 text-primary" /> : 
                     statusMessage.toLowerCase().includes("error:") || modelsLoadedError || locationError ? <AlertTriangle className="h-5 w-5 mr-2 text-destructive" /> :
                     statusMessage.toLowerCase().includes("success") || statusMessage.toLowerCase().includes("ready") || (modelsLoaded && statusMessage.toLowerCase().includes("models loaded")) ? <CheckCircle className="h-5 w-5 mr-2 text-green-500" /> :
                     (isLoading && progress < 100) || modelsLoading ? <Loader2 className="h-5 w-5 animate-spin mr-2 text-primary" /> :
                     <Camera className="h-5 w-5 mr-2 text-muted-foreground" />
                    }
                    <span className={`${statusMessage.toLowerCase().includes("error:") || modelsLoadedError || locationError ? 'text-destructive' : (statusMessage.toLowerCase().includes("success") || statusMessage.toLowerCase().includes("ready")) ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                        {statusMessage}
                    </span>
                </div>
                {(isProcessing || ((isLoading || modelsLoading) && progress < 100 && !modelsLoadedError && !locationError )) && <Progress value={progress} className="w-full h-2" />}

                 <Button 
                    onClick={handleManualCapture} 
                    className="w-full py-3 text-base font-semibold"
                    disabled={
                        isProcessing || 
                        captureCooldownActive || 
                        !modelsLoaded || 
                        !!modelsLoadedError || 
                        hasCameraPermission !== true || 
                        !!locationError || 
                        !location || 
                        !address ||
                        (isLoading && (!location && !locationError)) 
                    }
                    aria-label="Mark Attendance Manually"
                  >
                  {isProcessing ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Camera className="mr-2 h-5 w-5" />}
                  {isProcessing ? 'Processing...' : captureCooldownActive ? 'Cooldown...' : 'Mark Manually'}
                </Button>
                <p className="text-xs text-center text-muted-foreground/80">
                    {captureCooldownActive ? "Please wait before trying again." : 
                     (modelsLoaded && !modelsLoadedError && hasCameraPermission === true && location && address && !isLoading && !isProcessing) ? "Auto-capture active if face is clear and smiling." : 
                     modelsLoadedError ? "Face models failed. Auto-capture disabled." :
                     "Ensure camera, location & models are ready for attendance."}
                </p>
                {modelsLoadedError && !statusMessage.includes("Face models failed") && <p className="text-xs text-center text-destructive">Face models failed to load. Manual capture might not work. Please refresh.</p>}
            </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default AttendancePage;
