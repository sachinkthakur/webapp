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
import { ScrollArea } from '@/components/ui/scroll-area';


const AttendancePage: NextPage = () => {
  const router = useRouter();
  const { toast } = useToast();

  const [loggedInUserPhone, setLoggedInUserPhone] = useState<string | null>(null);
  const [employeeDetails, setEmployeeDetails] = useState<Employee | null>(null);
  const [authCheckCompleted, setAuthCheckCompleted] = useState(false);

  const [isLoading, setIsLoading] = useState(true); // General loading for setup phases
  const [isProcessing, setIsProcessing] = useState(false); // For attendance marking process
  const [statusMessage, setStatusMessage] = useState('Initializing...');
  const [progress, setProgress] = useState(0);

  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false); // Specific for models
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
    const currentLoggedInUser = checkLoginStatus(); // Returns string or null
    console.log("AttendancePage: Auth Check. LoggedInUser from checkLoginStatus():", currentLoggedInUser);

    if (!currentLoggedInUser) { // Check for null or empty string effectively
      toast({ title: 'Authentication Required', description: 'You need to be logged in. Redirecting...', variant: 'destructive' });
      logoutUser();
      router.replace('/login');
      return;
    }
    
    // Ensure currentLoggedInUser is a string before calling toLowerCase
    if (typeof currentLoggedInUser === 'string' && currentLoggedInUser.toLowerCase() === 'admin') {
        toast({ title: 'Access Denied', description: 'Administrators cannot mark attendance. Redirecting...', variant: 'destructive' });
        logoutUser(); 
        router.replace('/login'); 
        return;
    }
    
    setLoggedInUserPhone(currentLoggedInUser); // currentLoggedInUser is guaranteed to be a non-admin string here
    setAuthCheckCompleted(true);
    console.log("AttendancePage: User authenticated as employee:", currentLoggedInUser);
    setStatusMessage("User verified.");
    setProgress(20);

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
  }, [loggedInUserPhone, router, toast]);

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
        let detailedErrorMessage = 'CRITICAL: Face models failed to load.\n\n';
        const errorMessageString = String(error.message || 'Unknown error.');

        if (errorMessageString.toLowerCase().includes('failed to fetch') || errorMessageString.includes('404')) {
            const urlMatch = errorMessageString.match(/from url: (https?:\/\/[^\s]+)/);
            const failedUrlPart = urlMatch && urlMatch[1] ? `(e.g., failed to fetch: ${urlMatch[1]})` : '';
            detailedErrorMessage += `REASON: The server reported an error (e.g., "404 Not Found") when trying to fetch model files ${failedUrlPart}. This usually means the model files are missing OR THE SERVER NEEDS A RESTART after adding them.\n\n`;
        } else {
            detailedErrorMessage += `DETAILS: ${errorMessageString}\n\n`;
        }
        detailedErrorMessage += "ACTION REQUIRED (Please follow carefully):\n";
        detailedErrorMessage += "1. Ensure you have downloaded ALL the necessary face-api.js model files (e.g., .json manifest files AND .weights or shard files for EACH model - tinyFaceDetector, faceLandmark68Net, faceRecognitionNet, faceExpressionNet).\n";
        detailedErrorMessage += "2. In your project, verify the 'public' folder exists at the root. Inside 'public', ensure there is a subfolder named 'models' (all lowercase). The path should be `public/models/`.\n";
        detailedErrorMessage += "3. Confirm ALL downloaded model files are placed directly into this `public/models/` folder. Do NOT put them in sub-subfolders.\n";
        detailedErrorMessage += "4. CRUCIAL: After placing/verifying the files, you MUST RESTART your development server (e.g., stop 'npm run dev' and run it again). If deployed, ensure the deployment includes these files correctly under the 'public/models' path and the server instance is restarted/updated.\n";
        detailedErrorMessage += "5. If the error persists, double-check file names in `public/models/` for typos and ensure all parts of each model (manifests, shards/weights) are present. Verify the server is correctly serving static files from the 'public' directory by trying to access one of the model manifest files directly in your browser (e.g., your-app-url.com/models/tiny_face_detector_model-weights_manifest.json).\n";
        
        setModelsLoadedError(detailedErrorMessage);
        setStatusMessage(`Error: Face models failed. See details in camera feed area.`); 
        toast({
          title: 'CRITICAL: Face Models Missing/Error!',
          description: "Face models could not be loaded. The camera feed area shows detailed instructions. Ensure models are in 'public/models' and server was restarted if files were added recently.",
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
    if (!isClient || !authCheckCompleted || !employeeDetails || !modelsLoaded || hasCameraPermission === true || hasCameraPermission === false) { // Added guard against re-running if permission already attempted
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
        
        stream.getVideoTracks().forEach(track => {
          track.onended = () => {
            console.warn('AttendancePage: Video track ended unexpectedly.');
            if (videoRef.current) {
              videoRef.current.srcObject = null; // Explicitly clear it
              videoRef.current.load(); // Attempt to clear video frame
            }
            setHasCameraPermission(false);
            setStatusMessage("Error: Camera stream unexpectedly ended. Please refresh or check camera.");
            toast({ title: "Camera Stream Ended", description: "The camera connection was lost. You may need to refresh the page.", variant: "destructive" });
            if (faceDetectionIntervalRef.current) {
              clearInterval(faceDetectionIntervalRef.current);
              faceDetectionIntervalRef.current = null;
            }
            if (autoCaptureTimeoutRef.current) {
              clearTimeout(autoCaptureTimeoutRef.current);
              autoCaptureTimeoutRef.current = null;
            }
            setIsFaceDetected(false);
          };
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setHasCameraPermission(true); // Permission granted, stream obtained
          setStatusMessage("Camera connected. Attempting to stream...");
          console.log("AttendancePage: Camera permission granted. Stream assigned to video element.");

          videoRef.current.play().then(() => {
            console.log("AttendancePage: Video playback started successfully.");
            setStatusMessage("Camera active and streaming.");
            setProgress(80);
          }).catch(playError => {
            console.error("AttendancePage: Error attempting to play video stream:", playError);
            setStatusMessage("Error: Camera connected, but cannot start video. Try interacting with the page or check browser settings.");
            toast({
              variant: 'warning',
              title: 'Camera Playback Issue',
              description: `The camera is connected, but video playback failed: ${playError.message}. This can sometimes be resolved by clicking/tapping on the page.`,
              duration: 7000
            });
          });

          videoRef.current.onloadedmetadata = () => {
            console.log("AttendancePage: onloadedmetadata fired for video. Video dimensions:", videoRef.current?.videoWidth, videoRef.current?.videoHeight);
            if (videoRef.current?.paused) {
                console.log("AttendancePage: Video was paused, attempting play again via onloadedmetadata.");
                videoRef.current?.play().then(() => {
                    console.log("AttendancePage: Video playback started successfully via onloadedmetadata.");
                    if(!statusMessage.toLowerCase().includes("active and streaming")) { // Avoid overwriting more specific success message
                        setStatusMessage("Camera active and streaming (via metadata).");
                    }
                }).catch(playError => {
                    console.error("AttendancePage: Error playing video stream from onloadedmetadata (was paused):", playError);
                    if (!statusMessage.toLowerCase().includes("error")) {
                       setStatusMessage("Error: Could not start camera video even after metadata loaded.");
                    }
                });
            }
          };
        } else {
           console.error("AttendancePage: videoRef.current IS NULL when trying to set srcObject.");
           setHasCameraPermission(false);
           setStatusMessage("Error: Camera component not ready.");
           toast({ title: 'Internal Error', description: 'Camera component not ready.', variant: 'destructive'});
           return;
        }
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
                    description = 'Camera access was denied. Please enable camera permissions in your browser settings for this site.';
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

    if (isClient && authCheckCompleted && employeeDetails && modelsLoaded && !modelsLoadedError && hasCameraPermission === null) { // Ensure it only runs when permission state is initial
      getCameraPermission();
    }
  }, [isClient, authCheckCompleted, employeeDetails, modelsLoaded, modelsLoadedError, toast, hasCameraPermission, statusMessage]); // Added statusMessage as it's updated inside

  const fetchLocationAndAddress = useCallback(async () => {
    if (!isClient || !authCheckCompleted || !employeeDetails || isFetchingLocation) { // Added isFetchingLocation guard
      console.log("AttendancePage: fetchLocationAndAddress skipped, conditions not met or already fetching.");
      if (isLoading && !statusMessage.toLowerCase().includes("error")) setIsLoading(false);
      return;
    }
    
    console.log("AttendancePage: Attempting to fetch location and address.");
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
      console.log("AttendancePage: Coordinates fetched:", coords.latitude, coords.longitude);
      setStatusMessage("Location acquired. Fetching address...");
      setProgress(90);

      const addr = await getAddressFromCoordinates(coords.latitude, coords.longitude);
      setAddress(addr);
      console.log("AttendancePage: Address fetched:", addr);
      setStatusMessage("Location and address ready.");
      setProgress(100);
      setLocationError(null); 
    } catch (error: any) {
      console.error('AttendancePage: Error fetching location or address:', error);
      let userFriendlyMessage = 'Could not get location or address. Ensure GPS/network active & browser permissions granted for this site.';
      if (error instanceof GeolocationError) {
        userFriendlyMessage = error.message; 
      } else if (error.message && error.message.toLowerCase().includes("could not retrieve address")) {
        userFriendlyMessage = "Location found, but address lookup failed. Check network or try refreshing location.";
      } else if (error.message) {
        userFriendlyMessage = `Location/Address Error: ${error.message}`;
      }
      setLocationError(userFriendlyMessage);
      setStatusMessage(`Error: ${userFriendlyMessage}`);
      toast({ title: 'Location Error', description: userFriendlyMessage, variant: 'destructive' });
      setProgress(0); 
    } finally {
      setIsLoading(false); 
      setIsFetchingLocation(false);
    }
  }, [isClient, authCheckCompleted, employeeDetails, toast, isLoading, statusMessage, isFetchingLocation]); 

  useEffect(() => {
    if (isClient && authCheckCompleted && employeeDetails && hasCameraPermission === true && modelsLoaded && !modelsLoadedError) {
        if (!location && !locationError && !isFetchingLocation) { 
             fetchLocationAndAddress();
        }
    } else if (isClient && authCheckCompleted && employeeDetails && (hasCameraPermission !== true || !modelsLoaded || modelsLoadedError)) {
        if(isLoading && !statusMessage.toLowerCase().includes("error")){ 
             setIsLoading(false);
             if (!modelsLoadedError && hasCameraPermission !== false) { 
                setStatusMessage("Setup incomplete (camera/models). Location not fetched.");
             }
        }
    }
  }, [isClient, authCheckCompleted, employeeDetails, hasCameraPermission, modelsLoaded, fetchLocationAndAddress, modelsLoadedError, isLoading, statusMessage, location, locationError, isFetchingLocation]);


  const captureAndMarkAttendance = useCallback(async (method: 'auto' | 'manual') => {
    if (!videoRef.current || !canvasRef.current || !location || !address || !employeeDetails || isProcessing || captureCooldownActive || modelsLoadedError || hasCameraPermission !== true || !videoRef.current.srcObject) {
      let missingInfo = [];
      if (hasCameraPermission !== true) missingInfo.push("camera permission not granted or camera not found/ready");
      else if (!videoRef.current?.srcObject) missingInfo.push("camera stream not active (srcObject missing)");
      else if (videoRef.current?.paused || videoRef.current?.ended) missingInfo.push("camera stream paused or ended");
      if (!location) missingInfo.push("location data");
      if (!address) missingInfo.push("address data");
      if (!employeeDetails) missingInfo.push("employee details loaded");
      if (isProcessing) missingInfo.push("another process already running");
      if (captureCooldownActive) missingInfo.push("cooldown period active");
      if (modelsLoadedError) missingInfo.push("face models failed to load (see critical error message)");
      
      const message = `Cannot Mark Attendance. Missing or waiting for: ${missingInfo.join(', ') || 'required information or conditions'}. ${modelsLoadedError ? "Fix model loading issue first." : ""}`;
      console.warn(`AttendancePage: Attendance capture skipped. Method: ${method}. ${message}`);
      if (method === 'manual' && !captureCooldownActive) { 
        toast({ title: 'Cannot Mark Attendance', description: message, variant: 'warning' });
      }
      setIsProcessing(false); // Ensure processing is reset if skipped early
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


  useEffect(() => {
    if (!isClient || !modelsLoaded || modelsLoadedError || hasCameraPermission !== true || !videoRef.current || isLoading || !!locationError || isFetchingLocation ) {
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
        console.log("AttendancePage: Video stream not ready for face detection. Waiting... State:", {srcObj: !!video.srcObject, paused: video.paused, ended: video.ended, readyState: video.readyState});
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
                        
                        if (isFaceDetected && !isProcessing && !captureCooldownActive && location && address && modelsLoaded && !modelsLoadedError && hasCameraPermission === true && videoRef.current?.srcObject) { // Added srcObject check here too
                           console.log("AttendancePage: Auto-capturing attendance now.");
                           captureAndMarkAttendance('auto');
                        } else {
                            console.log("AttendancePage: Auto-capture aborted. Conditions changed.", {isFaceDetected, isProcessing, captureCooldownActive, locationExists: !!location, addressExists: !!address, srcObjExists: !!videoRef.current?.srcObject});
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
                 if (faceConfidence <= 0.75 && isSmiling && !statusMessage.includes("capturing") && !statusMessage.includes("marked") && !statusMessage.toLowerCase().includes("error")) setStatusMessage("Face not clear enough. Adjust position.");
                 else if (faceConfidence > 0.75 && !isSmiling && !statusMessage.includes("capturing") && !statusMessage.includes("marked") && !statusMessage.toLowerCase().includes("error")) setStatusMessage("Please smile for the camera!");
                 else if (!statusMessage.includes("capturing") && !statusMessage.includes("marked") && !statusMessage.toLowerCase().includes("error")) setStatusMessage("Position your face in the center and smile for auto-capture.");
            }
          } else { 
            setIsFaceDetected(false);
            if (autoCaptureTimeoutRef.current) { 
                clearTimeout(autoCaptureTimeoutRef.current);
                autoCaptureTimeoutRef.current = null;
            }
             if (!statusMessage.includes("capturing") && !statusMessage.includes("marked") && !statusMessage.toLowerCase().includes("error")) setStatusMessage("No face detected. Ensure good lighting and clear view.");
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
  }, [isClient, modelsLoaded, modelsLoadedError, hasCameraPermission, isLoading, locationError, isFetchingLocation, captureAndMarkAttendance, isProcessing, captureCooldownActive, location, address, statusMessage]);


  const handleManualCapture = () => {
    console.log("AttendancePage: Manual capture initiated.");
    if (captureCooldownActive) {
        toast({title: "Cooldown Active", description: "Please wait a moment before trying again.", variant: "warning"});
        return;
    }
    if (modelsLoadedError) {
        toast({title: "Models Error", description: `Face models failed. Cannot capture. Please fix model loading issue (see message above).`, variant: "destructive"});
        return;
    }
    
    let cameraProblem = null;
    if (hasCameraPermission !== true) cameraProblem = "Camera permission not granted.";
    else if (!videoRef.current) cameraProblem = "Video element not ready.";
    else if (!videoRef.current.srcObject) cameraProblem = "Camera stream not active.";
    else if (videoRef.current.paused || videoRef.current.ended || videoRef.current.readyState < 3) cameraProblem = "Camera stream not playing or ready.";

    if (cameraProblem) {
        console.warn("AttendancePage: Manual capture PRE-FLIGHT CHECK FAILED (Camera). Problem:", cameraProblem);
        toast({title: "Camera Issue", description: `Camera not ready: ${cameraProblem}`, variant: "warning"});
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
    if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
    }
    toast({ title: 'Logged Out', description: 'You have been successfully logged out.' });
    router.replace('/login');
  };

  const handleRefreshLocation = () => {
    if (!isFetchingLocation) { // Check if not already fetching
      fetchLocationAndAddress(); 
    } else {
      toast({title: "Please Wait", description: "Location fetch already in progress.", variant: "default"});
    }
  };


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
  
  const showGeneralLoadingScreen = (isLoading || modelsLoading || isFetchingLocation) && (!modelsLoaded || hasCameraPermission === null || (!location && !locationError)) && !modelsLoadedError;


  if (showGeneralLoadingScreen) {
     return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-100 to-gray-300 dark:from-gray-800 dark:to-gray-900 p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">{statusMessage}</p>
        {!statusMessage.toLowerCase().includes("error") && <Progress value={progress} className="w-1/2 mt-4 h-2.5 rounded-full" />}
      </div>
    );
  }
  
  const isCameraFullyReady = hasCameraPermission === true && !!videoRef.current?.srcObject && videoRef.current?.readyState >=3 && !videoRef.current?.paused;

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
            <CardDescription className="text-xs whitespace-pre-line min-h-[3em]">
              {modelsLoadedError ? "See detailed error below." :
               hasCameraPermission === null ? "Initializing camera..." :
               hasCameraPermission === false ? "Camera access denied. Please grant permission in browser settings for this site and refresh." :
               !modelsLoaded && modelsLoading ? "Loading face models..." :
               hasCameraPermission && modelsLoaded && isCameraFullyReady ? "Position your face in the center and smile for auto-capture." :
               hasCameraPermission && modelsLoaded && !isCameraFullyReady ? "Camera stream initializing or paused. Ensure camera is not covered." :
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
            
            {hasCameraPermission === false && !modelsLoadedError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white p-4 rounded-b-lg text-center">
                <XCircle className="w-12 h-12 mb-2 text-destructive" />
                <p>Camera permission denied. Please enable it in your browser settings and refresh.</p>
              </div>
            )}
             {isCameraFullyReady && modelsLoaded && !modelsLoadedError && (
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
             {hasCameraPermission === true && modelsLoaded && !modelsLoadedError && !isCameraFullyReady && !statusMessage.toLowerCase().includes("error") && (
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
            {address && !isFetchingLocation ? <p className="text-muted-foreground text-xs">{address}</p> : (location && !locationError && !isFetchingLocation && <p className="text-muted-foreground text-xs flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Fetching address...</p>)}
          </CardContent>
        </Card>
        
        <Card className="md:col-span-2 shadow-xl bg-card/80 backdrop-blur-sm dark:bg-card/70">
            <CardContent className="p-4 space-y-3">
                 <div className="flex items-center justify-center text-center text-sm min-h-[40px] p-2 rounded-md bg-muted/50 dark:bg-muted/30">
                    {isProcessing ? <Loader2 className="h-5 w-5 animate-spin mr-2 text-primary" /> : 
                     statusMessage.toLowerCase().includes("error:") || modelsLoadedError || locationError ? <AlertTriangle className="h-5 w-5 mr-2 text-destructive" /> :
                     statusMessage.toLowerCase().includes("success") || statusMessage.toLowerCase().includes("ready") || (modelsLoaded && statusMessage.toLowerCase().includes("models loaded") && statusMessage.toLowerCase().includes("camera access granted") && isCameraFullyReady ) ? <CheckCircle className="h-5 w-5 mr-2 text-green-500" /> :
                     (isLoading || modelsLoading || isFetchingLocation || (hasCameraPermission === true && !isCameraFullyReady) ) && !statusMessage.toLowerCase().includes("error") ? <Loader2 className="h-5 w-5 animate-spin mr-2 text-primary" /> :
                     <Camera className="h-5 w-5 mr-2 text-muted-foreground" />
                    }
                    <span className={`${statusMessage.toLowerCase().includes("error:") || modelsLoadedError || locationError ? 'text-destructive' : (statusMessage.toLowerCase().includes("success") || statusMessage.toLowerCase().includes("ready") || (modelsLoaded && statusMessage.toLowerCase().includes("models loaded") && statusMessage.toLowerCase().includes("camera access granted") && isCameraFullyReady)) ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'} whitespace-pre-line text-xs`}>
                        {statusMessage}
                    </span>
                </div>
                {(isProcessing || ((isLoading || modelsLoading || isFetchingLocation) && progress < 100 && !statusMessage.toLowerCase().includes("error") && !modelsLoadedError && !locationError )) && <Progress value={progress} className="w-full h-2" />}

                 <Button 
                    onClick={handleManualCapture} 
                    className="w-full py-3 text-base font-semibold"
                    disabled={
                        isProcessing || 
                        captureCooldownActive || 
                        !modelsLoaded || 
                        !!modelsLoadedError || 
                        !isCameraFullyReady || // Main check for camera usability
                        !!locationError || 
                        !location || 
                        !address ||
                        (isLoading && (!location && !locationError)) || // Still loading general page elements
                        isFetchingLocation // Location is being fetched
                    }
                    aria-label="Mark Attendance Manually"
                  >
                  {isProcessing ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Camera className="mr-2 h-5 w-5" />}
                  {isProcessing ? 'Processing...' : captureCooldownActive ? 'Cooldown...' : 'Mark Manually'}
                </Button>
                <p className="text-xs text-center text-muted-foreground/80">
                    {captureCooldownActive ? "Please wait before trying again." : 
                     (modelsLoaded && !modelsLoadedError && isCameraFullyReady && location && address && !isLoading && !isProcessing && !isFetchingLocation) ? "Auto-capture active if face is clear and smiling." : 
                     modelsLoadedError ? "Face models failed. Auto-capture disabled. Follow instructions in Camera Feed." :
                     !isCameraFullyReady ? "Camera not streaming. Ensure it's not covered and permissions are granted." :
                     "Ensure camera, location & models are ready for attendance."}
                </p>
            </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default AttendancePage;
    
