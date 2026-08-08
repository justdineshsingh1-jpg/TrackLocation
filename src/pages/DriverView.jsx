import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap, LayersControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { logPoints, generateUUID, fetchPoints } from '../api';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';

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

// Calculate distance in meters between two coordinates
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // in metres
}

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
  
  const [driverEmail, setDriverEmail] = useState(() => {
    return localStorage.getItem('deliveryDriverEmail') || '';
  });
  
  const [isTracking, setIsTracking] = useState(false);

  const [position, setPosition] = useState(null);
  const [path, setPath] = useState(() => {
    const saved = localStorage.getItem('driverPath');
    return saved ? JSON.parse(saved) : [];
  });
  const [syncQueue, setSyncQueue] = useState(() => {
    const saved = localStorage.getItem('syncQueue');
    return saved ? JSON.parse(saved) : [];
  });
  const [status, setStatus] = useState('Initializing...');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const isSyncing = useRef(false);
  const lastLoggedPos = useRef(null);

  useEffect(() => {
    if (path.length > 0 && !lastLoggedPos.current) {
      lastLoggedPos.current = { lat: path[path.length-1][0], lng: path[path.length-1][1] };
    }
  }, [path]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    const loadTodayPath = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const allPoints = await fetchPoints(today);
        const myPoints = allPoints.filter(p => p.driver === driverId);
        if (myPoints.length > 0) {
          const fetchedPath = myPoints.map(p => [parseFloat(p.lat), parseFloat(p.lng)]);
          setPath(fetchedPath);
          setPosition({ lat: fetchedPath[fetchedPath.length-1][0], lng: fetchedPath[fetchedPath.length-1][1] });
          lastLoggedPos.current = { lat: fetchedPath[fetchedPath.length-1][0], lng: fetchedPath[fetchedPath.length-1][1] };
        }
      } catch (e) {
        console.error("Failed to fetch path", e);
      }
    };
    if (isOnline && driverId) loadTodayPath();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [driverId, isOnline]);

  useEffect(() => {
    localStorage.setItem('driverPath', JSON.stringify(path));
  }, [path]);

  useEffect(() => {
    localStorage.setItem('syncQueue', JSON.stringify(syncQueue));
  }, [syncQueue]);

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
      
      // Enforce 50-meter distance filter
      if (lastLoggedPos.current) {
        const dist = getDistance(lastLoggedPos.current.lat, lastLoggedPos.current.lng, latitude, longitude);
        if (dist < 50) return; // Skip point if it's less than 50 meters from the last one
      }
      
      const newPos = { lat: latitude, lng: longitude, timestamp };
      lastLoggedPos.current = newPos;
      
      setPosition(newPos);
      setPath(prev => [...prev, [latitude, longitude]]);
      
      setSyncQueue(prev => [...prev, {
        ...newPos,
        driver: driverId,
        email: driverEmail,
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
        distanceFilter: 50 // Update every 50 meters natively
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

    // Auto-sync when 50 points are collected
    if (syncQueue.length >= 50) {
      syncData();
    }

    // Sync interval: 4 minutes as a backup
    const interval = setInterval(() => {
      if (syncQueue.length > 0) syncData();
    }, 240000);
    return () => clearInterval(interval);
  }, [syncQueue, isOnline]);

  // Expose manual sync function for Clock Out and Background transitions
  const forceSync = async () => {
    if (syncQueue.length === 0 || !isOnline) return;
    setStatus(`Syncing (${syncQueue.length} pending)...`);
    try {
      await logPoints(syncQueue);
      setSyncQueue([]);
      setStatus('Tracking Active');
    } catch (error) {
      console.error("Sync failed", error);
      setStatus('Sync Failed - Will retry');
    }
  };

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    
    let sub = null;
    App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) {
        forceSync();
      }
    }).then(s => sub = s);
    
    return () => {
      if (sub && sub.remove) sub.remove();
    };
  }, [syncQueue, isOnline]);

  if (!driverName || !driverEmail) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full text-center">
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Welcome App User</h2>
          <p className="text-slate-500 mb-6 text-sm">Please enter your details to start tracking.</p>
          
          <input 
            type="text" 
            id="nameInput"
            placeholder="Full Name (e.g. John Doe)" 
            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none mb-3 text-slate-700"
          />
          
          <input 
            type="email" 
            id="emailInput"
            placeholder="Email Address" 
            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none mb-4 text-slate-700"
            onKeyDown={(e) => {
              if (e.key === 'Enter') document.getElementById('startBtn').click();
            }}
          />
          
          <button 
            id="startBtn"
            onClick={() => {
              const name = document.getElementById('nameInput').value.trim();
              const email = document.getElementById('emailInput').value.trim();
              if (name && email) {
                localStorage.setItem('deliveryDriverName', name);
                localStorage.setItem('deliveryDriverEmail', email);
                setDriverName(name);
                setDriverEmail(email);
              } else {
                alert("Please enter both Name and Email.");
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
              url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
              maxZoom={20}
              attribution="Google"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Google Hybrid">
            <TileLayer
              url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
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
        {syncQueue.length > 0 && (
          <div className="bg-white/90 backdrop-blur text-xs font-bold text-slate-600 text-center py-2 rounded-t-xl mb-1 shadow-sm">
            {syncQueue.length} points waiting to sync...
          </div>
        )}
        {isTracking ? (
          <button 
            onClick={() => {
              setIsTracking(false);
              forceSync(); // Sync immediately when they clock out!
            }}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-xl shadow-2xl transition-transform active:scale-95 text-lg flex items-center justify-center gap-2 border-2 border-white/20"
          >
            <span className="w-3 h-3 rounded-full bg-white animate-pulse" />
            Clock Out & Sync Now
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
