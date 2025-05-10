// @ts-nocheck
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
import { ScrollArea } from '@/components/ui/scroll-area';


const AttendancePage: NextPage = () => {
  const router = useRouter();
  const { toast } = useToast();

  const [loggedInUserPhone, setLoggedInUserPhone] = useState<string | null>(null);
  const [employeeDetails, setEmployeeDetails] = useState<Employee | null>(null);
  const [authCheckCompleted, setAuthCheckCompleted] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Initializing...');
  const [progress, setProgress] = useState(0);

  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [isStreamPlaying, setIsStreamPlaying] = useState<boolean>(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsLoadedError, setModelsLoadedError] = useState<string | null>(null);
  const [isFaceDetected, setIsFaceDetected] = useState(false);
  const [captureCooldownActive, setCaptureCooldownActive] = useState(false);

  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);


  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const faceDetectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const autoCaptureTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;

    setStatusMessage("Verifying user...");
    setProgress(10);
    const currentLoggedInUser = checkLoginStatus();
    console.log("AttendancePage: Auth Check. LoggedInUser from checkLoginStatus():", currentLoggedInUser);

    if (!currentLoggedInUser) {
      toast({ title: 'Authentication Required', description: 'You need to be logged in. Redirecting...', variant: 'destructive' });
      logoutUser();
      router.replace('/login');
      return;
    }
    
    if (typeof currentLoggedInUser === 'string') {
        if (currentLoggedInUser.toLowerCase() === 'admin') {
            toast({ title: 'Access Denied', description: 'Administrators cannot mark attendance. Redirecting...', variant: 'destructive' });
            logoutUser();
            router.replace('/login'); // Or '/admin' if admin should go to admin dashboard
            return;
        }
        setLoggedInUserPhone(currentLoggedInUser);
        setAuthCheckCompleted(true);
        console.log("AttendancePage: User authenticated as employee:", currentLoggedInUser);
        setStatusMessage("User verified.");
        setProgress(20);
    } else {
        toast({ title: 'Authentication Error', description: 'Invalid user session. Please login again.', variant: 'destructive' });
        logoutUser();
        router.replace('/login');
    }

  }, [isClient, router, toast]);


  const fetchEmployeeDetails = useCallback(async () => {
    if (!loggedInUserPhone) return;
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
        setStatusMessage("Error: Employee details not found. Please log out and log in again or contact support.");
        // Consider logging out or specific action if employee details are crucial and not found
        // logoutUser();
        // router.replace('/login');
      }
    } catch (error) {
      console.error("AttendancePage: Error fetching employee details:", error);
      toast({ title: 'Error', description: 'Failed to fetch employee details.', variant: 'destructive' });
      setStatusMessage("Error: Could not fetch employee details.");
      // Consider logging out or specific action
    }
  }, [loggedInUserPhone, toast]); // Removed router from here as it's not directly used for decision making inside, only for navigation on error which is handled by toast outside.

  useEffect(() => {
    if (isClient && authCheckCompleted && loggedInUserPhone && !employeeDetails) {
      fetchEmployeeDetails();
    }
  }, [isClient, authCheckCompleted, loggedInUserPhone, employeeDetails, fetchEmployeeDetails]);


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
        
        let detailedErrorMessage = "Error: Face models failed to load.\n\n";
        const errorMessageString = String(error.message || 'Unknown error.');

        if (errorMessageString.includes('failed to fetch') || errorMessageString.includes('404')) {
            const urlMatch = errorMessageString.match(/from url: (https?:\/\/[^\s]+)/);
            const failedUrlPart = urlMatch && urlMatch[1] ? ` (e.g., ${urlMatch[1]})` : '';
            detailedErrorMessage += `This often means a model file${failedUrlPart} could not be found (e.g., 404 error from server).\n\n`;
        } else {
            detailedErrorMessage += `DETAILS: ${errorMessageString}\n\n`;
        }
        detailedErrorMessage += "ACTION REQUIRED:\n";
        detailedErrorMessage += "1. Ensure ALL face-api.js model files are in `public/models/`.\n";
        detailedErrorMessage += "2. Key files include: tiny_face_detector_model-weights_manifest.json (+shard1), face_landmark_68_model-weights_manifest.json (+shard1), face_recognition_model-weights_manifest.json (+shards), face_expression_model-weights_manifest.json (+shard1).\n";
        detailedErrorMessage += "3. After placing/verifying files, RESTART your development server. If deployed, ensure deployment includes these files and the server instance is updated/restarted.\n";
        detailedErrorMessage += "4. Verify server can serve static files by accessing a model manifest in browser (e.g., your-app-url.com/models/tiny_face_detector_model-weights_manifest.json).\n";
        detailedErrorMessage += "Auto-capture is disabled.";


        setModelsLoadedError(detailedErrorMessage);
        setStatusMessage(`Error: Face models failed. See details in camera feed area.`);
        toast({
          title: 'CRITICAL: Face Models Error!',
          description: "Models couldn't load. Check camera feed area for instructions. Ensure models are in 'public/models' & server restarted if files were added/changed.",
          variant: 'destructive',
          duration: 90000, 
        });
      } finally {
        setModelsLoading(false);
      }
    };

    if (isClient && authCheckCompleted && employeeDetails && !modelsLoaded && !modelsLoading && !modelsLoadedError) {
      loadModels();
    }
  }, [isClient, authCheckCompleted, employeeDetails, modelsLoaded, modelsLoading, modelsLoadedError, toast]);


  useEffect(() => {
    const getCameraPermission = async () => {
      setStatusMessage("Requesting camera access...");
      setProgress(70);
      console.log("AttendancePage: Attempting to get camera permission.");

      if (typeof navigator === 'undefined' || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        console.error('AttendancePage: navigator.mediaDevices.getUserMedia is not available.');
        setHasCameraPermission(false);
        setIsStreamPlaying(false);
        setStatusMessage("Error: Camera API not available or not supported.");
        toast({ variant: 'destructive', title: 'Camera Not Supported', description: 'Browser does not support camera features or access is disabled.' });
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // videoRef.current.load(); // Removed: Often not needed with srcObject and can cause "interrupted by new load request"

          videoRef.current.oncanplay = () => {
            console.log("AttendancePage: oncanplay event fired. Video readyState:", videoRef.current?.readyState);
            if (videoRef.current) {
              videoRef.current.play()
                .then(() => {
                  console.log("AttendancePage: Video play() promise resolved via oncanplay.");
                })
                .catch(playError => {
                  console.error("AttendancePage: Error playing video stream via oncanplay:", playError);
                  setIsStreamPlaying(false); // Explicitly set here
                  setStatusMessage(`Error: Camera playback failed: ${playError.message}. Try interacting with page.`);
                  toast({
                    variant: 'warning',
                    title: 'Camera Playback Issue',
                    description: `Playback failed: ${playError.message}. Browser might require interaction (click/tap page) to start video.`,
                    duration: 15000
                  });
                });
            }
          };

          videoRef.current.onplaying = () => {
            console.log("AttendancePage: Video 'playing' event fired.");
            setIsStreamPlaying(true);
            setStatusMessage("Camera active and streaming.");
            setProgress(80);
          };

          videoRef.current.onpause = () => {
            console.log("AttendancePage: Video 'pause' event fired.");
            setIsStreamPlaying(false);
            if(!statusMessage.toLowerCase().includes("error") && !isProcessing && !isFaceDetected) { // Avoid overriding capture messages
              setStatusMessage("Camera paused. Ensure it's not covered.");
            }
          };
          
          videoRef.current.onended = () => {
            console.warn('AttendancePage: Video track ended unexpectedly.');
            setIsStreamPlaying(false);
            setHasCameraPermission(false); // Consider resetting to null to allow re-try
            setStatusMessage("Error: Camera stream ended. Refresh or check camera.");
            toast({ title: "Camera Stream Ended", description: "Camera connection lost. Please refresh page.", variant: "destructive" });
            if (faceDetectionIntervalRef.current) clearInterval(faceDetectionIntervalRef.current);
            if (autoCaptureTimeoutRef.current) clearTimeout(autoCaptureTimeoutRef.current);
            setIsFaceDetected(false);
             if (videoRef.current) {
              const currentStream = videoRef.current.srcObject as MediaStream | null;
              if (currentStream) {
                currentStream.getTracks().forEach(track => track.stop());
              }
              videoRef.current.srcObject = null;
             // videoRef.current.load(); // Not needed after srcObject = null
            }
          };
          
          videoRef.current.onerror = (e) => {
            console.error("AttendancePage: HTMLVideoElement error event:", e, videoRef.current?.error);
            setIsStreamPlaying(false);
            setHasCameraPermission(false); // Consider resetting to null
            const errorMsg = videoRef.current?.error?.message || 'Unknown video error';
            setStatusMessage(`Error: Video element error: ${errorMsg}. Try refreshing.`);
            toast({ variant: 'destructive', title: 'Video Element Error', description: `Video player error: ${errorMsg}. Check camera or refresh.` });
          };
          
          // Attempt to play directly after setting srcObject if autoplay doesn't kick in immediately
          // Muted autoplay should work, but this is a fallback.
          const playPromise = videoRef.current.play();
          if (playPromise !== undefined) {
            playPromise.catch(error => {
              console.warn("AttendancePage: Initial videoRef.play() call was prevented:", error.message);
              // oncanplay handler will also attempt to play. Toast there is usually sufficient.
            });
          }

          setHasCameraPermission(true); // Set permission true after successfully getting stream
          setStatusMessage("Camera connected. Initializing stream playback...");
          console.log("AttendancePage: Camera permission obtained. Stream assigned.");

        } else {
           console.error("AttendancePage: videoRef.current IS NULL when trying to set srcObject.");
           setHasCameraPermission(false);
           setIsStreamPlaying(false);
           setStatusMessage("Error: Camera component not ready.");
           toast({ title: 'Internal Error', description: 'Camera component not ready.', variant: 'destructive'});
        }
      } catch (error: any) {
        console.error('AttendancePage: Error accessing camera during getUserMedia:', error);
        setHasCameraPermission(false);
        setIsStreamPlaying(false);
        let title = 'Camera Access Issue';
        let description = error.message || 'An unexpected error occurred.';
        if (error.name === 'NotAllowedError') {
            title = 'Permission Denied';
            description = 'Camera access denied. Enable permissions in browser settings & refresh.';
        } else if (error.name === 'NotFoundError') {
            title = 'Camera Not Found';
            description = 'No camera detected. Ensure it is connected and enabled.';
        }
        setStatusMessage(`Error: ${description}`);
        toast({ variant: 'destructive', title: title, description: description });
      }
    };

    if (isClient && authCheckCompleted && employeeDetails && modelsLoaded && !modelsLoadedError && hasCameraPermission === null) {
      getCameraPermission();
    }
  // Key change: Removed statusMessage and isProcessing from dependencies to prevent unwanted re-runs.
  // getCameraPermission is defined within this effect's scope, so it's re-evaluated if dependencies change,
  // but the *call* to it is guarded by hasCameraPermission === null.
  }, [isClient, authCheckCompleted, employeeDetails, modelsLoaded, modelsLoadedError, hasCameraPermission, toast]);


  const fetchLocationAndAddress = useCallback(async () => {
    if (!isClient || !authCheckCompleted || !employeeDetails || isFetchingLocation ) {
       if (isLoading && !statusMessage.toLowerCase().includes("error") && !statusMessage.toLowerCase().includes("fetching")) setIsLoading(false);
      return;
    }

    setIsLoading(true); 
    setIsFetchingLocation(true);
    setStatusMessage("Getting your current location...");
    setLocationError(null);
    setAddress(null);
    setLocation(null);
    setProgress(85);

    try {
      const coords = await getCurrentPosition();
      setLocation({ latitude: coords.latitude, longitude: coords.longitude });
      setStatusMessage("Location acquired. Fetching address...");
      setProgress(90);

      const addr = await getAddressFromCoordinates(coords.latitude, coords.longitude);
      setAddress(addr);
      setStatusMessage("Location and address ready.");
      setProgress(100);
      setLocationError(null); 
    } catch (error: any) {
      console.error("AttendancePage: Error in fetchLocationAndAddress:", error);
      let userFriendlyMessage = 'Could not get location or address. Please ensure GPS and network are active, and browser permissions are granted for location services.';
      if (error instanceof GeolocationError) {
          userFriendlyMessage = error.message; 
      } else if (error.message) { 
          userFriendlyMessage = `Address lookup failed. ${error.message.includes('NetworkError') || error.message.includes('Failed to fetch') ? 'Check network connection.' : ''}`;
      }
      
      setLocationError(userFriendlyMessage);
      setStatusMessage(`Error: ${userFriendlyMessage}`); 
      toast({ title: 'Location Error', description: userFriendlyMessage, variant: 'destructive', duration: 10000 });
      setProgress(0); 
    } finally {
      setIsFetchingLocation(false);
      if (modelsLoaded && hasCameraPermission !== null) { // Only set main loading false if other prerequisites are met
        setIsLoading(false);
      }
    }
  }, [isClient, authCheckCompleted, employeeDetails, toast, isFetchingLocation, isLoading, statusMessage, modelsLoaded, hasCameraPermission]);

  useEffect(() => {
    if (isClient && authCheckCompleted && employeeDetails && hasCameraPermission === true && modelsLoaded && !modelsLoadedError) {
        if (!location && !locationError && !isFetchingLocation) {
             fetchLocationAndAddress();
        }
    } else if (isClient && authCheckCompleted && employeeDetails && (hasCameraPermission !== true || !modelsLoaded || modelsLoadedError)) {
        if(isLoading && !statusMessage.toLowerCase().includes("error")){
             if (!modelsLoadedError && hasCameraPermission !== false) { // If models not error and camera not denied
                if(!statusMessage.toLowerCase().includes("camera") && !statusMessage.toLowerCase().includes("model") && !statusMessage.toLowerCase().includes("fetching location")) {
                   // Avoid setting isLoading to false if we are about to fetch location or setup camera
                } else {
                    // setIsLoading(false); // More controlled by fetchLocationAndAddress's finally block
                }
             } else { // Models error or camera denied
                 setIsLoading(false);
             }
        }
    }
  }, [isClient, authCheckCompleted, employeeDetails, hasCameraPermission, modelsLoaded, fetchLocationAndAddress, modelsLoadedError, isLoading, statusMessage, location, locationError, isFetchingLocation]);


  const captureAndMarkAttendance = useCallback(async (method: 'auto' | 'manual') => {
    if (!videoRef.current || !canvasRef.current || !location || !address || !employeeDetails || isProcessing || captureCooldownActive || modelsLoadedError || !isStreamPlaying ) {
      let missingInfo = [];
      if (!isStreamPlaying) missingInfo.push("camera stream not active");
      if (!location || !address) missingInfo.push("location/address data");
      if (!employeeDetails) missingInfo.push("employee details");
      if (isProcessing) missingInfo.push("process running");
      if (captureCooldownActive) missingInfo.push("cooldown active");
      if (modelsLoadedError) missingInfo.push("face models error");

      const reason = missingInfo.length > 0 ? `Missing: ${missingInfo.join(', ')}.` : 'Pre-conditions not met.';
      const message = `Cannot Mark Attendance. ${reason} ${modelsLoadedError ? "Fix model loading issue." : ""}`;
      console.warn(`AttendancePage: Capture skipped (Method: ${method}). ${message}`);
      if (method === 'manual' && !captureCooldownActive) { // Only toast for manual if not in cooldown
        toast({ title: 'Cannot Mark Attendance', description: message, variant: 'warning', duration: 7000 });
      }
      setIsProcessing(false); // Ensure processing is reset if we bail early
      return;
    }

    setIsProcessing(true);
    setCaptureCooldownActive(true); // Activate cooldown at the start of an attempt
    setStatusMessage(`Capturing attendance (${method})...`);
    setProgress(50); // Reset progress for this specific action

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
        toast({title: "Capture Error", description: "Failed to initialize image capture context.", variant: "destructive"});
        setIsProcessing(false);
        setCaptureCooldownActive(false); 
        return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const photoDataUri = canvas.toDataURL('image/jpeg', 0.8); // Added quality parameter

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
      setStatusMessage(`Attendance marked via ${method} at ${new Date().toLocaleTimeString()}!`);
      setProgress(100);
      toast({ title: 'Attendance Marked', description: `Marked for ${employeeDetails.name}.`, variant: 'default' }); // Changed to default
    } catch (error: any) {
      setStatusMessage(`Error: Could not save attendance. ${error.message || 'Unknown server error.'}`);
      setProgress(0);
      toast({ title: 'Attendance Error', description: `Failed to save. ${error.message || 'Please try again.'}`, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
      setTimeout(() => setCaptureCooldownActive(false), 5000); 
    }
  }, [location, address, employeeDetails, toast, isProcessing, captureCooldownActive, modelsLoadedError, isStreamPlaying]);


  useEffect(() => {
    if (!isClient || !modelsLoaded || modelsLoadedError || !isStreamPlaying || !videoRef.current || isLoading || !!locationError || isFetchingLocation ) {
      if (faceDetectionIntervalRef.current) clearInterval(faceDetectionIntervalRef.current);
      if (autoCaptureTimeoutRef.current) clearTimeout(autoCaptureTimeoutRef.current);
      setIsFaceDetected(false);
      return;
    }

    const video = videoRef.current;

    const startFaceDetection = () => {
      faceDetectionIntervalRef.current = setInterval(async () => {
        if (video && isStreamPlaying && !isProcessing && !captureCooldownActive && modelsLoaded && !modelsLoadedError && location && address) {
          const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({inputSize: 224, scoreThreshold: 0.5})) // Adjusted inputSize
            .withFaceLandmarks()
            .withFaceExpressions();

          if (detections && detections.length > 0) {
            const mainFace = detections[0];
            const faceConfidence = mainFace.detection.score;
            const isSmiling = mainFace.expressions.happy > 0.55; // Slightly adjusted smile threshold

            if (faceConfidence > 0.7 && isSmiling) { 
                setIsFaceDetected(true);
                if (!autoCaptureTimeoutRef.current) { 
                    setStatusMessage("Face detected! Auto-capturing in 2 seconds...");
                    autoCaptureTimeoutRef.current = setTimeout(() => {
                        // Double check all conditions before capture
                        if (isFaceDetected && !isProcessing && !captureCooldownActive && location && address && modelsLoaded && !modelsLoadedError && isStreamPlaying && videoRef.current?.srcObject) {
                           captureAndMarkAttendance('auto');
                        }
                        autoCaptureTimeoutRef.current = null; 
                    }, 2000); 
                }
            } else {
                setIsFaceDetected(false);
                if (autoCaptureTimeoutRef.current) clearTimeout(autoCaptureTimeoutRef.current);
                autoCaptureTimeoutRef.current = null;
                if (!statusMessage.includes("capturing") && !statusMessage.includes("marked") && !statusMessage.toLowerCase().includes("error")) {
                  if (faceConfidence <= 0.7) setStatusMessage("Face not clear enough. Adjust position.");
                  else if (!isSmiling) setStatusMessage("Please smile for the camera!");
                }
            }
          } else { 
            setIsFaceDetected(false);
            if (autoCaptureTimeoutRef.current) clearTimeout(autoCaptureTimeoutRef.current);
            autoCaptureTimeoutRef.current = null;
             if (!statusMessage.includes("capturing") && !statusMessage.includes("marked") && !statusMessage.toLowerCase().includes("error")) setStatusMessage("No face detected. Ensure good lighting & clear view.");
          }
        }
      }, 1200); // Adjusted interval slightly
    };

    startFaceDetection();

    return () => {
      if (faceDetectionIntervalRef.current) clearInterval(faceDetectionIntervalRef.current);
      if (autoCaptureTimeoutRef.current) clearTimeout(autoCaptureTimeoutRef.current);
    };
  }, [isClient, modelsLoaded, modelsLoadedError, isStreamPlaying, isLoading, locationError, isFetchingLocation, captureAndMarkAttendance, isProcessing, captureCooldownActive, location, address, statusMessage]);


  const handleManualCapture = () => {
    if (captureCooldownActive) {
        toast({title: "Cooldown Active", description: "Please wait a moment before trying to capture again.", variant: "warning"}); return;
    }
    if (modelsLoadedError) {
        toast({title: "Models Error", description: `Face models failed to load. Cannot capture. Please check the error message in the camera feed area or refresh.`, variant: "destructive", duration: 7000}); return;
    }

    if (!isStreamPlaying) {
        toast({title: "Camera Issue", description: `Camera is not ready or the stream is not active. Please check permissions and camera connection.`, variant: "warning"}); return;
    }
    if (!location || !address) {
        toast({title: "Location Missing", description: "Location or address data is unavailable. Please wait or try refreshing the location.", variant: "warning"}); return;
    }
    if (!modelsLoaded) {
        toast({title: "Models Not Ready", description: "Face recognition models are still loading or have failed. Please wait or check for errors.", variant: "warning"}); return;
    }
    captureAndMarkAttendance('manual');
  };

  const handleLogout = () => {
    logoutUser();
    if (faceDetectionIntervalRef.current) clearInterval(faceDetectionIntervalRef.current);
    if (autoCaptureTimeoutRef.current) clearTimeout(autoCaptureTimeoutRef.current);
    if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
    }
    setIsStreamPlaying(false);
    setHasCameraPermission(null); // Reset to allow re-init on next login
    setModelsLoaded(false); // Reset models loaded status
    setModelsLoadedError(null);
    setLocation(null);
    setAddress(null);
    setLocationError(null);
    setStatusMessage('Logged out. Initializing...');
    setProgress(0);
    toast({ title: 'Logged Out', description: 'Successfully logged out.' });
    router.replace('/login');
  };

  const handleRefreshLocation = () => {
    if (!isFetchingLocation) {
        fetchLocationAndAddress();
    } else {
        toast({title: "Please Wait", description: "Location fetch already in progress.", variant: "default"});
    }
  };

  // Combined loading state for initial setup
  const isInitialSetupLoading = isLoading || modelsLoading || (isFetchingLocation && (!location || !address));


  if (!isClient || !authCheckCompleted || (!employeeDetails && !statusMessage.toLowerCase().includes("error: employee details not found")) ) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-100 to-gray-300 dark:from-gray-800 dark:to-gray-900 p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">{statusMessage}</p>
        { (isLoading || modelsLoading || isFetchingLocation) && !statusMessage.toLowerCase().includes("error") &&
          <Progress value={progress} className="w-1/2 mt-4 h-2.5 rounded-full" />
        }
      </div>
    );
  }
  
  const showGeneralLoadingScreen = isInitialSetupLoading && (!modelsLoaded || hasCameraPermission === null || (!location && !locationError)) && !modelsLoadedError;


  if (showGeneralLoadingScreen) {
     return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-100 to-gray-300 dark:from-gray-800 dark:to-gray-900 p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">{statusMessage}</p>
        {!statusMessage.toLowerCase().includes("error") && <Progress value={progress} className="w-1/2 mt-4 h-2.5 rounded-full" />}
      </div>
    );
  }

  return (
    <div className="relative flex flex-col items-center justify-start min-h-screen bg-gradient-to-br from-slate-100 via-gray-100 to-stone-200 dark:from-slate-800 dark:via-gray-900 dark:to-neutral-900 p-4 pt-8 md:pt-12 overflow-hidden">
       <Image
        data-ai-hint="abstract background"
        src="https://picsum.photos/seed/attendancepage/1920/1080"
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
        <Card className="shadow-xl col-span-1 bg-card/80 backdrop-blur-sm dark:bg-card/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Camera className="text-primary" /> Camera Feed
            </CardTitle>
            <CardDescription className="text-xs whitespace-pre-line min-h-[3em]">
              {modelsLoadedError ? "See detailed error below." :
               hasCameraPermission === null ? "Initializing camera..." :
               hasCameraPermission === false ? "Camera access denied or failed. Grant permission & refresh." :
               !modelsLoaded && modelsLoading ? "Loading face models..." :
               hasCameraPermission && modelsLoaded && isStreamPlaying ? "Position face in center & smile for auto-capture." :
               hasCameraPermission && modelsLoaded && !isStreamPlaying ? "Camera stream initializing or paused. Ensure camera is not covered." :
               "Camera status unknown. Ensure permissions."
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

            {hasCameraPermission === false && !modelsLoadedError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white p-4 rounded-b-lg text-center">
                <XCircle className="w-12 h-12 mb-2 text-destructive" />
                <p>Camera permission denied or camera error. Enable in browser settings & refresh.</p>
              </div>
            )}
             {isStreamPlaying && modelsLoaded && !modelsLoadedError && (
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
             {hasCameraPermission === true && modelsLoaded && !modelsLoadedError && !isStreamPlaying && !statusMessage.toLowerCase().includes("error") && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white p-4 rounded-b-lg text-center">
                    <Loader2 className="w-8 h-8 animate-spin mb-2" />
                    <p>Initializing video stream...</p>
                </div>
             )}
            {modelsLoadedError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-destructive/90 text-destructive-foreground p-4 rounded-b-lg text-center overflow-y-auto">
                  <AlertTriangle className="w-10 h-10 mb-2 flex-shrink-0" />
                  <p className="font-semibold text-base mb-1">Critical Error: Models Failed</p>
                  <ScrollArea className="max-h-[120px] text-xs whitespace-pre-line text-left px-2 mb-2 bg-destructive/30 rounded-sm py-1">
                     {modelsLoadedError}
                  </ScrollArea>
                   <Button onClick={() => window.location.reload()} className="mt-2" size="sm" variant="secondary">
                      <RefreshCw className="mr-2 h-3 w-3" /> Refresh Page
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
                <Button variant="outline" size="sm" onClick={handleRefreshLocation} disabled={isFetchingLocation}>
                    <RefreshCw className={`h-3 w-3 ${isFetchingLocation ? 'animate-spin' : ''}`} />
                </Button>
            </div>
            {isFetchingLocation && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Fetching location...</div>}
            {locationError && !isFetchingLocation && <Alert variant="destructive" className="text-xs mt-2"><AlertTriangle className="h-4 w-4" /><AlertTitle>Location Error</AlertTitle><AlertDescription>{locationError}</AlertDescription></Alert>}
            {location && !isFetchingLocation && (
              <p className="text-muted-foreground">
                Lat: {location.latitude.toFixed(5)}, Lon: {location.longitude.toFixed(5)}
              </p>
            )}
            {address && !isFetchingLocation && <p className="text-muted-foreground text-xs">{address}</p>}
            {!address && location && !locationError && !isFetchingLocation && <p className="text-muted-foreground text-xs flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Fetching address...</p>}
          </CardContent>
        </Card>

        <Card className="md:col-span-2 shadow-xl bg-card/80 backdrop-blur-sm dark:bg-card/70">
            <CardContent className="p-4 space-y-3">
                 <div className="flex items-center justify-center text-center text-sm min-h-[40px] p-2 rounded-md bg-muted/50 dark:bg-muted/30">
                    {isProcessing ? <Loader2 className="h-5 w-5 animate-spin mr-2 text-primary" /> :
                     modelsLoadedError || locationError || statusMessage.toLowerCase().includes("error:") ? <AlertTriangle className="h-5 w-5 mr-2 text-destructive" /> :
                     statusMessage.toLowerCase().includes("success") || statusMessage.toLowerCase().includes("ready!") || (modelsLoaded && statusMessage.toLowerCase().includes("models loaded.") && isStreamPlaying ) ? <CheckCircle className="h-5 w-5 mr-2 text-green-500" /> :
                     (isLoading || modelsLoading || isFetchingLocation || (hasCameraPermission === true && !isStreamPlaying) ) && !statusMessage.toLowerCase().includes("error") ? <Loader2 className="h-5 w-5 animate-spin mr-2 text-primary" /> :
                     <Camera className="h-5 w-5 mr-2 text-muted-foreground" />
                    }
                    <span className={`${modelsLoadedError || locationError || statusMessage.toLowerCase().includes("error:") ? 'text-destructive' : (statusMessage.toLowerCase().includes("success") || statusMessage.toLowerCase().includes("ready!") || (modelsLoaded && statusMessage.toLowerCase().includes("models loaded.") && isStreamPlaying)) ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'} whitespace-pre-line text-xs`}>
                        {statusMessage}
                    </span>
                </div>
                {(isProcessing || ( (isLoading || modelsLoading || isFetchingLocation) && progress < 100 && !statusMessage.toLowerCase().includes("error") && !modelsLoadedError && !locationError )) && <Progress value={progress} className="w-full h-2" />}

                 <Button
                    onClick={handleManualCapture}
                    className="w-full py-3 text-base font-semibold"
                    disabled={
                        isProcessing ||
                        captureCooldownActive ||
                        !modelsLoaded ||
                        !!modelsLoadedError ||
                        !isStreamPlaying ||
                        !!locationError ||
                        !location ||
                        !address ||
                        isFetchingLocation
                    }
                    aria-label="Mark Attendance Manually"
                  >
                  {isProcessing ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Camera className="mr-2 h-5 w-5" />}
                  {isProcessing ? 'Processing...' : captureCooldownActive ? 'Cooldown...' : 'Mark Manually'}
                </Button>
                <p className="text-xs text-center text-muted-foreground/80">
                    {captureCooldownActive ? "Please wait before trying again." :
                     (modelsLoaded && !modelsLoadedError && isStreamPlaying && location && address && !isFetchingLocation && !isProcessing) ? "Auto-capture active if face is clear and smiling." :
                     modelsLoadedError ? "Face models failed. Auto-capture disabled. Follow instructions in Camera Feed." :
                     !isStreamPlaying ? "Camera not streaming. Ensure it's not covered and permissions are granted." :
                     (locationError || !location || !address) ? "Location or address data missing. Auto-capture disabled. Try refreshing location." :
                     "Ensure camera, location & models are ready for attendance."}
                </p>
            </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default AttendancePage;
