import React, { useMemo, useState } from 'react';
import { GoogleMap, useJsApiLoader, Marker, Polyline, InfoWindow } from '@react-google-maps/api';
import { clsx } from 'clsx';
import { MapPin, Navigation, Calendar } from 'lucide-react';

const containerStyle = {
    width: '100%',
    height: '100%',
    backgroundColor: '#18181b' // zinc-900
};

// Dark Mode Map Style
const mapStyles = [
    { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
    {
        featureType: "administrative.locality",
        elementType: "labels.text.fill",
        stylers: [{ color: "#d59563" }],
    },
    {
        featureType: "poi",
        elementType: "labels.text.fill",
        stylers: [{ color: "#d59563" }],
    },
    {
        featureType: "poi.park",
        elementType: "geometry",
        stylers: [{ color: "#263c3f" }],
    },
    {
        featureType: "poi.park",
        elementType: "labels.text.fill",
        stylers: [{ color: "#6b9a76" }],
    },
    {
        featureType: "road",
        elementType: "geometry",
        stylers: [{ color: "#38414e" }],
    },
    {
        featureType: "road",
        elementType: "geometry.stroke",
        stylers: [{ color: "#212a37" }],
    },
    {
        featureType: "road",
        elementType: "labels.text.fill",
        stylers: [{ color: "#9ca5b3" }],
    },
    {
        featureType: "road.highway",
        elementType: "geometry",
        stylers: [{ color: "#746855" }],
    },
    {
        featureType: "road.highway",
        elementType: "geometry.stroke",
        stylers: [{ color: "#1f2835" }],
    },
    {
        featureType: "road.highway",
        elementType: "labels.text.fill",
        stylers: [{ color: "#f3d19c" }],
    },
    {
        featureType: "water",
        elementType: "geometry",
        stylers: [{ color: "#17263c" }],
    },
    {
        featureType: "water",
        elementType: "labels.text.fill",
        stylers: [{ color: "#515c6d" }],
    },
    {
        featureType: "water",
        elementType: "labels.text.stroke",
        stylers: [{ color: "#17263c" }],
    },
];

const center = { lat: -23.55052, lng: -46.633309 };

const options = {
    zoomControl: true,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    styles: mapStyles,
    disableDefaultUI: false,
};

function MapViewer({ points }) {
    const { isLoaded, loadError } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_KEY || ''
    });

    React.useEffect(() => {
        if (loadError) {
            console.error("GOOGLE MAPS LOAD ERROR:", loadError);
        }
        console.log("Checking Google Maps Key:", import.meta.env.VITE_GOOGLE_MAPS_KEY ? "Presente" : "AUSENTE");
    }, [loadError]);

    const [selectedPoint, setSelectedPoint] = useState(null);

    const mapPoints = useMemo(() => {
        const validPoints = points.filter(p => p.solides.coords || p.storeLocation);

        // Jitter counters to prevent identical markers from perfectly overlapping
        const solidesCounts = {};
        const storeCounts = {};

        return validPoints.map(pt => {
            let processedPt = { ...pt };

            // 1. Process and Jitter Sólides Coords
            if (pt.solides?.coords) {
                const lat = Number(pt.solides.coords.lat);
                const lng = Number(pt.solides.coords.lng);

                if (Number.isFinite(lat) && Number.isFinite(lng)) {
                    const key = `${lat.toFixed(5)}_${lng.toFixed(5)}`;
                    solidesCounts[key] = (solidesCounts[key] || 0) + 1;

                    if (solidesCounts[key] > 1) {
                        const offset = (solidesCounts[key] - 1) * 0.00005;
                        processedPt.solides = {
                            ...pt.solides,
                            coords: { lat: lat + offset, lng: lng - offset }
                        };
                    }
                }
            }

            // 2. Identify Effective Store Coords
            const dbLat = Number(pt.storeLocation?.latitude);
            const hasDbCoords = pt.storeLocation && Number.isFinite(dbLat) && dbLat !== 0;
            const hasCsvCoords = pt.umovme?.coords && Number.isFinite(pt.umovme.coords.lat);

            let storeLat = null;
            let storeLng = null;

            if (hasDbCoords) {
                storeLat = Number(pt.storeLocation.latitude);
                storeLng = Number(pt.storeLocation.longitude);
            } else if (hasCsvCoords) {
                storeLat = pt.umovme.coords.lat;
                storeLng = pt.umovme.coords.lng;
            }

            // 3. Jitter Store Coords
            if (storeLat !== null && storeLng !== null && Number.isFinite(storeLat) && Number.isFinite(storeLng)) {
                const key = `${storeLat.toFixed(5)}_${storeLng.toFixed(5)}`;
                storeCounts[key] = (storeCounts[key] || 0) + 1;

                if (storeCounts[key] > 1) {
                    const offset = (storeCounts[key] - 1) * 0.00004; // Slightly different angle
                    storeLat = storeLat - offset;
                    storeLng = storeLng + offset;
                }

                processedPt.effectiveStoreCoords = { lat: storeLat, lng: storeLng };
            }

            return processedPt;
        });
    }, [points]);

    const [map, setMap] = React.useState(null)

    const onLoad = React.useCallback(function callback(map) {
        setMap(map)
        if (mapPoints.length > 0) {
            const bounds = new window.google.maps.LatLngBounds();
            let hasValidPoints = false;

            mapPoints.forEach(pt => {
                if (pt.effectiveStoreCoords) {
                    const { lat, lng } = pt.effectiveStoreCoords;
                    if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0) {
                        bounds.extend({ lat, lng });
                        hasValidPoints = true;
                    }
                }
                if (pt.solides?.coords) {
                    const lat = Number(pt.solides.coords.lat);
                    const lng = Number(pt.solides.coords.lng);
                    if (Number.isFinite(lat) && Number.isFinite(lng)) {
                        bounds.extend({ lat, lng });
                        hasValidPoints = true;
                    }
                }
            });

            if (hasValidPoints) {
                map.fitBounds(bounds);
            }
        }
    }, [mapPoints])

    const onUnmount = React.useCallback(function callback(map) {
        setMap(null)
    }, [])

    if (!isLoaded) return (
        <div className="h-full w-full bg-zinc-900 animate-pulse flex items-center justify-center border border-zinc-800">
            <span className="text-zinc-600 font-mono text-xs animate-pulse">LOADING MAP MODULE...</span>
        </div>
    );

    return (
        <div className="h-[600px] w-full border border-zinc-800 bg-zinc-900 relative group">
            <GoogleMap
                mapContainerStyle={containerStyle}
                center={center}
                zoom={10}
                onLoad={onLoad}
                onUnmount={onUnmount}
                options={options}
            >
                {mapPoints.map((pt, idx) => {
                    const storeLat = pt.effectiveStoreCoords?.lat;
                    const storeLng = pt.effectiveStoreCoords?.lng;

                    const solidesLat = Number(pt.solides.coords?.lat);
                    const solidesLng = Number(pt.solides.coords?.lng);

                    const validStore = Number.isFinite(storeLat) && Number.isFinite(storeLng) && storeLat !== 0;
                    const validSolides = Number.isFinite(solidesLat) && Number.isFinite(solidesLng);
                    const validHome = pt.consultantHome && Number.isFinite(Number(pt.consultantHome.lat)) && Number.isFinite(Number(pt.consultantHome.lng));

                    return (
                        <React.Fragment key={idx}>
                            {validStore && (
                                <Marker
                                    position={{ lat: storeLat, lng: storeLng }}
                                    icon={{
                                        path: window.google.maps.SymbolPath.CIRCLE,
                                        scale: 6,
                                        fillColor: '#10b981', // emerald-500
                                        fillOpacity: 1,
                                        strokeWeight: 1,
                                        strokeColor: '#000000',
                                    }}
                                    onClick={() => setSelectedPoint({ ...pt, type: 'store' })}
                                />
                            )}

                            {validSolides && (
                                <Marker
                                    position={{ lat: solidesLat, lng: solidesLng }}
                                    icon={{
                                        path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                                        scale: 5,
                                        fillColor: pt.customColor || (validHome ? (pt.status === 'TRAVEL_ERROR' ? '#f97316' : '#a855f7') : '#ef4444'), // orange if error, purple if ok
                                        fillOpacity: 1,
                                        strokeWeight: 1,
                                        strokeColor: '#000000',
                                    }}
                                    onClick={() => setSelectedPoint({ ...pt, type: 'checkin' })}
                                />
                            )}

                            {validHome && (
                                <Marker
                                    position={{ lat: Number(pt.consultantHome.lat), lng: Number(pt.consultantHome.lng) }}
                                    label={{ text: "H", color: "white", fontSize: "10px", fontWeight: "bold" }}
                                    icon={{
                                        path: window.google.maps.SymbolPath.CIRCLE,
                                        scale: 8,
                                        fillColor: '#8b5cf6', // violet-500
                                        fillOpacity: 1,
                                        strokeWeight: 2,
                                        strokeColor: '#ffffff',
                                    }}
                                    onClick={() => setSelectedPoint({ ...pt, type: 'home' })}
                                />
                            )}

                            {/* Line: Store -> Check-in */}
                            {validStore && validSolides && !validHome && (
                                <Polyline
                                    path={[
                                        { lat: storeLat, lng: storeLng },
                                        { lat: solidesLat, lng: solidesLng }
                                    ]}
                                    options={{
                                        strokeColor: pt.customLineColor || (pt.distance > 500 ? '#ef4444' : '#10b981'), // Use custom color if provided
                                        strokeOpacity: 0.6,
                                        strokeWeight: 2,
                                        geodesic: true,
                                    }}
                                />
                            )}

                            {/* Line: Check-in -> Home (Travel Mode) */}
                            {validSolides && validHome && (
                                <Polyline
                                    path={[
                                        { lat: solidesLat, lng: solidesLng },
                                        { lat: Number(pt.consultantHome.lat), lng: Number(pt.consultantHome.lng) }
                                    ]}
                                    options={{
                                        strokeColor: pt.status === 'TRAVEL_ERROR' ? '#f97316' : '#a855f7', // orange or purple
                                        strokeOpacity: 0.8,
                                        strokeWeight: 2,
                                        geodesic: true,
                                    }}
                                />
                            )}

                            {/* Line: Store -> Home (Context) */}
                            {validStore && validHome && (
                                <Polyline
                                    path={[
                                        { lat: storeLat, lng: storeLng },
                                        { lat: Number(pt.consultantHome.lat), lng: Number(pt.consultantHome.lng) }
                                    ]}
                                    options={{
                                        strokeColor: '#71717a', // zinc-500
                                        strokeOpacity: 0.4,
                                        strokeWeight: 1,
                                        geodesic: true,
                                        icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 2 }, offset: '0', repeat: '10px' }], // Dashed
                                    }}
                                />
                            )}

                        </React.Fragment>
                    )
                })}

                {selectedPoint && (
                    <InfoWindow
                        position={
                            selectedPoint.type === 'store'
                                ? { lat: selectedPoint.effectiveStoreCoords?.lat, lng: selectedPoint.effectiveStoreCoords?.lng }
                                : selectedPoint.type === 'home'
                                    ? { lat: Number(selectedPoint.consultantHome.lat), lng: Number(selectedPoint.consultantHome.lng) }
                                    : { lat: Number(selectedPoint.solides.coords.lat), lng: Number(selectedPoint.solides.coords.lng) }
                        }
                        onCloseClick={() => setSelectedPoint(null)}
                    >
                        <div className="p-3 min-w-[220px] bg-zinc-950 text-zinc-100 font-sans border border-zinc-700">
                            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 border-b border-zinc-800 pb-1">
                                {selectedPoint.type === 'store' ? 'TARGET [LOJA]' : selectedPoint.type === 'home' ? 'BASE [CASA]' : 'ACTUAL [PONTO]'}
                            </h3>
                            <div className="flex items-center gap-2 mb-2 text-xs text-zinc-400 font-mono border-b border-zinc-800/50 pb-2">
                                <Calendar size={12} className="text-zinc-500" />
                                <span>{selectedPoint.date}</span>
                            </div>
                            <div className="flex items-start gap-2 mb-2">
                                {selectedPoint.type === 'store' ? <MapPin size={14} className="text-emerald-500 mt-0.5" /> :
                                    selectedPoint.type === 'home' ? <MapPin size={14} className="text-purple-500 mt-0.5" /> :
                                        <Navigation size={14} className="text-red-500 mt-0.5" />}
                                <p className="text-sm font-medium leading-tight">
                                    {selectedPoint.type === 'store'
                                        ? (selectedPoint.storeLocation?.nome_pdv || selectedPoint.umovme?.store || 'Loja Desconhecida')
                                        : selectedPoint.type === 'home'
                                            ? (selectedPoint.consultantHome?.endereco || 'Endereço Base')
                                            : selectedPoint.solides.address}
                                </p>
                            </div>

                            <div className="text-[10px] text-zinc-500 font-mono bg-zinc-900 p-1 rounded mb-2">
                                {selectedPoint.type === 'store'
                                    ? (() => {
                                        const lat = selectedPoint.effectiveStoreCoords?.lat;
                                        const lng = selectedPoint.effectiveStoreCoords?.lng;
                                        return (lat != null && lng != null) ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : 'COORD_ERROR';
                                    })()
                                    : selectedPoint.type === 'home'
                                        ? (selectedPoint.consultantHome
                                            ? `${Number(selectedPoint.consultantHome.lat).toFixed(6)}, ${Number(selectedPoint.consultantHome.lng).toFixed(6)}`
                                            : 'COORD_ERROR')
                                        : (selectedPoint.solides?.coords
                                            ? `${selectedPoint.solides.coords.lat.toFixed(6)}, ${selectedPoint.solides.coords.lng.toFixed(6)}`
                                            : 'COORD_ERROR')
                                }
                            </div>

                            {selectedPoint.distance && (
                                <div className={clsx("text-xs font-bold px-2 py-1 inline-flex items-center gap-1",
                                    selectedPoint.distance > 500 ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                )}>
                                    OFFSET: {selectedPoint.distance < 1000 ? `${Math.round(selectedPoint.distance)}m` : `${(selectedPoint.distance / 1000).toFixed(2)}km`}
                                </div>
                            )}
                        </div>
                    </InfoWindow>
                )}
            </GoogleMap>

            {/* Map Overlay UI */}
            <div className="absolute top-4 right-4 bg-black/80 backdrop-blur border border-zinc-800 p-2 text-[10px] text-zinc-400 font-mono">
                <div>GEO_VISUALIZER_V1</div>
                <div>STATUS: ACTIVE</div>
            </div>

            {/* Corner Accents */}
            <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-zinc-700"></div>
            <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-zinc-700"></div>
            <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-zinc-700"></div>
            <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-zinc-700"></div>
        </div>
    )
}

export default React.memo(MapViewer)
