'use client';

import type { NextPage } from 'next';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import * as faceapi from 'face-api.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { saveAttendance, getEmployeeById, Employee } from '@/services/attendance';
import { getCurrentPosition, getAddressFromCoordinates, GeolocationError } from '@/services/geo-location';
import { checkLoginStatus, logoutUser } from '@/services/auth';
import { Camera, MapPin, CheckCircle, XCircle, Loader2, LogOut, AlertTriangle } from 'lucide-react';
import Image from 'next/image';

// Constants
const FACEAPI_MODEL_URL = '/models';
const FACE_DETECTION_INTERVAL = 500; // ms
const CAPTURE_COOLDOWN = 5000; // 5 seconds cooldown after capture

const AttendancePage: NextPage = () => {
  const router = useRouter();
  const { toast } = useToast();

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
  const [isClient, setIsClient] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const fetchLocationAndAddress = useCallback(async () => {
    if (!isClient) return;
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
         errMsg = err.message;
      } else if (err instanceof Error) {
          errMsg = err.message;
      }
      setError(errMsg);
      setLocation(null);
      setAddress(null);
      setStatusMessage("Error getting location.");
      setProgress(0);
      toast({ title: 'Location Error', description: errMsg, variant: 'destructive'});
    }
  }, [isClient, toast]);

  const fetchEmployeeData = useCallback(async (userId: string) => {
    if (!isClient) return;
    setIsLoading(true); 
    setStatusMessage("Fetching employee details...");
    try {
        const empData = await getEmployeeById(userId);
        if (empData) {
            setEmployee(empData);
             setStatusMessage(`Welcome, ${empData.name}! Preparing camera...`);
             fetchLocationAndAddress();
        } else {
            setError("Employee details not found. Please contact admin.");
            setStatusMessage("Error fetching employee data.");
            toast({ title: 'Error', description: 'Employee details not found.', variant: 'destructive' });
            logoutUser();
            router.replace('/login');
        }
    } catch (err) {
        console.error('Failed to fetch employee data:', err);
        setError("Could not fetch employee data. Please try again.");
        setStatusMessage("Error fetching employee data.");
        toast({ title: 'Error', description: 'Could not fetch employee data.', variant: 'destructive' });
    } finally {
        setIsLoading(false); 
    }
  }, [router, toast, isClient, fetchLocationAndAddress]);


  useEffect(() => {
    if (isClient) {
      setStatusMessage("Checking login status...");
      const loggedInUserId = checkLoginStatus(); 

      if (!loggedInUserId || typeof loggedInUserId !== 'string') { 
        toast({ title: 'Unauthorized Access', description: 'Redirecting to login.', variant: 'destructive' });
        logoutUser();
        router.replace('/login');
      } else if (loggedInUserId.toLowerCase() === 'admin') {
        toast({ title: 'Unauthorized Access', description: 'Admin cannot access employee page. Redirecting to login.', variant: 'destructive' });
        logoutUser();
        router.replace('/login');
      } else {
        fetchEmployeeData(loggedInUserId);
      }
    }
  }, [router, toast, isClient, fetchEmployeeData]);


  useEffect(() => {
    if (isClient) {
        const loadModels = async () => {
          setStatusMessage("Loading recognition models...");
          try {
            await Promise.all([
              faceapi.nets.tinyFaceDetector.loadFromUri(FACEAPI_MODEL_URL),
              faceapi.nets.faceLandmark68Net.loadFromUri(FACEAPI_MODEL_URL),
              faceapi.nets.faceRecognitionNet.loadFromUri(FACEAPI_MODEL_URL),
            ]);
            setModelsLoaded(true);
            setStatusMessage("Models loaded successfully.");
            console.log('FaceAPI models loaded');
          } catch (err: any) {
            console.error('Error loading FaceAPI models:', err);
            if (err.message) {
              console.error('FaceAPI model loading error message:', err.message);
            }
            if (err.stack) {
              console.error('FaceAPI model loading stack:', err.stack);
            }
            setError("Failed to load face recognition models. Please ensure model files are in /public/models and refresh. Check browser console for details.");
            setStatusMessage("Error loading models. See console.");
            toast({
              title: 'Model Loading Error',
              description: 'Could not load face recognition models. Ensure model files are present and refresh.',
              variant: 'destructive'
            });
          }
        };
        loadModels();
    }
  }, [isClient, toast]);


  const startVideo = useCallback(async () => {
    if (!isClient || !videoRef.current || isVideoStreaming) return;
    setStatusMessage("Starting camera...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsVideoStreaming(true);
      setStatusMessage("Camera active. Position your face.");
      console.log('Video stream started');
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError('Could not access camera. Please ensure permissions are granted and refresh.');
      setStatusMessage("Camera access denied or failed.");
      setIsVideoStreaming(false);
    }
  }, [isClient, isVideoStreaming]);


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
  }, []);


   useEffect(() => {
     if (isClient && modelsLoaded && employee && !isLoading && !error && !isVideoStreaming) {
       startVideo();
     }

     return () => {
        if (isClient) {
            stopVideo();
        }
     };
   }, [isClient, modelsLoaded, employee, isLoading, error, startVideo, stopVideo, isVideoStreaming]);


   const capturePhoto = useCallback((): string | null => {
       if (videoRef.current && videoRef.current.readyState >= videoRef.current.HAVE_ENOUGH_DATA) {
           const tempCanvas = document.createElement('canvas');
           tempCanvas.width = videoRef.current.videoWidth;
           tempCanvas.height = videoRef.current.videoHeight;
           const context = tempCanvas.getContext('2d');
           if (context) {
               context.translate(tempCanvas.width, 0);
               context.scale(-1, 1);
               context.drawImage(videoRef.current, 0, 0, tempCanvas.width, tempCanvas.height);
               const dataUri = tempCanvas.toDataURL('image/jpeg', 0.9);
               return dataUri;
           }
       }
       console.warn("CapturePhoto: Video stream not ready or canvas context unavailable.");
       return null;
   }, []);


   const submitAttendance = useCallback(async (photoDataUri: string, captureMethod: 'auto' | 'manual') => {
       if (!employee || !location || !address) {
           toast({ title: 'Missing Information', description: 'Cannot submit attendance without employee details, location, or address.', variant: 'destructive' });
           setIsCapturing(false);
           return;
       }

       setIsCapturing(true);
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
            shiftTiming: employee.shiftTiming,
            workingLocation: employee.workingLocation,
        };

       try {
           await saveAttendance(attendanceData);

           toast({
               title: 'Attendance Marked Successfully!',
               description: `Time: ${attendanceData.timestamp.toLocaleTimeString()}, Location: ${attendanceData.address}`,
           });
            setStatusMessage("Attendance marked successfully!");
            setProgress(100);

            setCaptureCooldownActive(true);

            setTimeout(() => {
                 setCaptureCooldownActive(false);
                 setStatusMessage("Ready for next detection or manual capture.");
                 setDetectionStatus('idle');
                 setProgress(0);
            }, CAPTURE_COOLDOWN);

       } catch (err) {
           console.error('Failed to save attendance:', err);
           let errMsg = "Could not save attendance record. Please try again.";
           if (err instanceof Error) errMsg = err.message;
           toast({ title: 'Submission Failed', description: errMsg, variant: 'destructive' });
           setError("Failed to save attendance.");
           setStatusMessage("Submission failed. Please try again.");
           setProgress(0);
       } finally {
           setIsCapturing(false);
       }
   }, [employee, location, address, toast]);

    const handleAutoCapture = useCallback(async () => {
        if (isCapturing || captureCooldownActive || !isVideoStreaming) {
            console.log("Auto-capture skipped:", {isCapturing, captureCooldownActive, isVideoStreaming});
            return;
        }

        console.log("Attempting auto-capture...");
        const photo = capturePhoto();
        if (photo) {
            await submitAttendance(photo, 'auto');
        } else {
             console.error("Auto-capture failed: Could not get photo data.");
             setStatusMessage("Auto-capture failed. Photo could not be taken.");
        }
    }, [isCapturing, captureCooldownActive, isVideoStreaming, capturePhoto, submitAttendance]);

  const handleVideoPlay = useCallback(() => {
    if (!isClient || !modelsLoaded || !videoRef.current || !canvasRef.current || isCapturing || captureCooldownActive) {
      console.log("Conditions not met for starting face detection interval or capture active.");
      return;
    }

     console.log("Video playing, starting face detection interval.");
     setStatusMessage("Detecting face...");
     setDetectionStatus('detecting');

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(async () => {
      if (videoRef.current && videoRef.current.videoWidth > 0 && canvasRef.current && !isCapturing && !captureCooldownActive) {
        canvasRef.current.innerHTML = "";
        const displaySize = {
          width: videoRef.current.videoWidth,
          height: videoRef.current.videoHeight,
        };
        faceapi.matchDimensions(canvasRef.current, displaySize);

        const detections = await faceapi
          .detectAllFaces(videoRef.current, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 }))
          .withFaceLandmarks()

        const resizedDetections = faceapi.resizeResults(detections, displaySize);

        if (resizedDetections.length > 0) {
            if (detectionStatus !== 'detected') {
                setStatusMessage("Face detected. Hold still.");
                setDetectionStatus('detected');
            }
            const { detection } = resizedDetections[0];
            const box = detection.box;
            const centerX = box.x + box.width / 2;
            const videoCenterX = displaySize.width / 2;
            const sizeRatio = Math.min(box.width / displaySize.width, box.height / displaySize.height);

            const isCentered = Math.abs(centerX - videoCenterX) < displaySize.width * 0.25;
            const isLargeEnough = sizeRatio > 0.20;

           if (isCentered && isLargeEnough) {
                setStatusMessage("Face aligned. Capturing...");
                await handleAutoCapture();
            } else if (!isLargeEnough) {
                 setStatusMessage("Please move closer to the camera.");
            } else if (!isCentered) {
                 setStatusMessage("Please center your face in the frame.");
            }


        } else {
             if (detectionStatus !== 'no_face') {
                 setStatusMessage("No face detected. Position your face clearly.");
                 setDetectionStatus('no_face');
             }
        }
      }
    }, FACE_DETECTION_INTERVAL);

     return () => {
       if (intervalRef.current) {
         clearInterval(intervalRef.current);
         intervalRef.current = null;
         console.log("Face detection interval cleared due to handleVideoPlay re-creation or unmount.");
       }
     };

  }, [isClient, modelsLoaded, isCapturing, captureCooldownActive, detectionStatus, handleAutoCapture]);


    const handleManualCapture = useCallback(async () => {
        if (isCapturing || captureCooldownActive || !isVideoStreaming || !location || !address) {
            let reason = "Cannot capture yet.";
            if (isCapturing) reason = "Previous capture in progress.";
            else if (captureCooldownActive) reason = "Please wait before capturing again.";
            else if (!isVideoStreaming) reason = "Camera not ready.";
             else if (!location || !address) reason = "Location/Address not available. Please wait or enable location services.";
            toast({ title: 'Capture Unavailable', description: reason, variant: 'warning' });
            return;
        }

         console.log("Attempting manual capture...");
        const photo = capturePhoto();
        if (photo) {
            await submitAttendance(photo, 'manual');
        } else {
            console.error("Manual capture failed: Could not get photo data.");
            toast({ title: 'Capture Failed', description: 'Could not capture photo from camera. Ensure camera is active.', variant: 'destructive' });
             setStatusMessage("Manual capture failed.");
        }
    }, [isCapturing, captureCooldownActive, isVideoStreaming, location, address, capturePhoto, submitAttendance, toast]);

  const handleLogout = useCallback(() => {
    stopVideo();
    logoutUser();
    toast({ title: 'Logged Out', description: 'You have been successfully logged out.' });
    router.replace('/login');
  }, [stopVideo, router, toast]);

   if (isLoading || !isClient) {
       return (
           <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-100 dark:from-gray-800 dark:via-gray-900 dark:to-black p-4">
                <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
                <p className="text-lg text-muted-foreground">{statusMessage}</p>
                {isLoading && progress > 0 && progress < 100 && <Progress value={progress} className="w-1/2 mt-4" />}
           </div>
       );
   }

   if (error && !isLoading) {
       return (
           <div className="flex flex-col items-center justify-center min-h-screen bg-red-50 dark:bg-red-900/20 p-4">
               <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
               <h2 className="text-2xl font-semibold text-destructive mb-2">An Error Occurred</h2>
               <p className="text-center text-destructive/80 mb-6 max-w-md">{error}</p>
               <Button onClick={() => { setError(null); setIsLoading(true); if (isClient) { const uid = checkLoginStatus(); if(uid && typeof uid === 'string' && uid.toLowerCase() !== 'admin') fetchEmployeeData(uid); else { logoutUser(); router.replace('/login');} } }} variant="destructive" className="mb-2">
                   Try Again
               </Button>
                <Button onClick={handleLogout} variant="outline">
                    Logout
                </Button>
           </div>
       );
   }

  return (
    <div className="relative flex flex-col min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-100 dark:from-gray-800 dark:via-gray-900 dark:to-black p-4 md:p-6 overflow-hidden">
      <Image
        data-ai-hint="background pattern"
        src="https://picsum.photos/seed/logisticspattern/1920/1080"
        alt="Background pattern"
        fill
        style={{objectFit:"cover"}}
        quality={50}
        className="absolute inset-0 z-0 opacity-10 dark:opacity-5"
      />

        <header className="relative z-10 mb-4 md:mb-6 flex justify-between items-center">
            <div className="flex flex-col">
                 <h1 className="text-2xl md:text-3xl font-bold text-primary">FieldTrack Attendance</h1>
                 <p className="text-sm text-muted-foreground">E Wheels and Logistics</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout}>
                 <LogOut className="mr-2 h-4 w-4" /> Logout
            </Button>
       </header>

      <div className="relative z-10 flex-grow grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <Card className="shadow-xl overflow-hidden flex flex-col bg-card/90 backdrop-blur-md dark:bg-card/85 border border-border/60 rounded-xl">
          <CardHeader>
            <CardTitle className="flex items-center">
                <Camera className="mr-2 h-5 w-5 text-primary" /> Camera Feed
            </CardTitle>
            <CardDescription>
               {isVideoStreaming ? 'Align your face. Auto-capture is active.' : (modelsLoaded ? 'Initializing camera...' : 'Loading face models...')}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-grow flex flex-col items-center justify-center p-2 md:p-4 relative aspect-video bg-muted/20 dark:bg-muted/10 rounded-lg">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={`w-full h-auto max-h-[60vh] rounded-md bg-black object-contain transform scale-x-[-1] shadow-inner transition-opacity duration-300 ${!isVideoStreaming || !modelsLoaded ? 'opacity-0' : 'opacity-100'}`}
              onPlay={handleVideoPlay}
              onError={(e) => {
                 console.error("Video error:", e);
                 setError("Camera feed error. Please refresh or check permissions.");
                 setStatusMessage("Camera error.");
              }}
              width={640}
              height={480}
            />
             <canvas
               ref={canvasRef}
               className="absolute top-0 left-0 w-full h-full transform scale-x-[-1]"
               style={{ maxHeight: 'inherit', objectFit: 'contain' }}
             />
             {(!isVideoStreaming || !modelsLoaded) && !error && (
               <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/50 dark:bg-muted/30 rounded-md p-4 text-center">
                 <Loader2 className="h-12 w-12 animate-spin text-primary mb-3" />
                 <p className="text-muted-foreground text-sm">{statusMessage}</p>
               </div>
             )}
             {error && (error.includes("camera") || error.includes("model")) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-destructive/10 dark:bg-destructive/20 rounded-md p-4 text-center">
                    <AlertTriangle className="h-10 w-10 text-destructive mb-2"/>
                    <p className="text-destructive text-sm">{error.startsWith("Failed to load face recognition models") ? error : "Camera permission or model loading issue."}</p>
                </div>
             )}
          </CardContent>
          <CardFooter className="p-3 md:p-4 border-t bg-muted/40 dark:bg-muted/25 rounded-b-xl">
             <div className="flex items-center justify-between w-full gap-2">
                <div className="flex items-center space-x-2 overflow-hidden">
                    {isCapturing && <Loader2 className="h-5 w-5 animate-spin text-primary flex-shrink-0" />}
                    {!isCapturing && detectionStatus === 'detected' && <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />}
                    {!isCapturing && detectionStatus === 'no_face' && <XCircle className="h-5 w-5 text-destructive flex-shrink-0" />}
                    {!isCapturing && detectionStatus === 'detecting' && <Loader2 className="h-5 w-5 animate-spin text-primary flex-shrink-0" />}
                    <p className="text-xs sm:text-sm text-muted-foreground flex-1 truncate" title={statusMessage}>{statusMessage}</p>
                </div>
                  <Button
                     onClick={handleManualCapture}
                     disabled={isCapturing || captureCooldownActive || !isVideoStreaming || !location || !address || !!error || !modelsLoaded}
                     size="sm"
                     className="shadow-md flex-shrink-0 px-3 py-1.5 sm:px-4 sm:py-2"
                     aria-label="Mark attendance manually"
                  >
                     {isCapturing && captureCooldownActive ? <Loader2 className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4 animate-spin" /> : <Camera className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />}
                     Manual
                  </Button>
             </div>
             {(isCapturing || (isLoading && progress > 0 && progress < 100)) && (
               <Progress value={isCapturing ? progress : (isLoading ? progress : 0)} className="w-full mt-2 h-1.5" />
             )}
          </CardFooter>
        </Card>

        <Card className="shadow-xl flex flex-col bg-card/90 backdrop-blur-md dark:bg-card/85 border border-border/60 rounded-xl">
          <CardHeader>
             <CardTitle className="text-primary">Employee Details</CardTitle>
             {employee ? (
               <CardDescription>Welcome, {employee.name}! Your attendance will be marked for E Wheels and Logistics.</CardDescription>
             ) : (
                <CardDescription>Loading your details...</CardDescription>
             )}
          </CardHeader>
          <CardContent className="flex-grow space-y-3 sm:space-y-4 text-sm p-4 md:p-6">
            {employee ? (
              <>
                <div className="flex justify-between"><span><strong>ID:</strong> {employee.employeeId}</span> <span><strong>Phone:</strong> {employee.phone}</span></div>
                <p><strong>Shift:</strong> {employee.shiftTiming || 'N/A'}</p>
                <p><strong>Work Site:</strong> {employee.workingLocation || 'N/A'}</p>
                 <hr className="my-3 sm:my-4 border-border/50"/>
                 <div className="flex items-start space-x-3">
                    <MapPin className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="font-semibold text-foreground">Current Location:</p>
                        {location && address ? (
                            <>
                             <p className="text-muted-foreground text-xs sm:text-sm">{`${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`}</p>
                             <p className="text-muted-foreground text-xs sm:text-sm mt-1">{address}</p>
                            </>
                        ) : (
                           <div className="flex items-center text-muted-foreground italic mt-1">
                               <Loader2 className="h-4 w-4 animate-spin mr-2"/>
                               <span>{location ? "Fetching address..." : "Acquiring location..."}</span>
                           </div>
                        )}
                         {error && (error.includes("location") || error.includes("address")) && !error.includes("model") && !error.includes("camera") && (
                            <p className="text-destructive italic text-xs sm:text-sm mt-1">{error}</p>
                         )}
                    </div>
                 </div>
              </>
            ) : (
               !error &&
               <div className="flex items-center justify-center h-full">
                 <Loader2 className="h-8 w-8 animate-spin text-primary" />
                 <p className="ml-2 text-muted-foreground">Loading details...</p>
               </div>
            )}
            {error && !employee && !error.includes("model") && !error.includes("camera") && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                    <AlertTriangle className="h-8 w-8 text-destructive mb-2"/>
                    <p className="text-destructive text-sm max-w-md">{error}</p>
                </div>
            )}
          </CardContent>
            <CardFooter className="p-3 md:p-4 border-t bg-muted/40 dark:bg-muted/25 rounded-b-xl">
                <p className="text-xs text-muted-foreground text-center w-full">
                     {captureCooldownActive ? `Cooldown: Mark again in ${CAPTURE_COOLDOWN/1000}s.` : (isCapturing ? "Processing..." : "Ensure location is accurate. Auto-capture is on.")}
                </p>
            </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default AttendancePage;
