export const geocodeAddress = async (address) => {
    // Check if Google Maps API is loaded
    if (!window.google || !window.google.maps || !window.google.maps.Geocoder) {
        console.error("Google Maps API not loaded. Make sure the map component is mounted.");
        return null;
    }

    const geocoder = new window.google.maps.Geocoder();

    return new Promise((resolve) => {
        geocoder.geocode({ address: address }, (results, status) => {
            if (status === 'OK' && results && results.length > 0) {
                const location = results[0].geometry.location;
                // google.maps.LatLng object has functions lat() and lng()
                resolve({ lat: location.lat(), lng: location.lng() });
            } else {
                console.warn(`Geocoding failed for ${address}: ${status}`);
                // Resolve null to continue processing other items without crashing
                resolve(null);
            }
        });
    });
};

export const calculateDistance = (lat1, lon1, lat2, lon2) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;

    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI / 180; // φ, λ in radians
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const d = R * c; // in metres
    return d;
};
