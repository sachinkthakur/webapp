
import type { NextPage } from 'next';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import * as faceapi from 'face-api.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast'; // Use the context hook
import { saveAttendance, getEmployeeById, Employee } from '@/services/attendance';
import { getCurrentPosition, getAddressFromCoordinates, GeolocationError } from '@/services/geo-location';
import { checkLoginStatus, logoutUser } from '@/services/auth'; // Auth utilities
import { Camera, MapPin, CheckCircle, XCircle, Loader2, LogOut, AlertTriangle } from 'lucide-react';
import Image from 'next/image'; // For background

// Constants
const FACEAPI_MODEL_URL = '/models';
const FACE_DETECTION_INTERVAL = 500; // ms
const FACE_MATCH_THRESHOLD = 0.5; // Stricter threshold
const CAPTURE_COOLDOWN = 5000; // 5 seconds cooldown after capture

const AttendancePage: NextPage = () => {
  const router = useRouter();
  const { toast } = useToast(); // Use the context hook

  // State variables
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [isVideoStreaming, setIsVideoStreaming] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Overall loading state
  const [isCapturing, setIsCapturing] = useState(false); // Specific capture/submit state
  const [detectionStatus, setDetectionStatus] = useState<'idle' | 'detecting' | 'detected' | 'no_face'>('idle');
  const [statusMessage, setStatusMessage] = useState<string>("Initializing...");
  const [progress, setProgress] = useState(0);
  const [captureCooldownActive, setCaptureCooldownActive] = useState(false);
  const [isClient, setIsClient] = useState(false); // Track client-side mount

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Set isClient on mount
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Check login status and load employee data
  useEffect(() => {
    if (isClient) { // Only run on client
      setStatusMessage("Checking login status...");
      const loggedInUserId = checkLoginStatus();
      if (!loggedInUserId || loggedInUserId.toLowerCase() === 'admin') {
        toast({ title: 'Unauthorized Access', description: 'Redirecting to login.', variant: 'destructive' });
        router.replace('/login');
      } else {
        fetchEmployeeData(loggedInUserId);
      }
    }
  }, [router, toast, isClient]); // Add isClient dependency

  // Load FaceAPI models
  useEffect(() => {
    if (isClient) { // Only run on client
        const loadModels = async () => {
          setStatusMessage("Loading recognition models...");
          try {
            await Promise.all([
              faceapi.nets.tinyFaceDetector.loadFromUri(FACEAPI_MODEL_URL),
              faceapi.nets.faceLandmark68Net.loadFromUri(FACEAPI_MODEL_URL),
              faceapi.nets.faceRecognitionNet.loadFromUri(FACEAPI_MODEL_URL),
              // faceapi.nets.faceExpressionNet.loadFromUri(FACEAPI_MODEL_URL) // Optional: if needed
            ]);
            setModelsLoaded(true);
            setStatusMessage("Models loaded successfully.");
            console.log('FaceAPI models loaded');
          } catch (err) {
            console.error('Error loading FaceAPI models:', err);
            setError("Failed to load face recognition models. Please refresh.");
            setStatusMessage("Error loading models.");
          }
        };
        loadModels();
    }
  }, [isClient]); // Add isClient dependency

  // Get Geolocation and Address
   const fetchLocationAndAddress = useCallback(async () => {
     if (!isClient) return; // Ensure client-side execution
     setStatusMessage("Getting location...");
     setProgress(25);
     try {
       const coords = await getCurrentPosition();
       setLocation({ latitude: coords.latitude, longitude: coords.longitude });
       setStatusMessage("Getting address...");
       setProgress(50);
       const addr = await getAddressFromCoordinates(coords.latitude, coords.longitude);
       setAddress(addr);
       setStatusMessage("Location and address acquired.");
       setProgress(75);
     } catch (err) {
       console.error('Geolocation/Address error:', err);
       let errMsg = "Could not get location or address.";
       if (err instanceof GeolocationError) {
          errMsg = err.message; // Use the specific message from GeolocationError
       } else if (err instanceof Error) {
           errMsg = err.message;
       }
       setError(errMsg);
       setLocation(null); // Reset location on error
       setAddress(null); // Reset address on error
       setStatusMessage("Error getting location.");
       setProgress(0);
     }
   }, [isClient]); // Add isClient dependency

   // Fetch employee data
    const fetchEmployeeData = useCallback(async (userId: string) => {
        if (!isClient) return; // Ensure client-side execution
        setStatusMessage("Fetching employee details...");
        try {
            const empData = await getEmployeeById(userId);
            if (empData) {
                setEmployee(empData);
                 setStatusMessage(`Welcome, ${empData.name}!`);
                 // Now fetch location after getting employee data
                 await fetchLocationAndAddress();
            } else {
                setError("Employee details not found. Please contact admin.");
                setStatusMessage("Error fetching employee data.");
                logoutUser(); // Log out if employee not found
                router.replace('/login');
            }
        } catch (err) {
            console.error('Failed to fetch employee data:', err);
            setError("Could not fetch employee data. Please try again.");
            setStatusMessage("Error fetching employee data.");
        } finally {
            setIsLoading(false); // Stop overall loading once employee data fetch attempt completes
        }
    }, [router, fetchLocationAndAddress, toast, isClient]); // Add isClient dependency

  // Start video stream
  const startVideo = useCallback(async () => {
    if (!isClient || !videoRef.current || isVideoStreaming) return; // Check client-side, ref, and streaming status
    setStatusMessage("Starting camera...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' }, // Prefer front camera
        audio: false,
      });
      videoRef.current.srcObject = stream;
      setIsVideoStreaming(true);
      setStatusMessage("Camera active. Position your face.");
      console.log('Video stream started');
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError('Could not access camera. Please ensure permissions are granted and refresh.');
      setStatusMessage("Camera access denied or failed.");
      setIsVideoStreaming(false);
    }
  }, [isClient, isVideoStreaming]); // Add dependencies


  // Handle video play event - Start face detection only when video is playing
  const handleVideoPlay = useCallback(() => {
    if (!isClient || !modelsLoaded || !videoRef.current || !canvasRef.current || intervalRef.current) {
      console.log("Conditions not met for starting face detection interval.");
      return; // Exit if not ready
    }

     console.log("Video playing, starting face detection interval.");
     setStatusMessage("Detecting face...");
     setDetectionStatus('detecting');

    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(async () => {
      if (videoRef.current && canvasRef.current && !isCapturing && !captureCooldownActive) {
        // Match video dimensions
        canvasRef.current.innerHTML = faceapi.createCanvasFromMedia(videoRef.current).outerHTML;
        const displaySize = {
          width: videoRef.current.videoWidth,
          height: videoRef.current.videoHeight,
        };
        faceapi.matchDimensions(canvasRef.current, displaySize);

        // Detect face
        const detections = await faceapi
          .detectAllFaces(videoRef.current, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks()
          .withFaceDescriptors();
          // .withFaceExpressions(); // Optional

        const resizedDetections = faceapi.resizeResults(detections, displaySize);

        // Clear previous drawings
        const context = canvasRef.current.getContext('2d');
        if (context) {
          context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }

        // Draw detections (optional, for debugging/visual feedback)
         // faceapi.draw.drawDetections(canvasRef.current, resizedDetections);
         // faceapi.draw.drawFaceLandmarks(canvasRef.current, resizedDetections);
         // faceapi.draw.drawFaceExpressions(canvasRef.current, resizedDetections);

        if (resizedDetections.length > 0) {
            if (detectionStatus !== 'detected') {
                setStatusMessage("Face detected. Hold still.");
                setDetectionStatus('detected');
            }
            // Basic check: Is face reasonably centered and large enough?
            const { detection } = resizedDetections[0];
            const box = detection.box;
            const centerX = box.x + box.width / 2;
            const centerY = box.y + box.height / 2;
            const videoCenterX = displaySize.width / 2;
            const videoCenterY = displaySize.height / 2;
            const sizeRatio = Math.min(box.width / displaySize.width, box.height / displaySize.height);

            // Example criteria: Center proximity and minimum size
            const isCentered = Math.abs(centerX - videoCenterX) < displaySize.width * 0.2; // Within 20% of center X
             // const isVerticallyCentered = Math.abs(centerY - videoCenterY) < displaySize.height * 0.2; // Within 20% of center Y
            const isLargeEnough = sizeRatio > 0.25; // Face occupies at least 25% of the smaller dimension

           if (isCentered && isLargeEnough) {
                console.log("Face detected and centered/large enough. Attempting capture.");
                 setStatusMessage("Face aligned. Capturing...");
                // Trigger automatic capture
                await handleAutoCapture();
            } else {
                 // Optional: Provide feedback if face is detected but not aligned
                 setStatusMessage("Face detected. Please center your face.");
            }

        } else {
             if (detectionStatus !== 'no_face') {
                 setStatusMessage("No face detected. Please position your face clearly in the frame.");
                 setDetectionStatus('no_face');
             }
        }
      } else {
         // console.log("Skipping detection cycle (capturing or cooldown active).");
      }
    }, FACE_DETECTION_INTERVAL);

     // Cleanup function for the interval
     return () => {
       if (intervalRef.current) {
         clearInterval(intervalRef.current);
         intervalRef.current = null;
          console.log("Face detection interval cleared.");
       }
     };

  }, [isClient, modelsLoaded, isCapturing, captureCooldownActive, detectionStatus]); // Add dependencies


  // Stop video stream and cleanup interval
  const stopVideo = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsVideoStreaming(false);
      console.log('Video stream stopped');
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
       console.log("Face detection interval cleared on stopVideo.");
    }
     setDetectionStatus('idle');
     setStatusMessage("Camera stopped.");
  }, []); // No dependencies needed


   // Effect to start video and location fetching when models are loaded and employee is set
   useEffect(() => {
     if (isClient && modelsLoaded && employee && !isLoading && !error) {
       startVideo();
       // Location is fetched within fetchEmployeeData now
     }

     // Cleanup video stream on component unmount
     return () => {
        if (isClient) {
            stopVideo();
        }
     };
   }, [isClient, modelsLoaded, employee, isLoading, startVideo, stopVideo, error]); // Add dependencies

   // Capture Photo Logic (used by both auto and manual capture)
   const capturePhoto = useCallback((): string | null => {
       if (videoRef.current) {
           const tempCanvas = document.createElement('canvas');
           tempCanvas.width = videoRef.current.videoWidth;
           tempCanvas.height = videoRef.current.videoHeight;
           const context = tempCanvas.getContext('2d');
           if (context) {
               context.drawImage(videoRef.current, 0, 0, tempCanvas.width, tempCanvas.height);
               const dataUri = tempCanvas.toDataURL('image/jpeg'); // Use JPEG for smaller size
               return dataUri;
           }
       }
       return null;
   }, []); // No dependencies needed


  // Submit Attendance Data
   const submitAttendance = useCallback(async (photoDataUri: string, captureMethod: 'auto' | 'manual') => {
       if (!employee || !location || !address) {
           toast({ title: 'Missing Information', description: 'Cannot submit attendance without employee details, location, or address.', variant: 'destructive' });
           return;
       }

       setIsCapturing(true); // Set capturing state
       setStatusMessage("Submitting attendance...");
       setProgress(90);

        const attendanceData = {
            employeeId: employee.employeeId,
            phone: employee.phone,
            name: employee.name,
            timestamp: new Date(),
            latitude: location.latitude,
            longitude: location.longitude,
            address: address,
            photoDataUri: photoDataUri,
            captureMethod: captureMethod,
            shiftTiming: employee.shiftTiming, // Get from employee record
            workingLocation: employee.workingLocation, // Get from employee record
            // inTime/outTime will be handled by saveAttendance
        };

       try {
           const { id, ...dataToSave } = attendanceData;
           await saveAttendance(dataToSave);

           toast({
               title: 'Attendance Marked Successfully!',
               description: `Time: ${attendanceData.timestamp.toLocaleTimeString()}, Location: ${attendanceData.address}`,
           });
            setStatusMessage("Attendance marked successfully!");
            setProgress(100);

           // Activate cooldown
            setCaptureCooldownActive(true);
            setTimeout(() => {
                 setCaptureCooldownActive(false);
                 setStatusMessage("Ready for next detection or manual capture.");
                 setDetectionStatus('idle'); // Reset detection status after cooldown
                 setProgress(0);
            }, CAPTURE_COOLDOWN);

       } catch (err) {
           console.error('Failed to save attendance:', err);
           toast({ title: 'Submission Failed', description: 'Could not save attendance record. Please try again.', variant: 'destructive' });
           setError("Failed to save attendance.");
           setStatusMessage("Submission failed. Please try again.");
           setProgress(0); // Reset progress on error
       } finally {
           setIsCapturing(false); // Reset capturing state
           // Don't reset status message immediately on failure, let user see the error
       }
   }, [employee, location, address, toast]); // Add dependencies

   // Auto Capture Handler
    const handleAutoCapture = useCallback(async () => {
        // Prevent multiple captures in quick succession
        if (isCapturing || captureCooldownActive) {
             // console.log("Skipping auto-capture: Already capturing or cooldown active.");
            return;
        }

        console.log("Attempting auto-capture...");
        const photo = capturePhoto();
        if (photo) {
            setStatusMessage("Photo captured automatically. Submitting...");
            await submitAttendance(photo, 'auto');
        } else {
             console.error("Auto-capture failed: Could not get photo data.");
             setStatusMessage("Auto-capture failed. Try manual capture.");
        }
    }, [isCapturing, captureCooldownActive, capturePhoto, submitAttendance]); // Add dependencies

    // Manual Capture Handler
    const handleManualCapture = useCallback(async () => {
        // Prevent capture if already processing, on cooldown, or camera not ready
        if (isCapturing || captureCooldownActive || !isVideoStreaming || !location || !address) {
            let reason = "Cannot capture yet.";
            if (isCapturing) reason = "Previous capture in progress.";
            else if (captureCooldownActive) reason = "Please wait before capturing again.";
            else if (!isVideoStreaming) reason = "Camera not ready.";
             else if (!location || !address) reason = "Location/Address not available.";
            toast({ title: 'Capture Unavailable', description: reason, variant: 'warning' });
            return;
        }

         console.log("Attempting manual capture...");
        const photo = capturePhoto();
        if (photo) {
             setStatusMessage("Photo captured manually. Submitting...");
            await submitAttendance(photo, 'manual');
        } else {
            console.error("Manual capture failed: Could not get photo data.");
            toast({ title: 'Capture Failed', description: 'Could not capture photo from camera.', variant: 'destructive' });
             setStatusMessage("Manual capture failed.");
        }
    }, [isCapturing, captureCooldownActive, isVideoStreaming, location, address, capturePhoto, submitAttendance, toast]); // Add dependencies

  // Logout handler
  const handleLogout = useCallback(() => {
    stopVideo(); // Stop camera and detection
    logoutUser(); // Clear session from auth service
    toast({ title: 'Logged Out', description: 'You have been successfully logged out.' });
    router.replace('/login'); // Redirect to login page
  }, [stopVideo, router, toast]); // Add dependencies

   // Render Loading State
   if (isLoading || !isClient) {
       return (
           <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-100 dark:from-gray-800 dark:via-gray-900 dark:to-black p-4">
                <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
                <p className="text-lg text-muted-foreground">{statusMessage}</p>
                {progress > 0 && progress < 100 && <Progress value={progress} className="w-1/2 mt-4" />}
           </div>
       );
   }

   // Render Error State
   if (error) {
       return (
           <div className="flex flex-col items-center justify-center min-h-screen bg-red-50 dark:bg-red-900/20 p-4">
               <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
               <h2 className="text-2xl font-semibold text-destructive mb-2">An Error Occurred</h2>
               <p className="text-center text-destructive/80 mb-6">{error}</p>
               <Button onClick={() => window.location.reload()} variant="destructive">
                   Retry / Refresh Page
               </Button>
                <Button onClick={handleLogout} variant="outline" className="mt-4">
                    Logout
                </Button>
           </div>
       );
   }

  // Render Main Attendance Page
  return (
    <div className="relative flex flex-col min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-100 dark:from-gray-800 dark:via-gray-900 dark:to-black p-4 md:p-6">
       {/* Background Image */}
       <Image
         // Replace with a relevant Indian truck photo URL if available
         src="https://picsum.photos/seed/logisticspattern/1920/1080" // Placeholder pattern
         alt="Background pattern"
         layout="fill"
         objectFit="cover"
         quality={50} // Lower quality for background pattern
         className="absolute inset-0 z-0 opacity-10 dark:opacity-5"
       />

       {/* Header */}
        <header className="relative z-10 mb-4 md:mb-6 flex justify-between items-center">
            <div className="flex flex-col">
                 <h1 className="text-2xl md:text-3xl font-bold text-primary">FieldTrack Attendance</h1>
                 <p className="text-sm text-muted-foreground">E Wheels and Logistics</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout}>
                 <LogOut className="mr-2 h-4 w-4" /> Logout
            </Button>
       </header>

       {/* Main Content */}
      <div className="relative z-10 flex-grow grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
         {/* Left Column: Camera and Status */}
        <Card className="shadow-lg overflow-hidden flex flex-col bg-card/90 backdrop-blur-sm dark:bg-card/80">
          <CardHeader>
            <CardTitle className="flex items-center">
                <Camera className="mr-2 h-5 w-5" /> Camera Feed
            </CardTitle>
            <CardDescription>
               {isVideoStreaming ? 'Position your face clearly in the frame.' : 'Camera initializing...'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-grow flex flex-col items-center justify-center p-2 md:p-4 relative aspect-video">
            {/* Video Feed */}
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline // Important for mobile browsers
              className={`w-full h-auto max-h-[60vh] rounded-md bg-black object-cover transform scale-x-[-1] ${!isVideoStreaming ? 'hidden' : ''}`} // Flip video horizontally
              onPlay={handleVideoPlay} // Start detection when video starts playing
              onError={(e) => {
                 console.error("Video error:", e);
                 setError("Camera feed error. Please refresh.");
                 setStatusMessage("Camera error.");
              }}
            />
             {/* Canvas for FaceAPI overlay (flipped horizontally to match video) */}
             <canvas
               ref={canvasRef}
               className="absolute top-0 left-0 w-full h-full transform scale-x-[-1]"
               style={{ maxHeight: 'inherit' }} // Ensure canvas doesn't exceed video height
             />
            {/* Placeholder/Loading state for video */}
             {!isVideoStreaming && (
               <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/50 rounded-md">
                 <Loader2 className="h-12 w-12 animate-spin text-primary mb-2" />
                 <p className="text-muted-foreground">Waiting for camera...</p>
               </div>
             )}
          </CardContent>
          <CardFooter className="p-3 md:p-4 border-t bg-muted/30">
             <div className="flex items-center justify-between w-full">
                <div className="flex items-center space-x-2">
                    {detectionStatus === 'detected' && <CheckCircle className="h-5 w-5 text-green-500" />}
                    {detectionStatus === 'no_face' && <XCircle className="h-5 w-5 text-destructive" />}
                    {detectionStatus === 'detecting' && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
                    <p className="text-sm text-muted-foreground flex-1 truncate" title={statusMessage}>{statusMessage}</p>
                </div>
                 {/* Manual Capture Button */}
                  <Button
                     onClick={handleManualCapture}
                     disabled={isCapturing || captureCooldownActive || !isVideoStreaming || !location || !address}
                     size="sm"
                  >
                     {isCapturing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
                     Mark Manually
                  </Button>
             </div>
             {(isCapturing || (progress > 0 && progress < 100)) && (
               <Progress value={progress} className="w-full mt-2 h-1.5" />
             )}
          </CardFooter>
        </Card>

        {/* Right Column: Employee Info and Location */}
        <Card className="shadow-lg flex flex-col bg-card/90 backdrop-blur-sm dark:bg-card/80">
          <CardHeader>
             <CardTitle>Employee Details</CardTitle>
             {employee ? (
               <CardDescription>Welcome, {employee.name}!</CardDescription>
             ) : (
                <CardDescription>Loading employee data...</CardDescription>
             )}
          </CardHeader>
          <CardContent className="flex-grow space-y-4 text-sm">
            {employee ? (
              <>
                <p><strong>Employee ID:</strong> {employee.employeeId}</p>
                <p><strong>Phone:</strong> {employee.phone}</p>
                 <p><strong>Shift:</strong> {employee.shiftTiming || 'N/A'}</p>
                 <p><strong>Work Location:</strong> {employee.workingLocation || 'N/A'}</p>
                 <hr className="my-4 border-border/50"/>
                 <div className="flex items-start space-x-3">
                    <MapPin className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="font-semibold">Current Location:</p>
                        {location ? (
                             <p className="text-muted-foreground">{`${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`}</p>
                        ) : (
                           <p className="text-muted-foreground italic">Getting location...</p>
                        )}
                        {address ? (
                             <p className="text-muted-foreground mt-1">{address}</p>
                        ) : (
                            location && <p className="text-muted-foreground italic mt-1">Fetching address...</p>
                        )}
                         {!location && !address && error && ( // Show location error here too
                            <p className="text-destructive italic mt-1">{error.includes("location") || error.includes("address") ? error : "Could not get location."}</p>
                         )}
                    </div>
                 </div>
              </>
            ) : (
               <div className="flex items-center justify-center h-full">
                 <Loader2 className="h-8 w-8 animate-spin text-primary" />
               </div>
            )}
          </CardContent>
            <CardFooter className="p-4 border-t bg-muted/30">
                <p className="text-xs text-muted-foreground">
                     {captureCooldownActive ? `Cooldown active...` : `Ready to mark attendance.`} Ensure location is accurate.
                </p>
            </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default AttendancePage;
