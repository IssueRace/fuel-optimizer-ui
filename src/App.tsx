import React, { useState } from 'react';
import jsPDF from 'jspdf';
import { 
  MapPin, 
  Car, 
  Navigation, 
  History,
  Route,
  Zap,
  Truck,
  Trash2,
  Save,
  Battery,
  ChevronDown
} from 'lucide-react';
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

// Fix Leaflet default marker icons (broken by Vite bundler)
// @ts-ignore
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
// @ts-ignore
import markerIcon from 'leaflet/dist/images/marker-icon.png';
// @ts-ignore
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

function MapRecenter({ coords }: { coords: [number, number][] }) {
  const map = useMap();
  React.useEffect(() => {
    if (coords.length > 0) {
      const bounds = L.latLngBounds(coords.map(c => L.latLng(c[0], c[1])));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [coords, map]);
  return null;
}

function App() {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  type EngineType = 'Petrol' | 'Diesel' | 'Electric';
  type VehicleProfile = { id: string, name: string, type: EngineType, consumption: number, capacity: number };
  
  const [profiles, setProfiles] = useState<VehicleProfile[]>([
    { id: '1', name: 'Default Volvo', type: 'Petrol', consumption: 8.5, capacity: 55 }
  ]);
  const [activeProfileId, setActiveProfileId] = useState('1');
  const [newProfileName, setNewProfileName] = useState('');
  
  const activeProfile = profiles.find(p => p.id === activeProfileId) || profiles[0];

  const [consumption, setConsumption] = useState(activeProfile.consumption);
  const [capacity, setCapacity] = useState(activeProfile.capacity);
  const [fuelType, setFuelType] = useState<EngineType>(activeProfile.type);

  type FuelStop = { stationName: string, latitude: number, longitude: number, pricePerLiter: number, amountToRefuel: number };
  type ResultsType = { distance: number, cost: number, coords: [number, number][], unreachableCoords: [number, number][], stops: FuelStop[], isPossible: boolean, stoppedAtKm: number };
  
  const [results, setResults] = useState<ResultsType | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showProfile, setShowProfile] = useState(true);
  const [startingFuel, setStartingFuel] = useState(50);

  const handleCalculate = async () => {
    if (!start || !end) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const response = await fetch('http://localhost:5000/api/trip/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: start,
          destination: end,
          fuelConsumption: consumption,
          fuelTankCapacity: capacity,
          fuelType,
          currentFuelPercent: startingFuel
        })
      });
      
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Error ${response.status}: ${errText}`);
      }
      
      const data = await response.json();
      setResults({
        distance: data.totalDistanceKm,
        cost: data.totalCostEur,
        coords: data.routeCoordinates,
        unreachableCoords: data.unreachableCoordinates || [],
        stops: data.recommendedStops,
        isPossible: data.isPossible,
        stoppedAtKm: data.stoppedAtKm
      });
    } catch (error: any) {
      console.error(error);
      setErrorMsg(error.message || 'Failed to connect to backend.');
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/trip/history');
      if (res.ok) setHistory(await res.json());
    } catch {}
  };

  const handleDownloadPdf = () => {
    if (!results) return;
    const doc = new jsPDF();
    const w = doc.internal.pageSize.getWidth();
    let y = 20;
    
    // Title
    doc.setFontSize(22);
    doc.setTextColor(56, 189, 248);
    doc.text('FuelFlow - Trip Report', w / 2, y, { align: 'center' });
    y += 12;
    doc.setDrawColor(56, 189, 248);
    doc.line(20, y, w - 20, y);
    y += 15;
    
    // Route info
    doc.setFontSize(12);
    doc.setTextColor(40, 40, 40);
    doc.text(`Route: ${start} → ${end}`, 20, y); y += 8;
    doc.text(`Total Distance: ${results.distance.toFixed(1)} km`, 20, y); y += 8;
    doc.text(`Estimated Cost: €${results.cost.toFixed(2)}`, 20, y); y += 8;
    doc.text(`Route Possible: ${results.isPossible ? 'Yes' : 'No'}`, 20, y); y += 8;
    if (!results.isPossible) {
      doc.setTextColor(239, 68, 68);
      doc.text(`⚠ Vehicle stopped at: ${results.stoppedAtKm.toFixed(1)} km`, 20, y);
      doc.setTextColor(40, 40, 40);
      y += 8;
    }
    y += 5;
    
    // Vehicle
    doc.setFontSize(14);
    doc.setTextColor(56, 189, 248);
    doc.text('Vehicle Profile', 20, y); y += 8;
    doc.setFontSize(11);
    doc.setTextColor(40, 40, 40);
    doc.text(`Fuel Type: ${fuelType}`, 20, y); y += 7;
    doc.text(`Consumption: ${consumption} ${fuelType === 'Electric' ? 'kWh' : 'L'}/100km`, 20, y); y += 7;
    doc.text(`Tank Capacity: ${capacity} ${fuelType === 'Electric' ? 'kWh' : 'L'}`, 20, y); y += 7;
    doc.text(`Starting Fuel Level: ${startingFuel}%`, 20, y); y += 12;
    
    // Stops table
    if (results.stops.length > 0) {
      doc.setFontSize(14);
      doc.setTextColor(56, 189, 248);
      doc.text(`Recommended Fuel Stops (${results.stops.length})`, 20, y); y += 10;
      
      // Table header
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      doc.setFillColor(30, 41, 59);
      doc.rect(20, y - 5, w - 40, 8, 'F');
      doc.text('#', 24, y); 
      doc.text('Station', 34, y); 
      doc.text('Price/L', 110, y); 
      doc.text('Refuel (L)', 140, y);
      doc.text('Cost', 170, y);
      y += 8;
      
      doc.setTextColor(40, 40, 40);
      results.stops.forEach((stop, i) => {
        if (y > 270) { doc.addPage(); y = 20; }
        const bg = i % 2 === 0 ? 245 : 255;
        doc.setFillColor(bg, bg, bg);
        doc.rect(20, y - 5, w - 40, 8, 'F');
        doc.text(`${i + 1}`, 24, y);
        doc.text(stop.stationName.substring(0, 30), 34, y);
        doc.text(`€${stop.pricePerLiter.toFixed(2)}`, 110, y);
        doc.text(`${stop.amountToRefuel.toFixed(1)}`, 140, y);
        doc.text(`€${(stop.amountToRefuel * stop.pricePerLiter).toFixed(2)}`, 170, y);
        y += 8;
      });
    }
    
    // Footer
    y = 280;
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 20, y);
    doc.text('FuelFlow - Road Trip Fuel Cost Optimizer', w / 2, y, { align: 'center' });
    
    doc.save(`trip-report-${start}-${end}.pdf`);
  };

  return (
    <div style={{ 
      display: 'flex', 
      height: '100vh', 
      width: '100vw', 
      padding: '24px', 
      boxSizing: 'border-box', 
      gap: '24px',
      background: 'radial-gradient(circle at 0% 0%, #1e293b 0%, #0b0f1a 100%)'
    }}>
      <aside className="glass-panel" style={{ 
        width: '420px', 
        padding: '32px', 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '32px',
        zIndex: 10,
        overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ 
            background: 'var(--accent)', 
            padding: '10px', 
            borderRadius: '14px',
            boxShadow: '0 0 20px var(--accent-glow)'
          }}>
            <Zap size={28} color="#0b0f1a" />
          </div>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>FuelFlow</h1>
            <span style={{ fontSize: '12px', color: 'var(--text-dim)', fontWeight: 500 }}>Road Trip Optimizer</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label>Origin</label>
            <div style={{ position: 'relative' }}>
              <MapPin size={18} color="var(--accent)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
              <input 
                type="text" 
                placeholder="Berlin" 
                style={{ paddingLeft: '44px' }}
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
          </div>
          
          <div>
            <label>Destination</label>
            <div style={{ position: 'relative' }}>
              <Route size={18} color="var(--accent)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
              <input 
                type="text" 
                placeholder="Paris" 
                style={{ paddingLeft: '44px' }}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '20px', background: 'rgba(255, 255, 255, 0.03)', borderStyle: 'dashed', position: 'relative' }}>
          <div 
            onClick={() => setShowProfile(!showProfile)}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: showProfile ? 'center' : 'center', cursor: 'pointer', marginBottom: showProfile ? '16px' : 0 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Car size={16} color="var(--accent)" />
              <span style={{ fontSize: '13px', fontWeight: 600 }}>Vehicle Profile</span>
            </div>
            <ChevronDown size={16} color="var(--text-dim)" style={{ transform: showProfile ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
          </div>
          {showProfile && (<>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border)', marginBottom: '16px' }}>
            <div>
              <label>Saved Profiles</label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <select 
                  value={activeProfileId}
                  onChange={(e) => {
                    const p = profiles.find(x => x.id === e.target.value);
                    if (p) {
                      setActiveProfileId(p.id);
                      setFuelType(p.type);
                      setConsumption(p.consumption);
                      setCapacity(p.capacity);
                    }
                  }}
                  style={{ flex: 1, padding: '10px', height: '42px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: 'white', borderRadius: '8px', boxSizing: 'border-box' }}
                >
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button 
                  onClick={() => {
                    if (profiles.length > 1) {
                      const newProfiles = profiles.filter(p => p.id !== activeProfileId);
                      setProfiles(newProfiles);
                      setActiveProfileId(newProfiles[0].id);
                    }
                  }}
                  style={{ padding: '0 12px', height: '42px', background: 'rgba(239, 68, 68, 0.2)', border: 'none', borderRadius: '8px', cursor: 'pointer', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  disabled={profiles.length <= 1}
                >
                  <Trash2 size={18} />
                </button>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="text" 
                  placeholder="New profile name" 
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  style={{ flex: 1, padding: '10px', height: '42px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: 'white', borderRadius: '8px', boxSizing: 'border-box' }}
                />
                <button 
                  onClick={() => {
                    if (!newProfileName) return;
                    const newP: VehicleProfile = { id: Date.now().toString(), name: newProfileName, type: fuelType, consumption, capacity };
                    setProfiles([...profiles, newP]);
                    setActiveProfileId(newP.id);
                    setNewProfileName('');
                  }}
                  style={{ padding: '0 12px', height: '42px', background: 'var(--accent)', border: 'none', borderRadius: '8px', cursor: 'pointer', color: '#0b0f1a', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Save size={18} />
                </button>
              </div>
            </div>

            <div>
              <label>Engine Type</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <button 
                  onClick={() => { setFuelType('Petrol'); setConsumption(8.5); setCapacity(55); }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '12px', background: fuelType === 'Petrol' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(0,0,0,0.3)', border: `1px solid ${fuelType === 'Petrol' ? 'var(--accent)' : 'var(--border)'}`, borderRadius: '12px', color: 'white', cursor: 'pointer' }}>
                  <Car size={24} color={fuelType === 'Petrol' ? 'var(--accent)' : 'var(--text-dim)'} />
                  <span style={{ fontSize: '11px', fontWeight: 600 }}>Petrol</span>
                </button>
                <button 
                  onClick={() => { setFuelType('Diesel'); setConsumption(6.0); setCapacity(80); }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '12px', background: fuelType === 'Diesel' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(0,0,0,0.3)', border: `1px solid ${fuelType === 'Diesel' ? 'var(--accent)' : 'var(--border)'}`, borderRadius: '12px', color: 'white', cursor: 'pointer' }}>
                  <Truck size={24} color={fuelType === 'Diesel' ? 'var(--accent)' : 'var(--text-dim)'} />
                  <span style={{ fontSize: '11px', fontWeight: 600 }}>Diesel</span>
                </button>
                <button 
                  onClick={() => { setFuelType('Electric'); setConsumption(18); setCapacity(75); }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '12px', background: fuelType === 'Electric' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(0,0,0,0.3)', border: `1px solid ${fuelType === 'Electric' ? 'var(--accent)' : 'var(--border)'}`, borderRadius: '12px', color: 'white', cursor: 'pointer' }}>
                  <Battery size={24} color={fuelType === 'Electric' ? 'var(--accent)' : 'var(--text-dim)'} />
                  <span style={{ fontSize: '11px', fontWeight: 600 }}>Electric</span>
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label>{fuelType === 'Electric' ? 'Efficiency (kWh/100km)' : 'Consumption (L/100km)'}</label>
                <input 
                  type="number" 
                  value={consumption}
                  onChange={(e) => setConsumption(Number(e.target.value))}
                  style={{ background: 'transparent', padding: '8px 0', fontSize: '18px', fontWeight: 700, border: 'none', borderBottom: '1px solid var(--border)', borderRadius: 0 }}
                />
              </div>
              <div>
                <label>{fuelType === 'Electric' ? 'Battery (kWh)' : 'Tank Capacity (L)'}</label>
                <input 
                  type="number" 
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value))}
                  style={{ background: 'transparent', padding: '8px 0', fontSize: '18px', fontWeight: 700, border: 'none', borderBottom: '1px solid var(--border)', borderRadius: 0 }}
                />
              </div>
            </div>
          
          <div style={{ marginTop: '8px' }}>
            <label>Starting Fuel Level: {startingFuel}%</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>0%</span>
              <input 
                type="range" min="5" max="100" value={startingFuel}
                onChange={(e) => setStartingFuel(Number(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--accent)' }}
              />
              <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>100%</span>
            </div>
          </div>
          </>)}
        </div>

        {errorMsg && (
          <div style={{ color: '#ef4444', fontSize: '13px', padding: '12px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
            {errorMsg}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: 'auto' }}>
          <button 
            className="glow-button" 
            onClick={handleCalculate}
            disabled={loading}
          >
            <Navigation size={20} />
            {loading ? 'Calculating...' : 'Optimize Route'}
          </button>
          {results && (
            <button 
              className="glow-button" 
              onClick={handleDownloadPdf}
              style={{ background: 'rgba(56, 189, 248, 0.15)' }}
            >
              <Save size={20} />
              Download PDF Report
            </button>
          )}
          <button 
            onClick={() => { setShowHistory(!showHistory); fetchHistory(); }}
            style={{ 
              background: 'rgba(255,255,255,0.05)', 
              border: '1px solid var(--border)', 
              color: 'white', 
              padding: '14px', 
              borderRadius: '12px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <History size={18} />
            Trip History
          </button>
          {showHistory && (
            <div className="glass-panel" style={{ padding: '16px', maxHeight: '200px', overflowY: 'auto' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>Recent Trips</div>
              {history.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>No trips yet</div>
              ) : (
                history.map((h: any, i: number) => (
                  <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '12px' }}>
                    <div style={{ fontWeight: 600 }}>{h.origin} → {h.destination}</div>
                    <div style={{ color: 'var(--text-dim)' }}>{h.distanceKm?.toFixed(0)} km · €{h.totalCostEur?.toFixed(2)} · {h.stopsCount} stops · {h.fuelType}</div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </aside>

      <main className="glass-panel" style={{ 
        flex: 1, 
        position: 'relative', 
        overflow: 'hidden',
        background: '#04070d'
      }}>
        <MapContainer 
          center={results && results.coords.length > 0 ? results.coords[0] : [51.505, -0.09]} 
          zoom={results ? 6 : 4} 
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          />
          {results && <MapRecenter coords={results.coords} />}
          
          {results && (
            <>
              {results.coords.length > 0 && <Polyline positions={results.coords} color="#38bdf8" weight={4} opacity={0.8} />}
              {results.unreachableCoords && results.unreachableCoords.length > 0 && (
                <Polyline positions={results.unreachableCoords} color="#ef4444" weight={4} opacity={0.8} dashArray="10, 10" />
              )}
              {results.stops.map((stop, i) => (
                <Marker key={i} position={[stop.latitude, stop.longitude]}>
                  <Popup>
                    <strong>{stop.stationName}</strong><br/>
                    Price: {stop.pricePerLiter} €<br/>
                    Refuel: {stop.amountToRefuel} L
                  </Popup>
                </Marker>
              ))}
            </>
          )}
        </MapContainer>

        {results && (
          <div style={{ position: 'absolute', bottom: '24px', left: '24px', right: '24px', display: 'flex', flexDirection: 'column', gap: '16px', zIndex: 1000 }}>
            
            {!results.isPossible && (
              <div style={{ background: 'rgba(239, 68, 68, 0.9)', color: 'white', padding: '16px', borderRadius: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 4px 20px rgba(239, 68, 68, 0.3)' }}>
                <Battery size={24} />
                <div>
                  <div style={{ fontSize: '16px' }}>Route Impossible</div>
                  <div style={{ fontSize: '13px', opacity: 0.9 }}>Vehicle ran out of fuel at {results.stoppedAtKm.toFixed(1)} km. The distance to the next station is too far for the current tank capacity.</div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '16px' }}>
              <div className="glass-panel" style={{ flex: 1, padding: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <Route size={20} color="var(--accent)" />
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Distance</div>
                    <div style={{ fontSize: '18px', fontWeight: 700 }}>{results.distance.toFixed(1)} km</div>
                  </div>
              </div>

              <div className="glass-panel" style={{ flex: 1, padding: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <MapPin size={20} color="var(--accent)" />
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Stops</div>
                    <div style={{ fontSize: '18px', fontWeight: 700 }}>{results.stops.length}</div>
                  </div>
              </div>

              <div className="glass-panel" style={{ flex: 1, padding: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ 
                    background: 'var(--accent)', 
                    color: '#0b0f1a', 
                    padding: '8px', 
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    fontSize: '14px'
                  }}>€</div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Estimated Cost</div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent)' }}>€{results.cost.toFixed(2)}</div>
                  </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
