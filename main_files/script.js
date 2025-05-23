/**
 * SafeShelter - Databehandlingsmodul
 * Håndterer datahenting, prosessering og visualisering på kartet
 */

document.addEventListener('DOMContentLoaded', function () {
    initializeDataLoading();
    loadEmergencyData();
});

let userPosition = null;
window.fireStationsData = [];

if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
        pos => userPosition = pos.coords,
        err => console.warn("Geolocation feilet:", err)
    );
}

initializeDataLoading();
loadEmergencyData();

// Initialiser datainnlasting med visuell tilbakemelding
function initializeDataLoading() {
    if (document.querySelector('.stats-panel')) {
        document.querySelector('.stats-panel').innerHTML = `
            <h3>Laster data</h3>
            <div class="stat-card">
                <div class="loading-indicator">
                    <div class="loading-bar"></div>
                </div>
                <div class="stat-label">Henter nødressurser...</div>
            </div>
        `;
    }

    // Legg til stiler for innlastingsindikator
    const styleEl = document.createElement('style');
    styleEl.id = 'loading-indicator-style';
    styleEl.textContent = `
        .loading-indicator {
            height: 6px;
            width: 100%;
            background-color: var(--gray-200);
            border-radius: 3px;
            overflow: hidden;
            margin-bottom: 10px;
        }
        
        .loading-bar {
            height: 100%;
            width: 30%;
            background-color: var(--primary);
            border-radius: 3px;
            animation: loading 1.5s infinite ease-in-out;
        }
        
        @keyframes loading {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(400%); }
        }
    `;
    document.head.appendChild(styleEl);
}

async function loadEmergencyData() {
    try {
        // ─── 1) Backend-data ─────────────────────────────────────────
        const [shelters, fireStations] = await Promise.all([
            fetchShelterData(),
            fetchFireStationData()
        ]);

        // Behandle og vis data på kartet
        if (shelters && shelters.length > 0) {
            processShelterData(shelters);
        }

        if (fireStations && fireStations.length > 0) {
            processFireStationData(fireStations);
        }

        // Oppdater statistikkpanelet med antall
        updateStatistics(shelters.length, fireStations.length);

        document.getElementById('loading-indicator-style')?.remove();
        if (typeof showNotification === 'function') {
            showNotification("Alle nødressurser lastet inn", "success");
        }

        // ─── 2) Overpass‐query med gruppe for node+way+relation ───────
        // Sykehus‐Overpass i Agder
        const bboxQuery = `
        [out:json][timeout:25];
        (
          node["amenity"="hospital"](57.6,6.6,59.3,9.5);
          way["amenity"="hospital"](57.6,6.6,59.3,9.5);
          relation["amenity"="hospital"](57.6,6.6,59.3,9.5);
        );
        out center;
    `;      


        const overpassUrl =
            'https://overpass-api.de/api/interpreter?data=' +
            encodeURIComponent(bboxQuery);

        console.log('Overpass URL:', overpassUrl);
        const resHosp = await fetch(overpassUrl);
        console.log('Overpass status:', resHosp.status);
        if (!resHosp.ok) throw new Error(`Overpass feilet: ${resHosp.status}`);

        const hospText = await resHosp.text();
        console.log('Overpass svar (før parse):', hospText.slice(0, 200));
        const hospData = JSON.parse(hospText);
        console.log('Antall sykehus‐elementer:', hospData.elements.length);

        // ─── 3) Tegn sykehusene ────────────────────────────────────────
        const features = hospData.elements
            .filter(el => ["node", "way", "relation"].includes(el.type))
            .map(el => {
                const lat = el.lat ?? el.center?.lat;
                const lon = el.lon ?? el.center?.lon;
                if (lat == null || lon == null) return null;
                return {
                    type: "Feature",
                    geometry: { type: "Point", coordinates: [lon, lat] },
                    properties: { name: el.tags?.name || "Uten navn" }
                };
            })
            .filter(Boolean);

        console.log('Antall konverterte GeoJSON-features:', features.length);

        if (!window.sykehusLayer) {
            console.error('sykehusLayer er ikke definert!');
            return;
        }
        window.sykehusLayer.clearLayers();
        window.sykehusLayer.addData(features);

    } catch (error) {
        console.error('Feil ved lasting av sykehusdata:', error);
        if (typeof showNotification === 'function') {
            showNotification("Feil ved lasting av sykehus-data", "error");
        }
    }
}




