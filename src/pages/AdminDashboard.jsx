import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap, LayersControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchPoints } from '../api';
import { Calendar, Users, Activity, ChevronLeft, Menu, X } from 'lucide-react';
import { Link } from 'react-router-dom';

const MapBounds = ({ bounds }) => {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [bounds, map]);
  return null;
};

// Custom component to snap GPS points to roads using OSRM Match API
const SnappedPolyline = ({ pts, color, bounds, popupContent, weight = 4, opacity = 0.8 }) => {
  const [geometries, setGeometries] = useState(null);

  useEffect(() => {
    if (!pts || pts.length < 2) return;
    
    // Chunk array into pieces of max 90 points (OSRM limit is 100)
    const chunks = [];
    for (let i = 0; i < pts.length; i += 90) {
      chunks.push(pts.slice(i, i + 91)); // Overlap by 1 to connect chunks
    }

    const fetchSnaps = async () => {
      try {
        const results = [];
        for (const chunk of chunks) {
          if (chunk.length < 2) {
            results.push(null);
            continue;
          }
          const coords = chunk.map(p => `${p.lng},${p.lat}`).join(';');
          // Use OSRM public API for map matching
          const url = `https://router.project-osrm.org/match/v1/driving/${coords}?geometries=geojson&overview=full`;
          
          try {
            const res = await fetch(url);
            const data = await res.json();
            
            if (data.code === 'Ok' && data.matchings && data.matchings.length > 0) {
              const combinedCoords = [];
              data.matchings.forEach(m => {
                if (m.geometry && m.geometry.coordinates) {
                  // GeoJSON is [lng, lat], Leaflet is [lat, lng]
                  m.geometry.coordinates.forEach(c => combinedCoords.push([c[1], c[0]]));
                }
              });
              results.push(combinedCoords);
            } else {
              console.warn("OSRM Match failed for chunk:", data.code);
              results.push(null); // fallback to straight lines for this chunk
            }
          } catch (err) {
            console.error("OSRM chunk fetch failed", err);
            results.push(null);
          }
          
          // Wait 500ms before next OSRM request to avoid rate limit (HTTP 429 Too Many Requests)
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        let finalPath = [];
        results.forEach((res, i) => {
          if (res) {
            finalPath = finalPath.concat(res);
          } else {
            finalPath = finalPath.concat(chunks[i].map(p => [p.lat, p.lng]));
          }
        });
        setGeometries(finalPath);
      } catch (e) {
        console.error("OSRM Error:", e);
        setGeometries(null);
      }
    };
    
    fetchSnaps();
  }, [pts]);

  const rawLatLngs = pts.map(p => {
    if (bounds) bounds.extend([p.lat, p.lng]);
    return [p.lat, p.lng];
  });

  const displayPath = geometries || rawLatLngs;

  return (
    <Polyline positions={displayPath} color={color} weight={weight} opacity={opacity}>
      {popupContent && <Popup>{popupContent}</Popup>}
    </Polyline>
  );
};


export default function AdminDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('adminAuth') === 'true';
  });
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
  }, [date]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch points for the selected date only to improve performance
      const data = await fetchPoints(date);
      setPoints(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Grouping Data
  const driversToday = {};
  
  points.forEach(p => {
    const lat = parseFloat(p.lat);
    const lng = parseFloat(p.lng);
    if (!lat || !lng) return;

    const pointData = { ...p, lat, lng };
    if (!driversToday[p.driver]) driversToday[p.driver] = [];
    driversToday[p.driver].push(pointData);
  });

  const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'];
  const bounds = L.latLngBounds();

  // Metrics
  const activeDriversCount = Object.keys(driversToday).length;
  const totalPointsToday = Object.values(driversToday).reduce((acc, curr) => acc + curr.length, 0);

  if (!isAuthenticated) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full text-center">
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Management Login</h2>
          <p className="text-slate-500 mb-6 text-sm">Please enter the dashboard password.</p>
          <input 
            type="password" 
            id="passwordInput"
            placeholder="Password" 
            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none mb-4 text-slate-700"
            onKeyDown={(e) => {
              if (e.key === 'Enter') document.getElementById('loginBtn').click();
            }}
          />
          <button 
            id="loginBtn"
            onClick={() => {
              const pwd = document.getElementById('passwordInput').value;
              if (pwd === 'admin123') {
                localStorage.setItem('adminAuth', 'true');
                setIsAuthenticated(true);
              } else {
                alert('Incorrect password!');
              }
            }}
            className="w-full bg-slate-800 hover:bg-slate-900 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-100 font-sans overflow-hidden">
      
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-[1500] md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-[2000] w-80 bg-white border-r border-slate-200 flex flex-col shadow-2xl transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        md:relative md:translate-x-0 md:flex md:shadow-lg md:z-10
      `}>
        <div className="p-6 border-b border-slate-100 flex items-center gap-3">
          <Link to="/" className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <ChevronLeft size={20} className="text-slate-500" />
          </Link>
          <h1 className="text-xl font-bold text-slate-800">Dispatch Panel</h1>
          <button className="md:hidden ml-auto p-2 hover:bg-slate-100 rounded-full" onClick={() => setSidebarOpen(false)}>
            <X size={20} className="text-slate-500" />
          </button>
        </div>
        
        <div className="p-6 flex-1 overflow-y-auto">
          <div className="space-y-6">
            
            {/* Date Filter */}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">
                Select Date
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                  type="date" 
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-700 font-medium"
                />
              </div>
            </div>

            {/* Metrics Cards */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                <div className="flex items-center gap-2 text-blue-600 mb-1">
                  <Users size={16} />
                  <span className="text-xs font-semibold">Active App Users</span>
                </div>
                <div className="text-2xl font-bold text-blue-900">{activeDriversCount}</div>
              </div>
              <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                <div className="flex items-center gap-2 text-emerald-600 mb-1">
                  <Activity size={16} />
                  <span className="text-xs font-semibold">Points Logged</span>
                </div>
                <div className="text-2xl font-bold text-emerald-900">{totalPointsToday}</div>
              </div>
            </div>

            {/* Active Drivers List */}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 block">
                App Users on {date}
              </label>
              {activeDriversCount === 0 ? (
                <div className="text-sm text-slate-400 p-4 bg-slate-50 rounded-lg border border-dashed border-slate-200 text-center">
                  No tracking data found for this date.
                </div>
              ) : (
                <div className="space-y-2">
                  {Object.keys(driversToday).map((driverId, idx) => {
                    const color = colors[idx % colors.length];
                    const driverPoints = driversToday[driverId];
                    const lastPoint = driverPoints[driverPoints.length - 1];
                    
                    return (
                      <div key={driverId} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg hover:shadow-sm transition-shadow cursor-pointer">
                        <div className="flex items-center gap-3">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                          <div>
                            <div className="text-sm font-semibold text-slate-700 truncate w-32">
                              {lastPoint.name || lastPoint.email || driverId.substring(0,8)}
                            </div>
                            <div className="text-xs text-slate-400">
                              {driverPoints.length} points • {(() => {
                                let dist = 0;
                                for (let i = 0; i < driverPoints.length - 1; i++) {
                                  dist += L.latLng([driverPoints[i].lat, driverPoints[i].lng]).distanceTo(L.latLng([driverPoints[i+1].lat, driverPoints[i+1].lng]));
                                }
                                return dist > 1000 ? (dist/1000).toFixed(2) + ' km' : Math.round(dist) + ' m';
                              })()}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* Main Map Area */}
      <div className="flex-1 relative">
        <button 
          onClick={() => setSidebarOpen(true)}
          className="md:hidden absolute top-4 left-4 z-[1000] bg-white p-2 rounded-lg shadow-md border border-slate-200"
        >
          <Menu size={24} className="text-slate-700" />
        </button>
        
        {loading && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-[2000] flex items-center justify-center">
            <div className="bg-white px-6 py-3 rounded-full shadow-lg font-semibold text-blue-600 flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              Loading Data...
            </div>
          </div>
        )}

        {error && (
          <div className="absolute top-4 right-4 z-[1000] bg-red-100 text-red-700 px-4 py-2 rounded-lg shadow font-medium">
            Error: {error}
          </div>
        )}

        <MapContainer center={[26.1445, 91.7362]} zoom={12} className="w-full h-full">
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

          {/* Render Today Paths */}
          {Object.keys(driversToday).map((driverId, idx) => {
            const pts = driversToday[driverId];
            const color = colors[idx % colors.length];
            const latLngs = pts.map(p => {
              bounds.extend([p.lat, p.lng]);
              return [p.lat, p.lng];
            });

            return (
              <React.Fragment key={`today-${driverId}`}>
                <SnappedPolyline 
                  pts={pts} 
                  color={color} 
                  bounds={bounds}
                  popupContent={
                    <div className="font-semibold text-center text-sm text-slate-700">
                      Distance Travelled:<br/>
                      {(() => {
                        let dist = 0;
                        for (let i = 0; i < latLngs.length - 1; i++) {
                          dist += L.latLng(latLngs[i]).distanceTo(L.latLng(latLngs[i+1]));
                        }
                        return dist > 1000 ? (dist/1000).toFixed(2) + ' km' : Math.round(dist) + ' m';
                      })()}
                    </div>
                  }
                />
                
                {pts.map((p, pIdx) => {
                  let timeStr = new Date(p.timestamp).toLocaleTimeString();
                  return (
                    <CircleMarker 
                      key={`pt-${pIdx}`} 
                      center={[p.lat, p.lng]} 
                      radius={4} 
                      pathOptions={{ color, fillColor: color, fillOpacity: 1, weight: 1, color: '#fff' }}
                    >
                      <Popup className="font-sans">
                        <div className="font-semibold text-slate-800 border-b pb-1 mb-1">
                          {p.name || p.email}
                        </div>
                        <div className="text-xs text-slate-500">
                          Time: {timeStr}<br/>
                          Lat: {p.lat.toFixed(5)}<br/>
                          Lng: {p.lng.toFixed(5)}
                        </div>
                      </Popup>
                    </CircleMarker>
                  );
                })}
              </React.Fragment>
            );
          })}
          
          <MapBounds bounds={bounds} />
        </MapContainer>
      </div>
    </div>
  );
}
