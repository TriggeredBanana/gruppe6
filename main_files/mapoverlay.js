/**
 * SafeShelter - Kartkontroller
 * Håndterer kartinitialisering og interaktive kartfunksjoner
 */

// Globale variabler for karttilgang fra andre skript
let map;
let searchMarkers;

// Initialiser når DOM er lastet
document.addEventListener('DOMContentLoaded', function() {
    initializeMap();
    setupEventListeners();
});

// Initialiser kart sentrert på Kristiansand-området
function initializeMap() {
    map = L.map('map', {
        fadeAnimation: true,
        zoomAnimation: true
    }).setView([58.1599, 8.0182], 13);
    
    // Oppretter utvalg av kart
    const streetsLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    });
    
    const terrainLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap'
    });
    
    // Lagre basislag for stilbytting
    window.baseLayers = {
        streets: streetsLayer,
        satellite: satelliteLayer,
        terrain: terrainLayer
    };
    
    // Legg til laggrupper for markører
    window.shelterLayer = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 50
    }).addTo(map);
    
    window.fireStationLayer = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 60
    }).addTo(map);
    
    window.floodZoneLayer = L.layerGroup();
    
    // Lag for søkeresultater
    searchMarkers = L.layerGroup().addTo(map);
    
    // Skala-kontroll
    L.control.scale({
        imperial: false,
        position: 'bottomleft'
    }).addTo(map);
    
    // Opprett egendefinerte ikoner
    window.shelterIcon = L.divIcon({
        html: '<div class="shelter-marker-icon"><i class="fas fa-person-shelter"></i></div>',
        iconSize: [30, 30],
        iconAnchor: [15, 30],
        popupAnchor: [0, -30],
        className: ''
    });
    
    window.fireStationIcon = L.divIcon({
        html: '<div class="fire-marker-icon"><i class="fas fa-fire-flame-simple"></i></div>',
        iconSize: [30, 30],
        iconAnchor: [15, 30],
        popupAnchor: [0, -30],
        className: ''
    });
    
    showWelcomePulse();
    
    setTimeout(() => {
        const loadingOverlay = document.getElementById('loading-overlay');
        loadingOverlay.style.opacity = '0';
        setTimeout(() => {
            loadingOverlay.style.display = 'none';
        }, 500);
    }, 1000);
}

// Toggle funksjonalitet for kart og stiler
function setupEventListeners() {

    document.getElementById('toggle-shelters').addEventListener('click', function() {
        this.classList.toggle('active');
        if (this.classList.contains('active')) {
            map.addLayer(window.shelterLayer);
        } else {
            map.removeLayer(window.shelterLayer);
        }
    });
    
    document.getElementById('toggle-firestations').addEventListener('click', function() {
        this.classList.toggle('active');
        if (this.classList.contains('active')) {
            map.addLayer(window.fireStationLayer);
        } else {
            map.removeLayer(window.fireStationLayer);
        }
    });
    
    document.getElementById('toggle-flood-zones').addEventListener('click', function() {
        this.classList.toggle('active');
        if (this.classList.contains('active')) {
            map.addLayer(window.floodZoneLayer);
        } else {
            map.removeLayer(window.floodZoneLayer);
        }
    });
    
    // Kartstilvelger
    document.querySelectorAll('.map-style').forEach(button => {
        button.addEventListener('click', function() {
            const selectedStyle = this.getAttribute('data-style');
            changeMapStyle(selectedStyle);
            
            // Oppdater aktiv knapp
            document.querySelectorAll('.map-style').forEach(b => {
                b.classList.remove('active');
            });
            this.classList.add('active');
        });
    });
    
    // Søkefunksjonalitet
    const searchInput = document.getElementById('search-input');
    const clearSearch = document.getElementById('clear-search');
    
    searchInput.addEventListener('input', debounce(async () => {
        if (searchInput.value.length >= 3) {
            const suggestions = await fetchLocationSuggestions(searchInput.value);
            displaySearchSuggestions(suggestions);
        }
    }, 300));
    
    searchInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') searchLocation(searchInput.value);
    });
    
    clearSearch.addEventListener('click', () => {
        searchInput.value = '';
        searchMarkers.clearLayers();
        document.getElementById('search-suggestions').style.display = 'none';
    });
    
    // Finn nærmeste tilfluktsrom-knapp
    const findNearestBtn = document.getElementById('find-nearest');
    if (findNearestBtn) {
        findNearestBtn.addEventListener('click', findNearestShelter);
    }
    
    // Håndter vindustørrelsesendring
    window.addEventListener('resize', () => map.invalidateSize());
}

