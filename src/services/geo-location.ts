/**
 * Custom Error class for Geolocation errors.
 */
export class GeolocationError extends Error {
  code: number;

  constructor(message: string, code: number) {
    super(message);
    this.name = 'GeolocationError';
    this.code = code;
    // Set the prototype explicitly.
    Object.setPrototypeOf(this, GeolocationError.prototype);
  }
}

/**
 * Gets the current geographical coordinates of the device.
 * @returns A promise that resolves with the GeolocationCoordinates object or rejects with a GeolocationError.
 */
export const getCurrentPosition = (): Promise<GeolocationCoordinates> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new GeolocationError('Geolocation is not supported by this browser.', -1)); // Use a custom code for non-support
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve(position.coords);
      },
      (error) => {
        let message = '';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            message = 'User denied the request for Geolocation.';
            break;
          case error.POSITION_UNAVAILABLE:
            message = 'Location information is unavailable. Check GPS signal and network connection.';
            break;
          case error.TIMEOUT:
             // Provide a more user-friendly timeout message
             message = 'Could not get location in time. Check GPS signal and network connection, then try again.';
            break;
          default:
            message = 'An unknown error occurred while retrieving location.';
            break;
        }
        // Reject with the custom error, including the original code and a detailed message
        // The error originates here when the timeout occurs, but this is expected behavior.
        reject(new GeolocationError(`${message} (Code: ${error.code})`, error.code));
      },
      {
        enableHighAccuracy: true, // Request more accurate position
        // Increased timeout to 20 seconds (20000 milliseconds)
        // Adjust as needed based on testing and typical conditions
        timeout: 20000,
        maximumAge: 0, // Force a fresh location reading
      }
    );
  });
};

/**
 * Reverse geocodes latitude and longitude to get an address.
 * Uses the OpenStreetMap Nominatim API.
 * @param latitude The latitude coordinate.
 * @param longitude The longitude coordinate.
 * @returns A promise that resolves with the address string or rejects with an error.
 */
export const getAddressFromCoordinates = async (latitude: number, longitude: number): Promise<string> => {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`);
    if (!response.ok) {
      throw new Error(`Nominatim API request failed with status ${response.status}`);
    }
    const data = await response.json();
    if (data && data.display_name) {
      return data.display_name;
    } else {
      // Handle cases where Nominatim doesn't return a valid address
      console.warn('Nominatim response did not contain display_name:', data);
      return 'Address not found';
    }
  } catch (error) {
    console.error("Error fetching address from coordinates:", error);
    // Provide a generic error message if the fetch fails
    throw new Error("Could not retrieve address from coordinates.");
  }
};
