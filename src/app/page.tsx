'use client';

import type { NextPage } from 'next';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import * as faceapi from 'face-api.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/use-toast'; // Import the hook correctly
import { Loader2, Camera, CheckCircle, XCircle, MapPin, Clock, User } from 'lucide-react';
import { getCurrentPosition, getAddressFromCoordinates, GeolocationError } from '@/services/geo-location';
import { saveAttendance, AttendanceRecord, Employee, getEmployeeById } from '@/services/attendance'; // Assuming these functions exist
import Image from 'next/image';


// Debounce function
function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}


const AttendancePage: NextPage = () => {
  // ** State Hooks **
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false); // For manual capture button state
  const [isProcessing, setIsProcessing] = useState(false); // For overall processing state (location, face detection, submit)
  const [detectionProgress, setDetectionProgress] = useState(0); // Progress bar for face detection confidence
  const [isFaceDetected, setIsFaceDetected] = useState(false); // Flag for stable face detection
  const [captureCooldownActive, setCaptureCooldownActive] = useState(false); // Cooldown after capture
  const [statusMessage, setStatusMessage] = useState<string>("Initializing..."); // User feedback
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loggedInUserId, setLoggedInUserId] = useState<string | null>(null);


  // ** Refs **
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const faceDetectionIntervalRef = useRef<NodeJS.Timeout | null>(null);


  // ** Hooks **
  const router = useRouter();
  const { toast } = useToast(); // Correctly call the hook inside the component body


  // ** Constants **
  const FACE_DETECTION_INTERVAL = 500; // ms
  const FACE_CONFIDENCE_THRESHOLD = 0.85; // Required confidence for detection
  const CAPTURE_COOLDOWN = 5000; // ms (5 seconds)
  const REQUIRED_CONSECUTIVE_DETECTIONS = 3; // Number of stable detections needed


  // ** Memoized Values **
  const consecutiveDetections = useRef<number>(0); // Counter for stable detections


  // ** Effects **

  // Check login status and fetch employee data
   useEffect(() => {
    const userId = localStorage.getItem('loggedInUser');
    if (!userId) {
      toast({ title: 'Not Logged In', description: 'Redirecting to login...', variant: 'destructive' });
      router.replace('/login');
      return;
    }
    setLoggedInUserId(userId);

    // Fetch employee details (replace with your actual fetching logic)
    setStatusMessage('Fetching employee details...');
    getEmployeeById(userId) // Assuming this function exists and fetches employee data
      .then(emp => {
        if (emp) {
          setEmployee(emp);
          setStatusMessage('Employee details loaded.');
        } else {
          setError('Employee not found.');
          setStatusMessage('Error: Employee not found.');
           toast({ title: 'Error', description: 'Employee data not found.', variant: 'destructive' });
        }
      })
      .catch(err => {
         console.error("Error fetching employee:", err);
         setError('Failed to fetch employee details.');
         setStatusMessage('Error: Could not load employee details.');
          toast({ title: 'Error', description: 'Failed to fetch employee details.', variant: 'destructive' });
      });

  }, [router, toast]); // Added toast as dependency


  // Load FaceAPI models
  useEffect(() => {
    const loadModels = async () => {
      const MODEL_URL = '/models'; // Assuming models are in public/models
       setStatusMessage('Loading AI models...');
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          // faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL), // Optional: if needed for recognition
          // faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL), // Alternative detector
        ]);
        setModelsLoaded(true);
         setStatusMessage('AI Models loaded. Getting location...');
        console.log('FaceAPI models loaded successfully.');
      } catch (err) {
        console.error('Error loading FaceAPI models:', err);
        setError('Failed to load face detection models. Please refresh.');
        setStatusMessage('Error: Failed to load AI models.');
        toast({ title: 'Model Load Error', description: 'Could not load face detection models.', variant: 'destructive' });
      }
    };
    loadModels();
  }, [toast]); // Added toast as dependency


  // Get location
  useEffect(() => {
    if (!modelsLoaded || !loggedInUserId) return; // Wait for models and login

    const fetchLocationAndAddress = async () => {
       setIsProcessing(true); // Start overall processing indicator
       setStatusMessage('Getting current location...');
      try {
        const coords = await getCurrentPosition();
        setLocation({ lat: coords.latitude, lon: coords.longitude });
        setStatusMessage('Location acquired. Getting address...');

        try {
            const addr = await getAddressFromCoordinates(coords.latitude, coords.longitude);
            setAddress(addr);
            setStatusMessage('Address acquired. Starting camera...');
            console.log(`Location: ${coords.latitude}, ${coords.longitude}, Address: ${addr}`);
            setError(null); // Clear previous errors
        } catch (addrError) {
             console.error('Error getting address:', addrError);
             setAddress('Address lookup failed'); // Provide fallback address
             setStatusMessage('Could not get address. Starting camera...');
             toast({ title: 'Address Error', description: 'Could not retrieve address.', variant: 'warning' });
             // Continue with camera even if address fails
        } finally {
            startVideoStream(); // Start camera after attempting location/address
        }

      } catch (err) {
        console.error('Error getting location:', err);
         let userMessage = 'Failed to get location. Please ensure location services are enabled and permissions granted.';
         if (err instanceof GeolocationError) {
            userMessage = err.message; // Use the specific message from GeolocationError
             if (err.code === 3) { // Timeout
               userMessage = 'Location request timed out. Check GPS/Network and try again.';
             } else if (err.code === 1) { // Permission denied
               userMessage = 'Location permission denied. Please enable location access in your browser/device settings.';
             }
         }
         setError(userMessage);
         setStatusMessage(`Error: ${userMessage}`);
         toast({ title: 'Location Error', description: userMessage, variant: 'destructive' });
         setIsProcessing(false); // Stop processing on critical error
      }
      // Note: setIsProcessing(false) is called within startVideoStream or if location fails critically
    };

    fetchLocationAndAddress();

  }, [modelsLoaded, loggedInUserId, toast]); // Added toast as dependency


  // Start video stream
  const startVideoStream = useCallback(() => {
    if (!modelsLoaded || !location) {
       console.log("Waiting for models or location to start video...");
       return; // Don't start if models aren't loaded or location failed critically
    }
     setStatusMessage('Starting camera...');
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: 'user' }, // Use front camera
        audio: false,
      })
      .then((stream) => {
        setVideoStream(stream);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
           setStatusMessage('Camera active. Position face in center.');
           setError(null);
           setIsProcessing(false); // Processing (location phase) is done, now detecting
        }
         console.log("Video stream started.");
      })
      .catch((err) => {
        console.error('Error accessing camera:', err);
        setError('Failed to access camera. Please ensure permissions are granted.');
        setStatusMessage('Error: Failed to access camera.');
        setIsProcessing(false); // Stop processing if camera fails
        toast({ title: 'Camera Error', description: 'Could not access camera.', variant: 'destructive' });
      });
  }, [modelsLoaded, location, toast]); // Added toast as dependency


  // Face detection loop
  useEffect(() => {
    if (!modelsLoaded || !videoStream || !videoRef.current || isProcessing || captureCooldownActive) {
       // Clear interval if conditions aren't met
       if (faceDetectionIntervalRef.current) {
            clearInterval(faceDetectionIntervalRef.current);
            faceDetectionIntervalRef.current = null;
            setDetectionProgress(0);
            setIsFaceDetected(false);
            consecutiveDetections.current = 0;
       }
       return;
    }

    const video = videoRef.current;
    const displaySize = { width: video.clientWidth, height: video.clientHeight };

    if (canvasRef.current) {
        faceapi.matchDimensions(canvasRef.current, displaySize);
    }

     setStatusMessage('Detecting face...');

    faceDetectionIntervalRef.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.paused || videoRef.current.ended || captureCooldownActive) {
         if (faceDetectionIntervalRef.current) clearInterval(faceDetectionIntervalRef.current);
         return; // Stop if video not playing or in cooldown
      }

      try {
          const detections = await faceapi.detectAllFaces(
                video,
                new faceapi.TinyFaceDetectorOptions({ inputSize: 320 }) // Use a lighter model
          ).withFaceLandmarks(); //.withFaceDescriptors(); // Add descriptors if needed for recognition


          const resizedDetections = faceapi.resizeResults(detections, displaySize);


           // --- Visualization (Optional) ---
           if (canvasRef.current) {
                const context = canvasRef.current.getContext('2d');
                if (context) {
                     context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                     // faceapi.draw.drawDetections(canvasRef.current, resizedDetections); // Draw boxes
                     // faceapi.draw.drawFaceLandmarks(canvasRef.current, resizedDetections); // Draw landmarks
                }
           }
           // --- End Visualization ---


          if (resizedDetections.length === 1) {
                const detectionScore = resizedDetections[0].detection.score;
                setDetectionProgress(Math.round(detectionScore * 100));


                if (detectionScore > FACE_CONFIDENCE_THRESHOLD) {
                    consecutiveDetections.current++;
                     setStatusMessage(`Face detected (${consecutiveDetections.current}/${REQUIRED_CONSECUTIVE_DETECTIONS}). Hold still...`);
                    setIsFaceDetected(true);


                    if (consecutiveDetections.current >= REQUIRED_CONSECUTIVE_DETECTIONS && !captureCooldownActive) {
                         setStatusMessage('Stable face detected! Capturing...');
                         handleAutoCapture(); // Trigger auto-capture
                    }
                } else {
                    // Confidence below threshold
                    consecutiveDetections.current = 0; // Reset counter
                    setIsFaceDetected(false);
                    setStatusMessage('Face detected, but low confidence. Adjust position.');
                }
          } else if (resizedDetections.length > 1) {
                // Multiple faces detected
                setDetectionProgress(0);
                consecutiveDetections.current = 0;
                setIsFaceDetected(false);
                setStatusMessage('Multiple faces detected. Ensure only one person is visible.');
          } else {
                // No face detected
                setDetectionProgress(0);
                consecutiveDetections.current = 0;
                setIsFaceDetected(false);
                setStatusMessage('No face detected. Position face in center.');
          }
      } catch (err) {
          console.error("Error during face detection:", err);
          // Don't stop the loop for detection errors, but maybe log them
          setStatusMessage('Face detection error. Trying again...');
      }

    }, FACE_DETECTION_INTERVAL);


    return () => {
       // Cleanup interval on unmount or when dependencies change
       if (faceDetectionIntervalRef.current) {
            clearInterval(faceDetectionIntervalRef.current);
            faceDetectionIntervalRef.current = null;
            console.log("Face detection interval cleared.");
       }
    };
     // Ensure detection restarts if cooldown ends or processing finishes
  }, [modelsLoaded, videoStream, isProcessing, captureCooldownActive, startVideoStream, toast]); // Dependencies


  // Cleanup video stream on unmount
  useEffect(() => {
    return () => {
      if (videoStream) {
        videoStream.getTracks().forEach((track) => track.stop());
         console.log("Video stream stopped on unmount.");
      }
      if (faceDetectionIntervalRef.current) {
            clearInterval(faceDetectionIntervalRef.current);
        }
    };
  }, [videoStream]);


  // ** Event Handlers **

  // Capture photo (used by both auto and manual capture)
  const capturePhoto = useCallback((): string | null => {
    if (!videoRef.current || !canvasRef.current) {
      console.error('Video or canvas ref not available for capture.');
      return null;
    }
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      console.error('Could not get canvas context.');
      return null;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg'); // Get data URL
  }, []);


  // Submit Attendance Data
   const submitAttendance = useCallback(async (photoDataUri: string, captureMethod: 'auto' | 'manual') => {
    if (!location || !address || !loggedInUserId || !employee) {
       toast({ title: 'Error', description: 'Missing required data (location, address, user ID, or employee data) for submission.', variant: 'destructive' });
       return;
    }

     setIsProcessing(true); // Indicate submission process
     setStatusMessage('Submitting attendance...');

    const attendanceData: AttendanceRecord = {
      employeeId: employee.employeeId, // Use the specific employee ID field from your Employee type
      phone: employee.phone, // Include phone number
      name: employee.name, // Include name
      timestamp: new Date(),
      latitude: location.lat,
      longitude: location.lon,
      address: address,
      photoDataUri: photoDataUri,
      captureMethod: captureMethod,
      shiftTiming: employee.shiftTiming, // Include shift timing
      workingLocation: employee.workingLocation, // Include working location
    };

    try {
       console.log("Submitting attendance:", attendanceData); // Log before sending
       await saveAttendance(attendanceData);
       toast({
            title: 'Attendance Marked Successfully!',
            description: `Time: ${attendanceData.timestamp.toLocaleTimeString()}`,
            className: "bg-green-100 dark:bg-green-900", // Success styling
       });
       setStatusMessage('Attendance Marked Successfully!');
       setError(null);

       // Optional: Redirect or show success message persistently
       // router.push('/success'); // Example redirect

    } catch (err) {
       console.error('Failed to save attendance:', err);
       setError('Failed to submit attendance. Please try again.');
       setStatusMessage('Error: Failed to submit attendance.');
       toast({
            title: 'Submission Failed',
            description: 'Could not save attendance record. Please try again.',
            variant: 'destructive',
       });
    } finally {
       setIsProcessing(false); // Re-enable interactions
       // Restart detection after cooldown (even on failure, allow retry)
       setCaptureCooldownActive(true);
       setTimeout(() => {
            setCaptureCooldownActive(false);
            setStatusMessage('Ready for next detection.');
            setDetectionProgress(0);
            consecutiveDetections.current = 0;
       }, CAPTURE_COOLDOWN);
    }
  }, [location, address, loggedInUserId, employee, toast, capturePhoto]); // Added capturePhoto, employee, toast


  // Auto capture handler
  const handleAutoCapture = useCallback(() => {
    if (captureCooldownActive || isProcessing) return; // Prevent rapid captures or during submission

     console.log("Attempting auto-capture...");
    setCaptureCooldownActive(true); // Activate cooldown immediately
     setStatusMessage('Capturing photo automatically...');
    setIsProcessing(true); // Show processing state during capture/submit

    // Stop detection during capture/submit
    if (faceDetectionIntervalRef.current) {
        clearInterval(faceDetectionIntervalRef.current);
        faceDetectionIntervalRef.current = null;
    }

    const photoData = capturePhoto();

    if (photoData) {
        submitAttendance(photoData, 'auto');
        // Cooldown and processing state are managed within submitAttendance's finally block
    } else {
        setError('Failed to capture photo automatically.');
        setStatusMessage('Error: Failed to capture photo.');
        toast({ title: 'Capture Error', description: 'Could not capture photo.', variant: 'destructive' });
        setIsProcessing(false); // Reset processing state on capture failure
        // Restart detection after a short delay to allow user to readjust
        setTimeout(() => {
            setCaptureCooldownActive(false); // Allow detection to restart
             setStatusMessage('Ready for detection.');
        }, 1500);
    }
  }, [captureCooldownActive, isProcessing, capturePhoto, submitAttendance, toast]);


  // Manual capture handler
  const handleManualCapture = useCallback(async () => {
    if (isProcessing || captureCooldownActive) return; // Prevent action if busy or in cooldown

    console.log("Manual capture initiated...");
    setIsCapturing(true); // Show loading on button
    setIsProcessing(true); // Show overall processing
    setStatusMessage('Capturing photo manually...');


    // Stop detection
    if (faceDetectionIntervalRef.current) {
        clearInterval(faceDetectionIntervalRef.current);
        faceDetectionIntervalRef.current = null;
    }


    const photoData = capturePhoto();


    if (photoData) {
        // Submit immediately after manual capture
        await submitAttendance(photoData, 'manual');
    } else {
        setError('Failed to capture photo manually.');
        setStatusMessage('Error: Failed to capture photo.');
        toast({ title: 'Capture Error', description: 'Could not capture photo.', variant: 'destructive' });
        setIsProcessing(false); // Reset processing on failure
        // Restart detection attempt after delay
         setCaptureCooldownActive(true);
         setTimeout(() => {
            setCaptureCooldownActive(false);
             setStatusMessage('Ready for detection.');
        }, CAPTURE_COOLDOWN);
    }
    setIsCapturing(false); // Reset button state (managed further in submitAttendance)
  }, [isProcessing, captureCooldownActive, capturePhoto, submitAttendance, toast]);


  // Logout handler
  const handleLogout = useCallback(() => {
    localStorage.removeItem('loggedInUser');
    toast({ title: 'Logged Out', description: 'You have been logged out.' });
    router.replace('/login');
  }, [router, toast]);


  // ** Render Logic **
  const renderStatusIcon = () => {
    if (isProcessing && !isCapturing) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
    if (error) return <XCircle className="h-5 w-5 text-destructive" />;
    if (statusMessage === 'Attendance Marked Successfully!') return <CheckCircle className="h-5 w-5 text-green-500" />;
    if (isFaceDetected) return <CheckCircle className="h-5 w-5 text-primary" />;
    return <Camera className="h-5 w-5 text-muted-foreground" />;
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-100 via-purple-100 to-pink-100 dark:from-gray-800 dark:via-gray-900 dark:to-black p-4">
      <Card className="w-full max-w-md shadow-xl relative overflow-hidden">
         {/* Optional decorative background element */}
         <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-indigo-600"></div>

        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Mark Attendance</CardTitle>
          {employee && <CardDescription>Welcome, {employee.name}!</CardDescription>}
           {loggedInUserId === 'admin' && <CardDescription className="text-red-500 font-bold">Admin View (Attendance not applicable)</CardDescription>}
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Video Feed and Canvas */}
          <div className="relative aspect-video bg-muted rounded-md overflow-hidden border">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted // Mute to avoid feedback loops if audio was enabled
              className="absolute top-0 left-0 w-full h-full object-cover"
              onPlay={() => console.log("Video playing...")} // Debug log
              />
            {/* Canvas for drawing detections (optional, keep hidden if not drawing) */}
            <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full opacity-75" />

            {/* Overlay for status messages */}
             {!modelsLoaded || isProcessing || error || !videoStream ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                  <div className="text-center text-white p-4">
                    {isProcessing ? <Loader2 className="h-8 w-8 animate-spin mb-2 mx-auto" /> : renderStatusIcon()}
                    <p className="text-sm font-medium">{statusMessage}</p>
                     {error && <p className="text-xs text-red-300 mt-1">{error}</p>}
                  </div>
                </div>
             ) : null}


             {/* Progress bar for detection confidence */}
              {modelsLoaded && videoStream && !isProcessing && !error && (
                   <div className="absolute bottom-2 left-2 right-2 px-2">
                     <Progress value={detectionProgress} className="w-full h-2" />
                      <p className="text-xs text-white text-center mt-1 bg-black/50 px-1 rounded">
                        {statusMessage} {isFaceDetected ? `(${detectionProgress}%)` : ''}
                      </p>
                   </div>
              )}
          </div>


           {/* Location and Address Display */}
          <div className="space-y-1 text-sm text-muted-foreground border-t pt-4">
             <div className="flex items-center space-x-2">
                <User className="h-4 w-4" />
                <span>ID: {employee?.employeeId ?? loggedInUserId ?? 'Loading...'}</span>
             </div>
             <div className="flex items-center space-x-2">
                <MapPin className="h-4 w-4" />
                <span>Location: {location ? `${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}` : 'Getting location...'}</span>
             </div>
             <div className="flex items-center space-x-2">
                 {/* Address Icon can be MapPin or a building icon if available */}
                <MapPin className="h-4 w-4" />
                <span>Address: {address || 'Getting address...'}</span>
             </div>
             <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4" />
                <span>Time: {new Date().toLocaleTimeString()}</span>
             </div>
             {employee && (
                 <>
                    <div className="flex items-center space-x-2">
                         {/* Icon for shift */}
                         <Clock className="h-4 w-4" />
                         <span>Shift: {employee.shiftTiming}</span>
                    </div>
                     <div className="flex items-center space-x-2">
                          {/* Icon for location */}
                         <MapPin className="h-4 w-4" />
                         <span>Work Location: {employee.workingLocation}</span>
                    </div>
                 </>
             )}
          </div>


           {/* Manual Capture Button */}
          <Button
            onClick={handleManualCapture}
            disabled={!modelsLoaded || !videoStream || isProcessing || captureCooldownActive || !location || !address || loggedInUserId === 'admin'} // Disable if admin
            className="w-full"
            aria-label="Mark Attendance Manually"
          >
            {isCapturing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Camera className="mr-2 h-4 w-4" />
            )}
            {isCapturing ? 'Capturing...' : 'Mark Attendance Manually'}
          </Button>

          {/* Logout Button */}
           <Button
                variant="outline"
                onClick={handleLogout}
                className="w-full"
                aria-label="Logout"
            >
                Logout
            </Button>

        </CardContent>
      </Card>

       {/* Hidden canvas for taking snapshots */}
       <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
    </div>
  );
};


export default AttendancePage;

// Helper function to get employee data (replace with actual implementation)
// async function getEmployeeById(userId: string): Promise<Employee | null> {
//   // This is a placeholder. Implement your actual API call or data fetching logic.
//   console.log(`Fetching employee data for ID: ${userId}`);
//   // Example using dummy data stored in localStorage for demo
//   const employees = JSON.parse(localStorage.getItem('employees') || '[]') as Employee[];
//   const employee = employees.find(emp => emp.phone === userId || emp.employeeId === userId); // Allow login by phone or ID
//   return employee || null;
// }