// Endre kartstil
function changeMapStyle(style) {
    // Fjern først alle basislag ved å spore hvilket som er aktivt
    map.eachLayer(function(layer) {
        // Sjekk om dette er et flisslag (basiskart)
        if (layer._url && layer._url.includes('tile')) {
            map.removeLayer(layer);
        }
    });
    
    // Legg til det valgte laget som en ny instans
    let newBaseLayer;
    
    switch (style) {
        case 'satellite':
            newBaseLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
            });
            break;
        case 'terrain':
            newBaseLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
                attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap'
            });
            break;
        case 'streets':
        default:
            newBaseLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors'
            });
            break;
    }
    
    // Legg til det nye basislaget og sørg for at det er nederst
    newBaseLayer.addTo(map);
    newBaseLayer.bringToBack();
    
    // Oppdater vår referanse til dette stilens lag
    window.baseLayers[style] = newBaseLayer;
    
    // Vis varsling
    showNotification(`Kartstil endret til ${style}`);
}

// Vis velkomstpulsanimasjon
function showWelcomePulse() {
    const pulseStyle = document.createElement('style');
    pulseStyle.textContent = `
        .map-pulse {
            border-radius: 50%;
            height: 100%;
            width: 100%;
            background: rgba(255, 209, 102, 0.6);
            box-shadow: 0 0 0 0 rgba(255, 209, 102, 0.5);
            transform: scale(0.8);
            animation: pulse-ring 2s infinite;
        }
        
        @keyframes pulse-ring {
            0% { transform: scale(0.5); opacity: 1; }
            70% { transform: scale(2); opacity: 0; }
            100% { transform: scale(0.5); opacity: 0; }
        }
        
        .shelter-marker-icon, .fire-marker-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 100%;
            border-radius: 50%;
        }
        
        .shelter-marker-icon {
            background-color: var(--primary);
            color: white;
        }
        
        .fire-marker-icon {
            background-color: var(--warning);
            color: white;
        }

        .distance-marker {
            background-color: white;
            border: 2px solid #0466c8;
            color: #0466c8;
            padding: 4px 8px;
            border-radius: 12px;
            font-weight: bold;
            font-size: 12px;
            white-space: nowrap;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            text-align: center;
            max-width: 150px;
        }
    `;
    document.head.appendChild(pulseStyle);
    
    const pulseIcon = L.divIcon({
        html: '<div class="map-pulse"></div>',
        className: '',
        iconSize: [70, 70]
    });
    
    const center = map.getCenter();
    const pulseMarker = L.marker([center.lat, center.lng], {
        icon: pulseIcon,
        zIndexOffset: -1000
    }).addTo(map);
    
    setTimeout(() => map.removeLayer(pulseMarker), 2500);
}

