import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap, LayersControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { logPoints, generateUUID } from '../api';
import { Capacitor, registerPlugin } from '@capacitor/core';

const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');

// Fix Leaflet default icon issue in React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom pulsing icon for current location
const pulseIcon = L.divIcon({
  className: 'gps-pulse',
  iconSize: [24, 24],
  iconAnchor: [12, 12]
});

// Helper component to center map on location changes
const LocationTracker = ({ position }) => {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.panTo([position.lat, position.lng]);
    }
  }, [position, map]);
  return null;
};

export default function DriverView() {
  const [driverId] = useState(() => {
    let id = localStorage.getItem('deliveryDriverId');
    if (!id) {
      id = generateUUID();
      localStorage.setItem('deliveryDriverId', id);
    }
    return id;
  });

  const [driverName, setDriverName] = useState(() => {
    return localStorage.getItem('deliveryDriverName') || '';
  });
  
  const [isTracking, setIsTracking] = useState(false);

  const [position, setPosition] = useState(null);
  const [path, setPath] = useState([]);
  const [syncQueue, setSyncQueue] = useState([]);
  const [status, setStatus] = useState('Initializing...');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const isSyncing = useRef(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Geolocation watcher
  useEffect(() => {
    let watchId = null;
    let capacitorWatcherId = null;

    if (!isTracking) {
      setStatus('Not Tracking (Clocked Out)');
      return;
    }

    setStatus('Acquiring GPS...');

    const handleLocation = (pos, error) => {
      if (error) {
        console.error(error);
        setStatus(`GPS Error: ${error.message || 'Unknown error'}`);
        return;
      }
      
      const latitude = pos.coords ? pos.coords.latitude : pos.latitude;
      const longitude = pos.coords ? pos.coords.longitude : pos.longitude;
      const timestamp = pos.timestamp || pos.time || Date.now();
      
      const newPos = { lat: latitude, lng: longitude, timestamp };
      
      setPosition(newPos);
      setPath(prev => [...prev, [latitude, longitude]]);
      
      setSyncQueue(prev => [...prev, {
        ...newPos,
        driver: driverId,
        email: 'driver@example.com',
        name: driverName
      }]);
    };

    if (Capacitor.isNativePlatform()) {
      // Native App Background Tracking
      BackgroundGeolocation.addWatcher({
        backgroundMessage: "Tracking your delivery route.",
        backgroundTitle: "Delivery Tracker is Active",
        requestPermissions: true,
        stale: false,
        distanceFilter: 10 // Update every 10 meters
      }, handleLocation).then(id => {
        capacitorWatcherId = id;
      }).catch(err => {
        setStatus(`Plugin Error: ${err.message}`);
      });
    } else {
      // Web Fallback
      if (!navigator.geolocation) {
        setStatus('Geolocation not supported');
        return;
      }
      watchId = navigator.geolocation.watchPosition(
        pos => handleLocation(pos, null),
        err => handleLocation(null, err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }

    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
      if (capacitorWatcherId) {
        BackgroundGeolocation.removeWatcher({ id: capacitorWatcherId });
      }
    };
  }, [driverId, driverName, isTracking]);

  // Sync worker
  useEffect(() => {
    const syncData = async () => {
      if (syncQueue.length === 0 || isSyncing.current || !isOnline) return;
      
      isSyncing.current = true;
      setStatus(`Syncing (${syncQueue.length} pending)...`);
      
      try {
        await logPoints(syncQueue);
        // Clear synced points
        setSyncQueue([]);
        setStatus('Tracking Active');
      } catch (error) {
        console.error("Sync failed", error);
        setStatus('Sync Failed - Will retry');
      } finally {
        isSyncing.current = false;
      }
    };

    // Sync interval: 4-5 minutes as requested (240000 ms)
    const interval = setInterval(syncData, 240000);
    return () => clearInterval(interval);
  }, [syncQueue, isOnline]);

  if (!driverName) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full text-center">
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Welcome App User</h2>
          <p className="text-slate-500 mb-6 text-sm">Please enter your full name to start tracking.</p>
          <input 
            type="text" 
            id="nameInput"
            placeholder="e.g. John Doe" 
            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none mb-4 text-slate-700"
            onKeyDown={(e) => {
              if (e.key === 'Enter') document.getElementById('startBtn').click();
            }}
          />
          <button 
            id="startBtn"
            onClick={() => {
              const name = document.getElementById('nameInput').value.trim();
              if (name) {
                localStorage.setItem('deliveryDriverName', name);
                setDriverName(name);
              }
            }}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            Start Tracking
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full relative">
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-white/90 px-6 py-2 rounded-full shadow-lg font-semibold text-sm flex items-center gap-2">
        <div className={`w-3 h-3 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className={status.includes('Error') || status.includes('Failed') ? 'text-red-600' : 'text-slate-700'}>
          {status}
        </span>
      </div>

      <MapContainer 
        center={position ? [position.lat, position.lng] : [26.1445, 91.7362]} 
        zoom={16} 
        className="h-full w-full"
      >
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Google Streets">
            <TileLayer
              url="http://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
              maxZoom={20}
              attribution="Google"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Google Hybrid">
            <TileLayer
              url="http://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
              maxZoom={20}
              attribution="Google"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Esri Satellite">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={19}
              attribution="Esri"
            />
          </LayersControl.BaseLayer>
        </LayersControl>
        
        {position && <LocationTracker position={position} />}
        
        {path.length > 0 && (
          <Polyline positions={path} color="#007aff" weight={4}>
            <Popup>
              <div className="font-semibold text-center">
                Total Distance:<br/>
                {(() => {
                  let dist = 0;
                  for (let i = 0; i < path.length - 1; i++) {
                    dist += L.latLng(path[i]).distanceTo(L.latLng(path[i+1]));
                  }
                  return dist > 1000 ? (dist/1000).toFixed(2) + ' km' : Math.round(dist) + ' m';
                })()}
              </div>
            </Popup>
          </Polyline>
        )}
        
        {path.map((p, i) => (
          <CircleMarker key={i} center={p} radius={3} pathOptions={{ color: '#007aff', fillOpacity: 1, stroke: false }} />
        ))}

        {position && (
          <Marker position={[position.lat, position.lng]} icon={pulseIcon} />
        )}
      </MapContainer>
      
      {/* Clock In / Clock Out Floating Button */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[1000] w-11/12 max-w-sm">
        {isTracking ? (
          <button 
            onClick={() => setIsTracking(false)}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-xl shadow-2xl transition-transform active:scale-95 text-lg flex items-center justify-center gap-2 border-2 border-white/20"
          >
            <span className="w-3 h-3 rounded-full bg-white animate-pulse" />
            Clock Out (Stop Tracking)
          </button>
        ) : (
          <button 
            onClick={() => setIsTracking(true)}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl shadow-2xl transition-transform active:scale-95 text-lg flex items-center justify-center gap-2 border-2 border-white/20"
          >
            Clock In (Start Tracking)
          </button>
        )}
      </div>
    </div>
  );
}
