import { useState, useEffect, useMemo } from 'react'
import { FileUploader } from './components/FileUploader'
import { parseCsv, processSolidesData, processUmovmeData } from './services/CsvParser'
import { fetchLocations, fetchConsultants } from './services/SupabaseClient'
import { ReportService } from './services/ReportService'
import { geocodeAddress, calculateDistance } from './services/GoogleMaps'
import MapViewer from './components/MapViewer'
import { Loader2, AlertTriangle, MapPin, Navigation, FileSpreadsheet, ShieldCheck, Search, Filter, Send, Eye, CheckCircle2 } from 'lucide-react'
import { clsx } from 'clsx'
import DashboardStats from './components/DashboardStats'
import InsightsDashboard from './components/InsightsDashboard'
import ComplianceRanking from './components/ComplianceRanking'
import PointHistoryViewer from './components/PointHistoryViewer'
import { PointHistoryService } from './services/PointHistoryService'
import ResumoTab from './components/ResumoTab'

function App() {
  const [locations, setLocations] = useState([])
  const [solidesFile, setSolidesFile] = useState(null)
  const [umovmeFile, setUmovmeFile] = useState(null)
  const [processedData, setProcessedData] = useState([])
  const [loading, setLoading] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const [error, setError] = useState(null)

  // Consultant Filtering
  const [consultants, setConsultants] = useState([])
  const [selectedConsultant, setSelectedConsultant] = useState('TODOS')
  const [consultantAddresses, setConsultantAddresses] = useState([])
  const [currentView, setCurrentView] = useState('audit') // 'audit' | 'insights'

  // Client Mode
  const [isClientMode, setIsClientMode] = useState(false)
  const [reportTitle, setReportTitle] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('mode') === 'client') {
      setIsClientMode(true)
      setCurrentView('insights')
      loadClientReport()
    } else {
      loadLocations()
    }
  }, [])

  const [pointHistoryData, setPointHistoryData] = useState([])
  const [pointHistoryFile, setPointHistoryFile] = useState(null)
  const [manualApprovals, setManualApprovals] = useState({})

  const toggleApproval = (row) => {
    const key = `${row.consultant}_${row.date}_${row.solides.time}`;
    setManualApprovals(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handlePointHistoryUpload = async (file) => {
    setLoading(true)
    setError(null)
    setPointHistoryFile(file)
    try {
      const data = await PointHistoryService.parsePointCsv(file)
      setPointHistoryData(data)
    } catch (e) {
      console.error(e)
      setError("Erro ao ler arquivo de pontos: " + e.message)
    } finally {
      setLoading(false)
    }
  }

  const loadClientReport = async () => {
    try {
      setLoading(true)
      const report = await ReportService.getLatestReport()
      if (report) {
        setProcessedData(report.processedData || [])
        setConsultants(report.consultants || [])
        setReportTitle(report.generatedAt)
        // Load locations for map context if needed, but not strictly required if coords in data
        fetchLocations().then(setLocations).catch(e => console.warn(e))
        fetchConsultants().then(setConsultantAddresses).catch(e => console.warn(e))
      } else {
        setError('Nenhum relatório encontrado.')
      }
    } catch (e) {
      console.error(e)
      setError('Erro ao carregar relatório.')
    } finally {
      setLoading(false)
    }
  }


  const loadLocations = async () => {
    try {
      setLoading(true)
      setLoading(true)
      const [locs, consults] = await Promise.all([
        fetchLocations(),
        fetchConsultants()
      ])
      setLocations(locs)
      setConsultantAddresses(consults)
    } catch (err) {
      console.error('Erro ao carregar locais:', err)
      setError('FALHA DE CONEXÃO: SUPABASE_LOCATIONS_DB')
    } finally {
      setLoading(false)
    }
  }

  const handleProcess = async () => {
    if (!solidesFile || !umovmeFile) return;

    setLoading(true)
    setError(null)
    setProcessedData([])
    setConsultants([])
    setSelectedConsultant('TODOS')

    try {
      const rawSolides = await parseCsv(solidesFile)
      const rawUmovme = await parseCsv(umovmeFile)



      const solidesData = processSolidesData(rawSolides)
      const umovmeData = processUmovmeData(rawUmovme)

      // Keep only the EARLIEST entry per Consultant per Date (first check-in of the day only)
      const getEarliestByDate = (list, dateKey, timeKey) => {
        const map = new Map();
        list.forEach(item => {
          const date = item[dateKey];
          const time = item[timeKey];
          const consultant = item.consultor || 'UNKNOWN';
          const key = `${consultant}_${date}`;

          if (!date || !time) return;

          if (!map.has(key)) {
            map.set(key, item);
          } else {
            const existing = map.get(key);
            if (time < existing[timeKey]) {
              map.set(key, item);
            }
          }
        });
        return Array.from(map.values());
      }

      const uniqueSolides = getEarliestByDate(solidesData, 'data', 'entrada');
      const uniqueUmovme = getEarliestByDate(umovmeData, 'dataPrevista', 'checkIn');

      // Match Data
      const results = uniqueSolides.map(ponto => {
        const visit = uniqueUmovme.find(v =>
          v.dataPrevista === ponto.data &&
          (v.consultor && ponto.consultor ? v.consultor.toUpperCase().trim() === ponto.consultor.toUpperCase().trim() : true)
        )

        let storeLocation = null;
        if (visit && visit.local) {
          try {
            // 1. Try matching by Code
            const localCode = String(visit.local).split('-')[0].trim();
            storeLocation = locations.find(l => String(l.codigo_pdv) === localCode);

            // 2. Fallback: Fuzzy Name Match
            if (!storeLocation) {
              const cleanName = String(visit.local).toLowerCase().trim();
              storeLocation = locations.find(l => {
                if (!l.nome_pdv) return false;
                const dbName = String(l.nome_pdv).toLowerCase();
                return dbName.includes(cleanName) || cleanName.includes(dbName);
              });
            }
          } catch (e) {
            console.warn("Error matching row:", visit, e);
          }
        }

        // Safety check for required fields
        if (!ponto || !ponto.data) return null;

        // Calculate Time Difference 1: Solides vs Umovme Realized
        let timeDiff = null;
        if (ponto.entrada && visit && visit.checkIn) {
          try {
            const [h1, m1] = ponto.entrada.split(':').map(Number);
            const [h2, m2] = visit.checkIn.split(':').map(Number);
            if (!isNaN(h1) && !isNaN(h2)) {
              const t1 = h1 * 60 + m1; // Solides (Real)
              const t2 = h2 * 60 + m2; // Umovme (Real Checkin)
              timeDiff = t1 - t2; // Difference in minutes
            }
          } catch (e) { console.warn("Time parse error", e); }
        }

        // Calculate Time Difference 2: Umovme Realized vs Predicted (Delay)
        let umovmeDelay = null;
        if (visit && visit.checkIn && visit.predictedTime) {
          try {
            const [hReal, mReal] = visit.checkIn.split(':').map(Number);
            const [hPred, mPred] = visit.predictedTime.split(':').map(Number);

            if (!isNaN(hReal) && !isNaN(hPred)) {
              const tReal = hReal * 60 + mReal;
              const tPred = hPred * 60 + mPred;
              umovmeDelay = tReal - tPred; // Positive = Late, Negative = Early
            }
          } catch (e) { console.warn("Delay parse error", e); }
        }

        const consultantName = (ponto.consultor || (visit && visit.consultor) || 'N/A').toUpperCase().trim();

        return {
          date: ponto.data || ponto.originalData || 'N/A',
          consultant: consultantName,
          solides: {
            time: ponto.entrada || '-',
            address: ponto.localEntrada || 'Endereço não informado',
            coords: null,
            original: ponto
          },
          umovme: visit ? {
            time: visit.checkIn || '-',
            store: visit.local || 'Local Desconhecido',
            address: visit.endereco || null, // New Address Field
            coords: null, // Placeholder for geocoded coords
            original: visit
          } : null,
          store: {
            name: storeLocation ? storeLocation.nome_pdv : (visit ? visit.local : 'Unknown'),
            bandeira: storeLocation ? storeLocation.bandeira : 'DESCONHECIDO',
            address: storeLocation ? storeLocation.endereco : null
          },
          storeLocation,
          distance: null,
          timeDiff,
          umovmeDelay, // New field
          status: visit ? (storeLocation ? 'MATCHED' : 'STORE_NOT_FOUND') : 'NO_VISIT'
        }
      }).filter(Boolean)

      // Sort by Date (DD/MM/YYYY)
      results.sort((a, b) => {
        try {
          const [d1, m1, y1] = a.date.split('/').map(Number);
          const [d2, m2, y2] = b.date.split('/').map(Number);
          const dateA = new Date(y1, m1 - 1, d1);
          const dateB = new Date(y2, m2 - 1, d2);
          return dateA - dateB;
        } catch (e) { return 0; }
      });

      setProcessedData(results)

      // Extract Unique Consultants
      const uniqueConsultants = [...new Set(results.map(r => r.consultant).filter(c => c && c !== 'N/A'))].sort()
      setConsultants(uniqueConsultants)

    } catch (err) {
      console.error('Erro:', err)
      setError('ERRO DE PROCESSAMENTO DE ARQUIVO. VERIFICAR FORMATO CSV.')
    } finally {
      setLoading(false)
    }
  }

  const handleGeocode = async () => {
    setGeocoding(true)
    // NOTE: We should probably only geocode the filtered data if we want to save resources, 
    // but the user might switch filters. 
    // Ideally we geocode 'processedData' but here we'll iterate on processedData to keep state consistent.
    const updatedData = [...processedData]
    let changes = 0

    for (let i = 0; i < updatedData.length; i++) {
      const row = updatedData[i]

      // 1. Geocode SOLIDES (Actual)
      if (row.solides.address && !row.solides.coords) {
        const coords = await geocodeAddress(row.solides.address)
        if (coords) {
          row.solides.coords = coords
          changes++
        }
      }

      // 2. Geocode UMOVME (Target) - If DB match failed or has no coords (or coords are 0), and we have CSV address
      const dbLat = Number(row.storeLocation?.latitude);
      const hasDbCoords = row.storeLocation && Number.isFinite(dbLat) && dbLat !== 0;

      if (!hasDbCoords && row.umovme && row.umovme.address && !row.umovme.coords) {
        const coords = await geocodeAddress(row.umovme.address);
        if (coords) {
          row.umovme.coords = coords; // Save to umovme object
          changes++;
        }
      }

      // 3. Determine Final Target Coords (DB takes priority, then CSV Geocoded)
      let targetLat = null;
      let targetLng = null;

      if (hasDbCoords) {
        targetLat = Number(row.storeLocation.latitude);
        targetLng = Number(row.storeLocation.longitude);
      } else if (row.umovme && row.umovme.coords) {
        targetLat = row.umovme.coords.lat;
        targetLng = row.umovme.coords.lng;
      }

      // 4. Calculate Distance
      if (row.solides.coords && targetLat !== null && targetLng !== null) {
        const distToStore = calculateDistance(
          Number(row.solides.coords.lat), Number(row.solides.coords.lng),
          targetLat, targetLng
        )
        row.distance = distToStore

        // --- TRAVEL LOGIC START ---
        // Find consultant home
        let consultantHome = consultantAddresses.find(c => {
          if (!c.nome || !row.consultant) return false;
          const nameDb = c.nome.toUpperCase().trim();
          const nameAudit = row.consultant.toUpperCase().trim();

          if (nameDb === nameAudit || nameDb.includes(nameAudit) || nameAudit.includes(nameDb)) return true;

          const blacklisted = ['DOS', 'DAS', 'DE', 'DA', 'DO', 'LOS', 'LAS'];
          const tokensDb = nameDb.split(/\s+/).filter(t => t.length > 2 && !blacklisted.includes(t));
          const tokensAudit = nameAudit.split(/\s+/).filter(t => t.length > 2 && !blacklisted.includes(t));

          const shorter = tokensDb.length <= tokensAudit.length ? tokensDb : tokensAudit;
          const longer = tokensDb.length <= tokensAudit.length ? tokensAudit : tokensDb;

          if (shorter.length === 0) return false;
          const matchCount = shorter.filter(t => longer.includes(t)).length;
          return matchCount >= Math.min(2, shorter.length);
        });

        let travelStatus = null;

        if (consultantHome) {
          if ((!consultantHome.latitude || consultantHome.latitude === 0) && consultantHome.endereco) {
            const homeCoords = await geocodeAddress(consultantHome.endereco);
            if (homeCoords) {
              consultantHome.latitude = homeCoords.lat;
              consultantHome.longitude = homeCoords.lng;
            }
          }

          if (consultantHome.latitude && consultantHome.longitude) {
            const distStoreHome = calculateDistance(
              targetLat, targetLng,
              consultantHome.latitude, consultantHome.longitude
            );

            const distCheckinHome = calculateDistance(
              Number(row.solides.coords.lat), Number(row.solides.coords.lng),
              consultantHome.latitude, consultantHome.longitude
            );

            if (distStoreHome > 20000) { // 20km
              if (distCheckinHome < 2000) { // 2km tolerance for home
                travelStatus = 'TRAVEL_OK';
              } else if (distToStore > 2000) {
                travelStatus = 'TRAVEL_ERROR';
              }
            }
          }
        }
        // --- TRAVEL LOGIC END ---

        if (travelStatus) {
          row.status = travelStatus;
          row.consultantHome = consultantHome ? { lat: consultantHome.latitude, lng: consultantHome.longitude } : null;
        } else if (distToStore > 500) { // Standard 500m tolerance
          row.status = 'DISTANCE_ERROR'
        } else {
          row.status = 'OK'
        }
      } else {
        // Update status if we still don't have target coords
        if (!targetLat && row.status === 'MATCHED') {
          // matched DB but no coords, and no CSV coords
          // keep as MATCHED but distance -
        }
      }
    }

    setProcessedData(updatedData)
    setGeocoding(false)
    if (changes === 0 && updatedData.every(d => d.solides.coords || !d.solides.address)) {
      // All done
    } else if (changes === 0) {
      setError("GEOCODING_API_FAILURE: Verifique API KEY ou Cota.")
    }
  }

  // Helper for Status Badge
  const StatusBadge = ({ status }) => {
    const styles = {
      'OK': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      'MATCHED': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      'DISTANCE_ERROR': 'bg-red-500/10 text-red-400 border-red-500/20',
      'STORE_NOT_FOUND': 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
      'NO_VISIT': 'bg-zinc-800 text-zinc-500 border-zinc-700',
      'TRAVEL_OK': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      'TRAVEL_ERROR': 'bg-orange-500/10 text-orange-400 border-orange-500/20',
      'APPROVED': 'bg-blue-600 text-white border-blue-400 font-bold px-3'
    }
    return (
      <span className={clsx("px-2 py-0.5 text-[10px] font-mono tracking-wider uppercase border", styles[status] || styles['NO_VISIT'])}>
        {status}
      </span>
    )
  }

  // Enhanced data with manual approvals applied
  const finalProcessedData = useMemo(() => {
    return processedData.map(row => {
      const key = `${row.consultant}_${row.date}_${row.solides.time}`;
      if (manualApprovals[key]) {
        return { ...row, status: 'APPROVED' };
      }
      return row;
    });
  }, [processedData, manualApprovals]);

  // Filter Data based on selection
  const filteredData = selectedConsultant === 'TODOS'
    ? finalProcessedData
    : finalProcessedData.filter(d => d.consultant === selectedConsultant)

  // STATUS LEGEND COMPONENT
  const StatusLegend = () => (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-[10px] text-zinc-500 font-mono items-center ml-auto">
      <div className="flex items-center gap-1.5" title="Distância e locais coincidem (dentro de 500m)"><StatusBadge status="OK" /><span className="hidden xl:inline">Bateu (&lt;500m)</span></div>
      <div className="flex items-center gap-1.5" title="Incompatibilidade de distância (> 500m)"><StatusBadge status="DISTANCE_ERROR" /><span className="hidden xl:inline">Fora (&gt;500m)</span></div>
      <div className="flex items-center gap-1.5" title="Em viagem (Distância > 20km da base)"><StatusBadge status="TRAVEL_OK" /><span className="hidden xl:inline">Viagem Válida</span></div>
      <div className="flex items-center gap-1.5" title="Fora da rota de viagem ou localização não confirmada"><StatusBadge status="TRAVEL_ERROR" /><span className="hidden xl:inline">Viagem Inválida</span></div>
      <div className="flex items-center gap-1.5" title="Loja não encontrada no cadastro"><StatusBadge status="STORE_NOT_FOUND" /><span className="hidden xl:inline">Loja Ñ Encontrada</span></div>
      <div className="flex items-center gap-1.5" title="Sem visita no aplicativo Umovme / Check-in ausente"><StatusBadge status="NO_VISIT" /><span className="hidden xl:inline">Falta Check-in</span></div>
      <div className="flex items-center gap-1.5" title="Aprovado manualmente pela auditoria"><StatusBadge status="APPROVED" /><span className="hidden xl:inline">Auditado/Ok</span></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-300 font-sans selection:bg-blue-500/30">

      {/* HEADER */}
      <header className="border-b border-zinc-800 bg-zinc-950/50 backdrop-blur-md sticky top-0 z-50">
        <div className="w-full px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-none transform rotate-45">
              <ShieldCheck size={20} className="text-white transform -rotate-45" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white uppercase">Auditor<span className="text-blue-500">Samsung</span></h1>
              <p className="text-[10px] font-mono text-zinc-500 tracking-widest uppercase">Sistema de Conciliação Geográfica v1.0</p>
            </div>
          </div>

          {/* NAVIGATION MENU */}
          <div className="hidden md:flex items-center bg-zinc-900 border border-zinc-800 p-1 rounded-sm gap-1">
            <button
              onClick={() => setCurrentView('audit')}
              className={clsx("px-4 py-1.5 text-xs font-mono uppercase tracking-wider transition-all",
                currentView === 'audit' ? "bg-zinc-800 text-white font-bold" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              Auditoria
            </button>
            <button
              onClick={() => setCurrentView('insights')}
              className={clsx("px-4 py-1.5 text-xs font-mono uppercase tracking-wider transition-all",
                currentView === 'insights' ? "bg-zinc-800 text-white font-bold" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              Insights
            </button>
            <button
              onClick={() => setCurrentView('point')}
              className={clsx("px-4 py-1.5 text-xs font-mono uppercase tracking-wider transition-all",
                currentView === 'point' ? "bg-zinc-800 text-white font-bold" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              Point
            </button>
            <button
              onClick={() => setCurrentView('resumo')}
              className={clsx("px-4 py-1.5 text-xs font-mono uppercase tracking-wider transition-all flex items-center gap-1.5",
                currentView === 'resumo' ? "bg-purple-600 text-white font-bold" : "text-purple-400/80 hover:text-purple-300 hover:bg-purple-500/10"
              )}
            >
              ✨ Resumo
            </button>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-2 text-zinc-500">
              DBConnection: {locations.length > 0 ? "ONLINE" : "CONNECTING..."}
            </div>
          </div>
        </div>
      </header>

      <main className="w-full px-6 py-8">

        {/* ACTION GRID - Hidden in Resumo view */}
        {currentView !== 'resumo' && <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">

          {/* INPUTS */}
          <div className="lg:col-span-4 space-y-4">
            {/* HIDE UPLOADERS IN CLIENT MODE */}
            {/* HIDE UPLOADERS IN CLIENT MODE */}
            {!isClientMode && currentView !== 'point' && (
              <>
                <div className="bg-zinc-900/50 border border-zinc-800 p-4 relative group hover:border-zinc-700 transition-colors">
                  <div className="absolute top-0 right-0 p-1 bg-zinc-800 text-[10px] text-zinc-400 font-mono opacity-50">INPUT_SOURCE_A</div>
                  <FileUploader label="REGISTRO DE PONTO (SOLIDES)" file={solidesFile} onFileSelect={setSolidesFile} color="blue" />
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 p-4 relative group hover:border-zinc-700 transition-colors">
                  <div className="absolute top-0 right-0 p-1 bg-zinc-800 text-[10px] text-zinc-400 font-mono opacity-50">INPUT_SOURCE_B</div>
                  <FileUploader label="ROTEIRO DE VISITAS (UMOVME)" file={umovmeFile} onFileSelect={setUmovmeFile} color="emerald" />
                </div>
              </>
            )}

            {/* POINT HISTORY UPLOADER */}
            {!isClientMode && currentView === 'point' && (
              <div className="bg-zinc-900/50 border border-zinc-800 p-4 relative group hover:border-zinc-700 transition-colors animate-in fade-in slide-in-from-left-4">
                <div className="absolute top-0 right-0 p-1 bg-zinc-800 text-[10px] text-zinc-400 font-mono opacity-50">INPUT_POINT_HISTORY</div>
                <FileUploader label="HISTÓRICO DE PONTOS (CSV)" file={pointHistoryFile} onFileSelect={handlePointHistoryUpload} color="purple" />
              </div>
            )}

            {/* CONSULTANT FILTER */}
            {consultants.length > 0 && currentView !== 'point' && (
              <div className="bg-zinc-900/50 border border-zinc-800 p-4 relative group hover:border-zinc-700 transition-colors animate-in fade-in slide-in-from-top-4">
                <div className="absolute top-0 right-0 p-1 bg-zinc-800 text-[10px] text-zinc-400 font-mono opacity-50">FILTER_CONTROLS</div>
                <label className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-2 block flex items-center gap-2">
                  <Filter size={12} />
                  Filtrar por Consultor
                </label>
                <div className="relative">
                  <select
                    value={selectedConsultant}
                    onChange={(e) => setSelectedConsultant(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs p-3 rounded-none focus:outline-none focus:border-blue-500 transition-colors appearance-none uppercase font-mono"
                  >
                    <option value="TODOS">TODOS OS CONSULTORES ({consultants.length})</option>
                    <option disabled>------------------------</option>
                    {consultants.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                    <Search size={12} />
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {!isClientMode && currentView !== 'point' && (
                <button
                  onClick={handleProcess}
                  disabled={!solidesFile || !umovmeFile || loading || geocoding} // Disable match
                  className="col-span-2 bg-blue-600 hover:bg-blue-500 text-white p-4 font-bold tracking-widest text-xs uppercase disabled:opacity-20 disabled:cursor-not-allowed transition-all flex justify-center items-center gap-2 group"
                >
                  {loading ? <Loader2 className="animate-spin" /> : <FileSpreadsheet className="group-hover:scale-110 transition-transform" />}
                  Inciar Cruzamento
                </button>
              )}

              {filteredData.length > 0 && !isClientMode && (
                <>
                  <button
                    onClick={handleGeocode}
                    disabled={geocoding}
                    className="col-span-1 bg-zinc-800 hover:bg-zinc-700 text-purple-400 border border-purple-500/20 hover:border-purple-500 p-4 font-bold tracking-widest text-xs uppercase disabled:opacity-20 transition-all flex justify-center items-center gap-2"
                  >
                    {geocoding ? <Loader2 className="animate-spin" /> : <MapPin />}
                    GEOCODIFICAR & CALCULAR
                  </button>
                  <button
                    onClick={async () => {
                      const confirm = window.confirm("Deseja publicar este relatório para o Cliente?");
                      if (!confirm) return;
                      try {
                        setLoading(true);
                        await ReportService.saveReport(processedData, consultants);
                        alert("Relatório Enviado!");
                      } catch (e) {
                        alert("Erro ao enviar: " + e.message);
                      } finally {
                        setLoading(false);
                      }
                    }}
                    disabled={loading}
                    className="col-span-1 bg-emerald-900/50 hover:bg-emerald-800 text-emerald-400 border border-emerald-500/20 hover:border-emerald-500 p-4 font-bold tracking-widest text-xs uppercase disabled:opacity-20 transition-all flex justify-center items-center gap-2"
                  >
                    <Send size={14} />
                    ENVIAR CLIENTE
                  </button>
                </>
              )}
            </div>

            {/* COMPLIANCE RANKING (Only shown in Insights Tab) */}
            {finalProcessedData.length > 0 && currentView === 'insights' && (
              <ComplianceRanking data={finalProcessedData} />
            )}
          </div>



          {/* MAP & STATS */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            {/* STATS BAR */}
            {currentView !== 'point' && currentView !== 'resumo' && <DashboardStats data={filteredData} />}

            {/* CONDITIONAL CONTENT: MAP OR INSIGHTS OR POINT */}
            {currentView === 'audit' ? (
              filteredData.length > 0 ? (
                <MapViewer points={filteredData} />
              ) : (
                <div className="flex-1 bg-zinc-900/30 border border-zinc-800 border-dashed flex flex-col items-center justify-center text-zinc-600 gap-4 min-h-[300px]">
                  <Search size={48} strokeWidth={1} />
                  <span className="font-mono text-xs uppercase tracking-widest">Aguardando Processamento de Dados</span>
                </div>
              )
            ) : currentView === 'insights' ? (
              <InsightsDashboard data={finalProcessedData} />
            ) : currentView === 'resumo' ? null : (
              <PointHistoryViewer data={pointHistoryData} locations={locations} />
            )}
          </div>
        </div>}

        {/* RESUMO FULL-WIDTH VIEW */}
        {currentView === 'resumo' && (
          <div className="border border-zinc-800 bg-zinc-900/30 min-h-[700px] flex flex-col mb-8">
            <ResumoTab data={finalProcessedData} pointHistoryData={pointHistoryData} />
          </div>
        )}


        {/* ERROR MESSAGE */}
        {
          error && (
            <div className="mb-6 p-4 bg-red-950/30 border border-red-500/50 text-red-500 flex items-center gap-3 font-mono text-xs animate-in slide-in-from-top-2">
              <AlertTriangle size={16} />
              <span className="font-bold">SYSTEM_ERROR:</span>
              {error}
            </div>
          )
        }

        {/* DATA GRID (ONLY IN AUDIT VIEW) */}
        {
          currentView === 'audit' && filteredData.length > 0 && (
            <div className="border border-zinc-800 bg-zinc-900/50">
              <div className="p-3 bg-zinc-900 border-b border-zinc-800 flex justify-between items-center gap-4 flex-wrap">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2 whitespace-nowrap">
                  <FileSpreadsheet size={14} />
                  Log de Auditoria
                </h3>
                <StatusLegend />
                <div className="font-mono text-[10px] text-zinc-600 whitespace-nowrap">READ_ONLY</div>
              </div>
              <div className="overflow-x-auto max-h-[600px] scrollbar-thin scrollbar-track-zinc-900 scrollbar-thumb-zinc-700">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-zinc-950 text-zinc-500 text-[10px] uppercase font-mono tracking-wider sticky top-0 z-10">
                    <tr>
                      <th className="p-3 border-b border-zinc-800">Consultor</th>
                      <th className="p-3 border-b border-zinc-800">Data</th>
                      <th className="p-3 border-b border-zinc-800">Check-In Solides</th>
                      <th className="p-3 border-b border-zinc-800 w-1/4">Local Solides (GPS)</th>
                      <th className="p-3 border-b border-zinc-800">Check-In Umovme</th>
                      <th className="p-3 border-b border-zinc-800 w-1/4">Local Umovme (Loja)</th>
                      <th className="p-3 border-b border-zinc-800 text-right">Comparativo (Sol vs Umov)</th>
                      <th className="p-3 border-b border-zinc-800 text-right">Atraso Roteiro</th>
                      <th className="p-3 border-b border-zinc-800 text-right">Distância</th>
                      <th className="p-3 border-b border-zinc-800 text-center">Status</th>
                      <th className="p-3 border-b border-zinc-800 text-center">Auditoria</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-xs divide-y divide-zinc-800/50 text-zinc-400">
                    {filteredData.map((row, idx) => {
                      const isApproved = row.status === 'APPROVED';
                      return (
                        <tr key={idx} className={clsx("hover:bg-zinc-800/50 transition-colors group", isApproved && "bg-blue-900/10")}>
                          <td className="p-3 border-r border-zinc-800/30 font-bold text-zinc-300">{row.consultant}</td>
                          <td className="p-3 text-white border-r border-zinc-800/30">{row.date}</td>

                          <td className="p-3 border-r border-zinc-800/30 text-blue-300">{row.solides.time}</td>
                          <td className="p-3 border-r border-zinc-800/30 max-w-[200px] truncate" title={row.solides.address}>
                            <div className="flex flex-col">
                              <span className="text-zinc-300 truncate">{row.solides.address}</span>
                              {row.solides.coords && <span className="text-[10px] text-emerald-600 flex items-center gap-1"> <Navigation size={8} /> GEOCODED</span>}
                            </div>
                          </td>

                          <td className="p-3 border-r border-zinc-800/30 text-emerald-300">
                            {row.umovme ? row.umovme.time : <span className="text-zinc-700">-</span>}
                          </td>
                          <td className="p-3 border-r border-zinc-800/30 max-w-[250px] truncate">
                            {row.umovme ? (
                              <div className="flex flex-col gap-1">
                                {/* PREDICTED TIME */}
                                {row.umovme && row.umovme.predictedTime && (
                                  <div className="text-[10px] text-zinc-500 font-mono mb-1 border-b border-zinc-800/50 pb-1 flex justify-between">
                                    <span>PREVISTO:</span>
                                    <span className="text-zinc-300">{row.umovme.predictedTime}</span>
                                  </div>
                                )}

                                {/* DB INFO - HIDDEN AS REQUESTED
                            {row.storeLocation ? (
                              <div className="flex flex-col">
                                <span className="text-blue-400 font-bold truncate">DB: {row.storeLocation.nome_pdv}</span>
                                <span className="text-[10px] text-zinc-500">{row.storeLocation.codigo_pdv}</span>
                              </div>
                            ) : (
                              <span className="text-amber-500/70 italic text-[10px]">LOJA NÃO ENCONTRADA NO DB</span>
                            )}
                            */}

                                {/* CSV INFO */}
                                <div className="pt-1 border-t border-zinc-800/50 mt-1">
                                  <span className="text-zinc-400 block truncate" title={row.umovme.store}>
                                    <span className="text-[9px] text-zinc-600 mr-1 uppercase">CSV_LOCAL:</span>
                                    {row.umovme.store}
                                  </span>
                                  {row.umovme.address && (
                                    <span className="text-emerald-500/80 block truncate text-[10px]" title={row.umovme.address}>
                                      <span className="text-[9px] text-emerald-900 mr-1 uppercase">CSV_ADDR (Used for Map):</span>
                                      {row.umovme.address}
                                    </span>
                                  )}
                                </div>

                                {/* STATUS WARNINGS */}
                                {row.storeLocation && !Number.isFinite(row.storeLocation.latitude) && !row.umovme.coords && (
                                  <span className="text-[9px] text-red-500 font-bold bg-red-900/20 px-1 rounded w-fit">SEM COORDENADAS</span>
                                )}
                                {row.umovme.coords && (
                                  <span className="text-[9px] text-emerald-600 font-bold bg-emerald-900/10 px-1 rounded w-fit flex items-center gap-1">
                                    <Navigation size={8} /> GEOCODED FROM CSV
                                  </span>
                                )}
                              </div>
                            ) : <span className="text-zinc-700 italic">N/A</span>}
                          </td>

                          <td className="p-3 border-r border-zinc-800/30 text-right font-mono">
                            {row.timeDiff !== null ? (
                              <div className="flex flex-col items-end">
                                <span className={clsx("font-bold text-xs", Math.abs(row.timeDiff) > 15 ? "text-amber-400" : "text-zinc-400")}>
                                  {(() => {
                                    // Show time without sign, just the duration
                                    const absMins = Math.abs(row.timeDiff);
                                    const h = Math.floor(absMins / 60);
                                    const m = absMins % 60;
                                    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                                  })()}
                                </span>
                                <span className={clsx("text-[9px] uppercase tracking-wider font-bold", row.timeDiff < 0 ? "text-blue-400" : "text-amber-500")}>
                                  {row.timeDiff < 0 ? 'SOLIDES ANTES' : row.timeDiff > 0 ? 'SOLIDES DEPOIS' : 'MESMO MINUTO'}
                                </span>
                              </div>
                            ) : <span className="text-zinc-700">-</span>}
                          </td>

                          <td className="p-3 border-r border-zinc-800/30 text-right font-mono">
                            {row.umovmeDelay !== null ? (
                              <div className="flex flex-col items-end">
                                <span className={clsx("font-bold text-xs", row.umovmeDelay > 0 ? "text-red-400" : "text-zinc-400")}>
                                  {(() => {
                                    const absMins = Math.abs(row.umovmeDelay);
                                    const h = Math.floor(absMins / 60);
                                    const m = absMins % 60;
                                    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                                  })()}
                                </span>
                                <span className={clsx("text-[9px] uppercase tracking-wider font-bold",
                                  row.umovmeDelay < 0 ? "text-blue-400" :
                                    row.umovmeDelay > 0 ? "text-red-500" : "text-emerald-500"
                                )}>
                                  {row.umovmeDelay < 0 ? 'ANTECIPADO' : row.umovmeDelay > 0 ? 'ATRASADO' : 'PONTUAL'}
                                </span>
                              </div>
                            ) : <span className="text-zinc-700 text-[10px]">SEM PREVISÃO</span>}
                          </td>

                          <td className={clsx("p-3 border-r border-zinc-800/30 text-right font-bold", row.distance > 500 ? "text-red-500" : "text-zinc-500")}>
                            {row.distance ? (
                              row.distance < 1000 ? `${Math.round(row.distance)}m` : `${(row.distance / 1000).toFixed(2)}km`
                            ) : '-'}
                          </td>

                          <td className="p-3 border-r border-zinc-800/30 text-center">
                            <StatusBadge status={row.status} />
                          </td>

                          <td className="p-3 text-center">
                            {(row.status === 'DISTANCE_ERROR' || row.status === 'TRAVEL_ERROR' || isApproved) && (
                              <button
                                onClick={() => toggleApproval(row)}
                                className={clsx(
                                  "p-2 transition-all transform active:scale-95",
                                  isApproved ? "text-blue-500" : "text-zinc-700 hover:text-blue-500"
                                )}
                                title={isApproved ? "Remover Aprovação" : "Aprovar Manualmente"}
                              >
                                <CheckCircle2 size={18} fill={isApproved ? "currentColor" : "none"} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        }

      </main >
    </div >
  )
}

export default App