// Hent tilfluktsromdata fra backend
async function fetchShelterData() {
    try {
        const response = await fetch("http://localhost:5000/api/tilfluktsrom_agder");

        if (!response.ok) {
            throw new Error(`Kunne ikke hente tilfluktsromdata: ${response.status}`);
        }

        const data = await response.json();
        console.log(`Hentet ${data.length} tilfluktsrom`);
        return data;
    } catch (error) {
        console.error('Feil ved henting av tilfluktsromdata:', error);
        if (typeof showNotification === 'function') {
            showNotification("Kunne ikke laste inn tilfluktsromdata", "error");
        }
        return [];
    }
}

// Hent brannstasjonsdata fra backend
async function fetchFireStationData() {
    try {
        const response = await fetch("http://localhost:5000/api/brannstasjoner_agder");

        if (!response.ok) {
            throw new Error(`Kunne ikke hente brannstasjonsdata: ${response.status}`);
        }

        const data = await response.json();
        fireStationsData = data; // Lagre data i global variabel for senere bruk
        console.log(`Hentet ${data.length} brannstasjoner`);
        return data;
    } catch (error) {
        console.error('Feil ved henting av brannstasjonsdata:', error);
        if (typeof showNotification === 'function') {
            showNotification("Kunne ikke laste inn brannstasjonsdata", "error");
        }
        return [];
    }
}