// Finn nærmeste tilfluktsrom ved hjelp av nettleser-geolokalisering
function findNearestShelter() {
    showNotification("Finner din posisjon...", "info");
    
    if (!navigator.geolocation) {
        showNotification("Geolokalisering støttes ikke av din nettleser", "error");
        return;
    }
    
    navigator.geolocation.getCurrentPosition(
        function(position) {
            const userLat = position.coords.latitude;
            const userLng = position.coords.longitude;
            
            // Fjern tidligere markører
            searchMarkers.clearLayers();
            
            // Legg til brukerposisjonsmarkør
            const userIcon = L.divIcon({
                html: '<i class="fas fa-user" style="color:#0466c8; font-size:24px;"></i>',
                iconSize: [24, 24],
                iconAnchor: [12, 24]
            });
            
            const userMarker = L.marker([userLat, userLng], {
                icon: userIcon
            })
            .addTo(searchMarkers)
            .bindPopup('<strong>Din posisjon</strong>')
            .openPopup();
            
            showNotification("Posisjon funnet! Finner nærmeste tilfluktsrom...", "success");
            
            // Finn nærmeste tilfluktsrom ved å beregne avstander
            findNearest(userLat, userLng);
        },
        // Feil - callback
        function(error) {
            console.error("Geolokaliseringsfeil:", error);
            let errorMsg;
            
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMsg = "Posisjonstilgang nektet. Vennligst aktiver posisjonstjenester.";
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMsg = "Posisjonsinformasjon er utilgjengelig.";
                    break;
                case error.TIMEOUT:
                    errorMsg = "Forespørsel om posisjon tidsavbrutt.";
                    break;
                default:
                    errorMsg = "En ukjent feil oppstod under henting av posisjon.";
            }
            
            showNotification(errorMsg, "error");
        },

        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

// Finn nærmeste tilfluktsrom ved å beregne avstander
function findNearest(userLat, userLng) {
    // Først sjekk om vi har tilfluktsromdata lastet
    if (!window.shelterLayer || window.shelterLayer.getLayers().length === 0) {
        showNotification("Ingen tilfluktsromdata tilgjengelig", "error");
        return;
    }
    
    let nearestShelter = null;
    let shortestDistance = Infinity;
    
    // Gå gjennom alle tilfluktsrommarkører for å finne den nærmeste
    window.shelterLayer.eachLayer(function(layer) {
        // Hent tilfluktsromposisjon fra markøren
        const shelterLat = layer.getLatLng().lat;
        const shelterLng = layer.getLatLng().lng;
        
        // Beregning av direkte avstand ved hjelp av "Haversine-formelen"
        // Vi bruker dette innledningsvis for å finne det nærmeste tilfluktsrommet
        const directDistance = calculateDistance(userLat, userLng, shelterLat, shelterLng);
        
        // Oppdater nærmeste tilfluktsrom hvis dette er nærmere
        if (directDistance < shortestDistance) {
            shortestDistance = directDistance;
            nearestShelter = layer;
        }
    });
    
    // Hvis et nærmeste tilfluktsrom blir funner, fremheves det og vi henter veiavstand
    if (nearestShelter) {
        const shelterLat = nearestShelter.getLatLng().lat;
        const shelterLng = nearestShelter.getLatLng().lng;
        
        // Vis en midlertidig lasteindikator
        showNotification("Beregner rute til tilfluktsrom...", "info");
        
        // Hent veiavstand og tegn ruten
        getRoadDistanceAndRoute(
            userLat, userLng,
            shelterLat, shelterLng,
            function(routeData) {
                // Tegn ruten på kartet og vis avstand
                displayRouteAndDistance(userLat, userLng, shelterLat, shelterLng, routeData, nearestShelter);
            }
        );
    } else {
        showNotification("Ingen tilfluktsrom funnet i nærheten", "warning");
    }
}

// Hent veiavstand og rute mellom to punkter ved hjelp av OSRM
function getRoadDistanceAndRoute(startLat, startLng, endLat, endLng, callback) {
    // Opprett OSRM API URL
    const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
    
    // Hent rutedata
    fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error('Nettverkssvaret var ikke ok');
            }
            return response.json();
        })
        .then(data => {
            if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
                const route = data.routes[0];
                callback({
                    // Avstand i kilometer
                    distance: route.distance / 1000,
                    // Varighet i minutter
                    duration: Math.round(route.duration / 60),
                    // Rutegeometri som GeoJSON
                    geometry: route.geometry
                });
            } else {
                throw new Error('Ingen rute funnet');
            }
        })
        .catch(error => {
            console.error('Feil ved henting av veiavstand:', error);
            showNotification("Kunne ikke beregne veiavstand. Viser direkte avstand i stedet.", "warning");
            
            // Fall tilbake til direkte avstand
            const directDistance = calculateDistance(startLat, startLng, endLat, endLng);
            callback({
                distance: directDistance,
                duration: Math.round(directDistance * 3), // Grov estimering
                geometry: null
            });
        });
}

