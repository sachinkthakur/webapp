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
             message = 'Could not get location in time. Check GPS signal and network connection, then try again.';
            break;
          default:
            message = 'An unknown error occurred while retrieving location.';
            break;
        }
        reject(new GeolocationError(`${message} (Code: ${error.code})`, error.code));
      },
      {
        enableHighAccuracy: true,
        timeout: 20000, // Increased timeout to 20 seconds
        maximumAge: 0,
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
  console.log(`[GeoService] Fetching address for Lat: ${latitude}, Lon: ${longitude}`);
  try {
    // IMPORTANT: As per Nominatim's usage policy, a valid User-Agent is required.
    // Replace 'YourAppName/1.0 (your-contact-email@example.com)' with your actual app name and a contact email.
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`, {
      headers: {
        'User-Agent': 'FieldTrackApp/1.0 (contact@ewheelslogistics.com)' // Example User-Agent
      }
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Could not read error response body.');
      console.error(`[GeoService] Nominatim API request failed. Status: ${response.status}. Response: ${errorText}`);
      throw new Error(`Address lookup failed: Server responded with status ${response.status}.`);
    }

    const data = await response.json();

    if (data && data.display_name) {
      console.log(`[GeoService] Address found: ${data.display_name}`);
      return data.display_name;
    } else {
      console.warn('[GeoService] Nominatim response did not contain display_name or data was unexpected:', data);
      throw new Error('Address data not found in API response. The location might be in an area with no known address (e.g., open water).');
    }
  } catch (error: any) {
    console.error("[GeoService] Error in getAddressFromCoordinates:", error);
    if (error.message && (error.message.startsWith('Address lookup failed:') || error.message.startsWith('Address data not found'))) {
        throw error; // Re-throw specific, informative errors
    }
    // Fallback for network errors or other unexpected issues
    throw new Error("Could not retrieve address. Please check your network connection and try refreshing the location.");
  }
};