// Behandle tilfluktsromdata og legg til på kartet
function processShelterData(shelters) {
    if (window.shelterLayer) {
        window.shelterLayer.clearLayers();
    }
    // Sett opp koordinattransformasjon (UTM sone 32N til WGS84)
    proj4.defs('EPSG:25832', '+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

    let totalCapacity = 0;

    // Behandle hvert tilfluktsrom
    shelters.forEach(shelter => {
        // Hent ut koordinater
        const coordinates = extractCoordinates(shelter.geom);

        if (coordinates && shelter.adresse) {
            // Legg til tilfluktsromkapasitet til totalen (hvis tilgjengelig)
            if (shelter.plasser && !isNaN(parseInt(shelter.plasser))) {
                totalCapacity += parseInt(shelter.plasser);
            }

            // Lag markør med egendefinert ikon (definert i mapoverlay.js)
            const marker = L.marker([coordinates.latitude, coordinates.longitude], {
                icon: window.shelterIcon || createDefaultIcon('shelter')
            }).addTo(window.shelterLayer);

            // Lag informativ popup
            marker.bindPopup(`
                <div class="location-popup">
                    <h4>Offentlig tilfluktsrom</h4>
                    <div class="popup-detail">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>${shelter.adresse || 'Adresse ikke spesifisert'}</span>
                    </div>
                    <div class="popup-detail">
                        <i class="fas fa-users"></i>
                        <span>Kapasitet: ${shelter.plasser || 'Ukjent'}</span>
                    </div>
                    <div class="popup-actions">
                        <button onclick="getDirectionsToLocation(
                            ${coordinates.latitude}, 
                            ${coordinates.longitude}, 
                            'Offentlig tilfluktsrom - ${shelter.adresse?.replace(/'/g, "\\'") || "Adresse ikke spesifisert"}'
                        )">
                            <i class="fas fa-route"></i> Få veibeskrivelse
                        </button>
                    </div>
                </div>
            `);

            // Legg til sveve-effekt
            marker.on('mouseover', function () {
                this._icon.classList.add('marker-hover');
            });

            marker.on('mouseout', function () {
                this._icon.classList.remove('marker-hover');
            });
        }
    });

    window.shelterCapacity = totalCapacity;

    // Legg til stil for markør-sveve-effekt
    addMarkerStyles();
}

// Behandle brannstasjonsdata og legg til på kartet
function processFireStationData(fireStations) {
    if (window.fireStationLayer) {
        window.fireStationLayer.clearLayers();
    }
    
    // Sett opp UTM til WGS84-transformasjon hvis nødvendig
    if (!proj4.defs['EPSG:25832']) {
        proj4.defs('EPSG:25832', '+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
    }

    // Behandle hver brannstasjon
    fireStations.forEach(station => {
        // Hent ut koordinater
        const coordinates = extractCoordinatesUTM(station.geom);

        if (coordinates && station.sted) {
            // Lag markør med egendefinert ikon
            const marker = L.marker([coordinates.latitude, coordinates.longitude], {
                icon: window.fireStationIcon || createDefaultIcon('fire')
            }).addTo(window.fireStationLayer);

            // Lag detaljert popup
            marker.bindPopup(`
                <div class="location-popup">
                    <h4>Brannstasjon: ${station.sted}</h4>
                    <div class="popup-detail">
                        <i class="fas fa-building"></i>
                        <span>${station.brannvesen || 'Brannvesen'}</span>
                    </div>
                    <div class="popup-detail">
                        <i class="fas fa-info-circle"></i>
                        <span>Type: ${station.stasjonstype || 'Standard'}</span>
                    </div>
                    <div class="popup-actions">
                        <button onclick="getDirectionsToLocation(
                            ${coordinates.latitude}, 
                            ${coordinates.longitude}, 
                            'Brannstasjon: ${station.sted?.replace(/'/g, "\\'")}'
                        )">
                            <i class="fas fa-route"></i> Få veibeskrivelse
                        </button>
                    </div>
                </div>
            `);

            // Legg til sveve-effekt
            marker.on('mouseover', function () {
                this._icon.classList.add('marker-hover');
            });

            marker.on('mouseout', function () {
                this._icon.classList.remove('marker-hover');
            });
        }
    });
}

// Hent koordinater fra geometriobjekt med feilhåndtering
function extractCoordinates(geom) {
    try {
        if (!geom) return null;

        // Håndter ulike geometriformater
        if (typeof geom === 'string') {
            try {
                geom = JSON.parse(geom);
            } catch (e) {
                console.warn('Kunne ikke tolke geometristreng:', geom);
                return null;
            }
        }

        // Punktgeometri
        if (geom.type === "Point" && Array.isArray(geom.coordinates)) {
            // Sjekk om koordinater trenger transformasjon
            const [x, y] = geom.coordinates;

            // Sjekk om koordinater er i UTM (større verdier)
            if (Math.abs(x) > 180 || Math.abs(y) > 90) {
                return transformUTMToWGS84(x, y);
            }

            // Om koordinater ser ut til å være i WGS84 allerede
            return { latitude: y, longitude: x };
        }

        console.warn('Geometritype ikke støttet:', geom.type);
        return null;
    } catch (error) {
        console.error('Feil ved utvinning av koordinater:', error, geom);
        return null;
    }
}

// Hent UTM-koordinater og transformer til WGS84
function extractCoordinatesUTM(geom) {
    try {
        if (!geom || !geom.type || !geom.coordinates || !Array.isArray(geom.coordinates)) {
            return null;
        }

        // Hent x og y fra koordinater
        const [x, y] = geom.coordinates;

        return transformUTMToWGS84(x, y);
    } catch (error) {
        console.error('Feil ved utvinning av UTM-koordinater:', error);
        return null;
    }
}

// Transformer UTM-koordinater til WGS84
function transformUTMToWGS84(x, y) {
    try {
        // Transformer fra UTM til WGS84
        const wgs84 = proj4('EPSG:25832', 'WGS84', [x, y]);

        // Returner som breddegrad/lengdegrad-objekt for Leaflet
        return {
            latitude: wgs84[1],  // Breddegrad er Y-koordinat i WGS84
            longitude: wgs84[0]  // Lengdegrad er X-koordinat i WGS84
        };
    } catch (error) {
        console.error('Transformasjonsfeil:', error);
        return null;
    }
}

// Lag standardikon hvis egendefinerte ikoner ikke er tilgjengelige
function createDefaultIcon(type) {
    let className, color, icon;

    if (type === 'shelter') {
        className = 'shelter-marker-icon';
        color = '#e63946';
        icon = 'fa-home';
    } else if (type === 'hospital') {
        className = 'hospital-marker-icon';
        color = '#2a9d8f'; // trygg grønn
        icon = 'fa-hospital';
    } else {
        className = 'fire-marker-icon';
        color = '#ff9f1c';
        icon = 'fa-fire';
    }

    return L.divIcon({
        html: `<div class="${className}"><i class="fas ${icon}"></i></div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 30],
        popupAnchor: [0, -30],
        className: ''
    });
}

// Oppdater statistikkpanelet med dataantall
function updateStatistics(shelterCount, fireStationCount) {
    // Finn elementer
    const statsPanel = document.querySelector('.stats-panel');
    const totalSheltersEl = document.getElementById('total-shelters');
    const totalCapacityEl = document.getElementById('total-capacity');
    const fireStationsEl = document.getElementById('fire-stations');

    // Hvis statistikkpanelet finnes, oppdater det
    if (statsPanel) {
        statsPanel.innerHTML = `
            <h3>Tilfluktsromoversikt</h3>
            <div class="stat-card">
                <div class="stat-value" id="total-shelters">${shelterCount}</div>
                <div class="stat-label">Totalt antall tilfluktsrom</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="total-capacity">${window.shelterCapacity || 0}</div>
                <div class="stat-label">Total kapasitet</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="fire-stations">${fireStationCount}</div>
                <div class="stat-label">Brannstasjoner</div>
            </div>
        `;
    } else {
        // Oppdater individuelle elementer hvis de finnes
        if (totalSheltersEl) totalSheltersEl.textContent = shelterCount;
        if (totalCapacityEl) totalCapacityEl.textContent = window.shelterCapacity || 0;
        if (fireStationsEl) fireStationsEl.textContent = fireStationCount;
    }

    // Hvis UI.js har animert tellerfunksjon, bruk den
    if (typeof window.animateNumber === 'function') {
        if (totalSheltersEl) window.animateNumber(totalSheltersEl, 0, shelterCount, 1500);
        if (totalCapacityEl) window.animateNumber(totalCapacityEl, 0, window.shelterCapacity || 0, 2000);
        if (fireStationsEl) window.animateNumber(fireStationsEl, 0, fireStationCount, 1500);
    }
}

// Håndter valg av plassering fra kartet
window.selectLocation = function (location) {
    // Lagre den valgte plasseringen i en global variabel som backup
    window.selectedLocation = location;

    // Hvis UI.js har en funksjon for å oppdatere plasseringsinformasjon, bruk den
    if (typeof window.updateLocationInfo === 'function') {
        window.updateLocationInfo(location);
    } else {
        console.log('Valgt plassering:', location);

        // Vis plasseringsinformasjon i sidefeltet hvis det finnes en beholder for det
        const detailsContainer = document.getElementById('selected-location-details');

        if (detailsContainer) {
            let detailsHTML = '';

            if (location.type === 'shelter') {
                detailsHTML = `
                    <div class="location-details">
                        <h4>${location.name || 'Offentlig tilfluktsrom'}</h4>
                        <p><strong>Adresse:</strong> ${location.address}</p>
                        <p><strong>Kapasitet:</strong> ${location.capacity}</p>
                    </div>
                `;
            } else if (location.type === 'firestation') {
                detailsHTML = `
                    <div class="location-details">
                        <h4>${location.name}</h4>
                        <p><strong>Adresse:</strong> ${location.address}</p>
                        <p><strong>Type:</strong> ${location.stationType}</p>
                    </div>
                `;
            }

            detailsContainer.innerHTML = detailsHTML;
        }
    }

    // Sentrer kartet på den valgte plasseringen
    if (window.map) {
        window.map.flyTo([location.lat, location.lng], 16, {
            animate: true,
            duration: 1
        });
    }
};

// Legg til stiler for markører og popups
function addMarkerStyles() {
    // Sjekk om stilene allerede eksisterer
    if (document.getElementById('marker-styles')) return;

    const styleEl = document.createElement('style');
    styleEl.id = 'marker-styles';
    styleEl.textContent = `
        .location-popup h4 {
            margin: 0 0 10px;
            color: var(--primary);
        }
        
        .popup-detail {
            display: flex;
            align-items: center;
            margin-bottom: 5px;
        }
        
        .popup-detail i {
            width: 20px;
            margin-right: 8px;
            color: var(--gray-600);
        }
        
        .popup-actions {
            margin-top: 10px;
            display: flex;
            justify-content: center;
        }
        
        .popup-actions button {
            background: var(--primary);
            border: none;
            color: white;
            padding: 5px 10px;
            border-radius: 4px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: 0.9rem;
        }
        
        .marker-hover {
            transform: scale(1.1);
            filter: drop-shadow(0 0 3px rgba(0,0,0,0.3));
            transition: all 0.2s ease-out;
        }
        
        .shelter-marker-icon, .fire-marker-icon {
            transition: all 0.2s ease-out;
        }
    `;
    document.head.appendChild(styleEl);
}

function haversineDistance([lat1, lon1], [lat2, lon2]) {
    const toRad = v => v * Math.PI/180;
    const R = 6371; // jordens radius i km
    const dLat = toRad(lat2 - lat1),
          dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2
            + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2))
            * Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }
  