// Vis rute og avstand på kartet
function displayRouteAndDistance(userLat, userLng, shelterLat, shelterLng, routeData, nearestShelter) {
    // Formater avstanden pent
    const distanceKm = routeData.distance;
    const distanceText = distanceKm > 1 
        ? `${distanceKm.toFixed(2)} km`
        : `${Math.round(distanceKm * 1000)} m`;
    
    // Formater varigheten
    const durationText = routeData.duration > 60 
        ? `${Math.floor(routeData.duration / 60)} t ${routeData.duration % 60} min` 
        : `${routeData.duration} min`;
    
    // Hvis vi har rutegeometri, tegn ruten
    let routeLine;
    if (routeData.geometry) {
        // Tegn ruten ved hjelp av den returnerte geometrien
        routeLine = L.geoJSON(routeData.geometry, {
            style: {
                color: '#0466c8',
                weight: 5,
                opacity: 0.7,
                lineCap: 'round'
            }
        }).addTo(searchMarkers);
    } else {
        // Faller tilbake til en rett linje hvis ingen rutegeometri
        routeLine = L.polyline([
            [userLat, userLng],
            [shelterLat, shelterLng]
        ], {
            color: '#0466c8',
            weight: 4,
            opacity: 0.7,
            dashArray: '8, 8',
            lineCap: 'round'
        }).addTo(searchMarkers);
    }

    // Finn et punkt langs ruten for avstandsmarkøren
    let midpoint;

    if (routeData.geometry && routeData.geometry.coordinates && routeData.geometry.coordinates.length > 0) {
        // For ruter med geometri, få et punkt omtrent halvveis langs stien
        const coords = routeData.geometry.coordinates;
        const midIndex = Math.floor(coords.length / 2);
        // Merk: GeoJSON-format bruker [lengdegrad, breddegrad] rekkefølge
        midpoint = [coords[midIndex][1], coords[midIndex][0]];
    } else {
        // Fallback til direkte midtpunkt for rette linjer
        midpoint = [
            (userLat + shelterLat) / 2,
            (userLng + shelterLng) / 2
        ];
    }

    // Legg til avstands- og tidsmarkør
    L.marker(midpoint, {
        icon: L.divIcon({
            html: `<div class="distance-marker">${distanceText} (${durationText})</div>`,
            className: '',
            iconSize: [120, 30]
        })
    }).addTo(searchMarkers);
    
    // Åpne popup for nærmeste tilfluktsrom
    nearestShelter.openPopup();
    
    // Juster visningen for å se både bruker og tilfluktsrom
    const bounds = L.latLngBounds([
        [userLat, userLng],
        [shelterLat, shelterLng]
    ]);
    map.fitBounds(bounds, { 
        padding: [300, 300],
        maxZoom: 14,
        animate: true,
        duration: 1
    });
    
    // Vis suksessmelding
    showNotification(`Fant nærmeste tilfluktsrom (${distanceText}, omtrent ${durationText} med bil)`, "success");
    
    // Utløs et klikk på det nærmeste tilfluktsrommet for å vise detaljene i sidefeltet
    nearestShelter.fire('click');
}

// Beregn avstand mellom to punkter ved hjelp av "Haversine-formelen"
function calculateDistance(lat1, lon1, lat2, lon2) {
    // Jordens radius i kilometer
    const R = 6371;
    
    // Konverter grader til radianer
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    
    // Haversine-formel
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c; // Avstand i kilometer
    
    return distance;
}

// Hent posisjonsforslag fra OpenStreetMap
async function fetchLocationSuggestions(query) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
        if (!response.ok) throw new Error(`HTTP-feil: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('Søkeforslagsfeil:', error);
        return [];
    }
}

// Vis søkeforslag-nedtrekksmeny
function displaySearchSuggestions(results) {
    const container = document.getElementById('search-suggestions');
    container.innerHTML = '';
    
    if (results.length === 0) {
        container.style.display = 'none';
        return;
    }
    
    results.forEach(result => {
        const item = document.createElement('li');
        item.className = 'search-suggestion-item';
        item.textContent = result.display_name;
        
        item.addEventListener('click', () => {
            document.getElementById('search-input').value = result.display_name;
            container.style.display = 'none';
            searchLocation(result.display_name);
        });
        
        container.appendChild(item);
    });
    
    container.style.display = 'block';
}

// Søk etter en posisjon og vis den på kartet
async function searchLocation(query) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error(`HTTP-feil: ${response.status}`);
        
        const data = await response.json();
        
        if (data.length > 0) {
            const result = data[0];
            const lat = parseFloat(result.lat);
            const lon = parseFloat(result.lon);
            
            // Fjern tidligere søkemarkører
            searchMarkers.clearLayers();
            
            // Legg til markør for søkeresultat
            const marker = L.marker([lat, lon])
                .addTo(searchMarkers)
                .bindPopup(`<strong>${result.display_name}</strong>`)
                .openPopup();
            
            // Flytt kartet til søkeresultat
            map.flyTo([lat, lon], 14, {
                animate: true,
                duration: 1
            });
            
            showNotification("Posisjon funnet!", "success");
        } else {
            showNotification("Ingen resultater funnet for søket ditt", "warning");
        }
    } catch (error) {
        console.error('Søkefeil:', error);
        showNotification("Feil ved søk etter posisjon", "error");
    }
}

// Hjelpefunksjon for debouncing
function debounce(func, delay) {
    let timeout;
    return function() {
        const context = this;
        const args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

// Gjør kart og funksjoner tilgjengelig globalt
window.map = map;
window.searchLocation = searchLocation;
window.findNearestShelter = findNearestShelter;
window.changeMapStyle = changeMapStyle;