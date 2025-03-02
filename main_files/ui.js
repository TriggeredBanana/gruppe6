/**
 * SafeShelter - UI-kontrollmodul
 * Håndterer alle UI-interaksjoner, animasjoner og tilstandshåndtering
 */

document.addEventListener('DOMContentLoaded', function() {
    // Initialiser systemtilstand
    let state = {
        sidebarVisible: true,
        darkMode: localStorage.getItem('darkMode') === 'true',
        isFullscreen: false,
        activeTourStep: 0,
        selectedLocation: null,
        statistics: {
            totalShelters: 0,
            totalCapacity: 0,
            fireStations: 0
        }
    };

    // Omvisningstrinninnhold
    const tourSteps = [
        {
            title: "Velkommen til SafeShelter",
            text: "Dette verktøyet hjelper deg med å lokalisere tilfluktsrom og brannstasjoner under krisesituasjoner.",
            highlight: null
        },
        {
            title: "Kartnavigasjon",
            text: "Bruk kartet for å finne tilfluktsrom og brannstasjoner i ditt område. Klikk på en markør for å se detaljer.",
            highlight: "#map"
        },
        {
            title: "Hurtigsøk",
            text: "Bruk søkefeltet til å finne spesifikke adresser eller steder.",
            highlight: "#search-container"
        },
        {
            title: "Lagkontroller",
            text: "Slå av og på ulike kartlag og informasjonsvisning med disse kontrollene.",
            highlight: "#map-controls"
        },
        {
            title: "Tilfluktsrominformasjon",
            text: "Velg et tilfluktsrom eller en brannstasjon på kartet for å se detaljert informasjon i dette panelet.",
            highlight: "#shelter-info"
        },
        {
            title: "Nødhandlinger",
            text: "Bruk disse knappene til raskt å finne nærmeste tilfluktsrom eller få veibeskrivelser i nødsituasjoner.",
            highlight: ".action-buttons"
        }
    ];

    // DOM-elementer
    const sidebar = document.getElementById('sidebar');
    const themeToggle = document.getElementById('theme-toggle');
    const fullscreenToggle = document.getElementById('fullscreen-toggle');
    const infoButton = document.getElementById('info-button');
    const findNearestBtn = document.getElementById('find-nearest');
    const directionsBtn = document.getElementById('directions-button');
    const clearSearchBtn = document.getElementById('clear-search');
    const searchInput = document.getElementById('search-input');
    const loadingOverlay = document.getElementById('loading-overlay');
    const selectedLocationDetails = document.getElementById('selected-location-details');
    const tourOverlay = document.getElementById('tour-overlay');
    const tourStepText = document.getElementById('tour-step-text');
    const tourNextBtn = document.getElementById('tour-next');
    const tourSkipBtn = document.getElementById('tour-skip');

    // Statistikkelementer
    const totalSheltersEl = document.getElementById('total-shelters');
    const totalCapacityEl = document.getElementById('total-capacity');
    const fireStationsEl = document.getElementById('fire-stations');

    // Kartstilknapper
    const mapStyleButtons = document.querySelectorAll('.map-style');

    // Initialiser UI-tilstand
    function initUI() {
        // Bruk mørk modus hvis lagret
        if (state.darkMode) {
            document.body.classList.add('dark-mode');
            themeToggle.querySelector('i').classList.remove('fa-moon');
            themeToggle.querySelector('i').classList.add('fa-sun');
        }

        // Skjul lastings-overlegg med animasjon
        setTimeout(() => {
            loadingOverlay.style.opacity = '0';
            setTimeout(() => {
                loadingOverlay.style.display = 'none';
            }, 500);
        }, 1000);

        // Start omvisning automatisk hvis første besøk
        if (!localStorage.getItem('tourCompleted')) {
            startTour();
        }

        // Initialiser statistikk med animasjon
        updateStatistics({
            totalShelters: 47,
            totalCapacity: 12500,
            fireStations: 23
        }, true);
    }

    // Hendelselyttere

    const logoText = document.querySelector('.logo h2');
    if (logoText) {
        logoText.style.cursor = 'pointer';
        logoText.addEventListener('click', function() {
            window.location.reload();
        });
    }

    // Mørk modus-veksling
    themeToggle.addEventListener('click', function() {
        state.darkMode = !state.darkMode;
        document.body.classList.toggle('dark-mode');
        
        // Oppdater ikon
        const icon = themeToggle.querySelector('i');
        if (state.darkMode) {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
        } else {
            icon.classList.remove('fa-sun');
            icon.classList.add('fa-moon');
        }
        
        // Lagre preferanse
        localStorage.setItem('darkMode', state.darkMode);
    });

    // Fullskjermveksling
    fullscreenToggle.addEventListener('click', function() {
        state.isFullscreen = !state.isFullscreen;
        
        if (state.isFullscreen) {
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen();
            } else if (document.documentElement.mozRequestFullScreen) {
                document.documentElement.mozRequestFullScreen();
            } else if (document.documentElement.webkitRequestFullscreen) {
                document.documentElement.webkitRequestFullscreen();
            } else if (document.documentElement.msRequestFullscreen) {
                document.documentElement.msRequestFullscreen();
            }
            fullscreenToggle.querySelector('i').classList.remove('fa-expand');
            fullscreenToggle.querySelector('i').classList.add('fa-compress');
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
            fullscreenToggle.querySelector('i').classList.remove('fa-compress');
            fullscreenToggle.querySelector('i').classList.add('fa-expand');
        }
    });

    // Info-knapp - starter omvisning
    infoButton.addEventListener('click', function() {
        startTour();
    });

    // Finn nærmeste tilfluktsrom
    findNearestBtn.addEventListener('click', function() {
        // Legg til pulseringsanimasjon midlertidig på knappen
        findNearestBtn.classList.add('pulse-action');
        setTimeout(() => findNearestBtn.classList.remove('pulse-action'), 1500);
        
        // Kall funksjonen fra mapoverlay.js
        window.findNearestShelter();
    });

    // Få veibeskrivelser
    directionsBtn.addEventListener('click', function() {
        if (!state.selectedLocation) {
            showNotification("Velg først et tilfluktsrom eller en brannstasjon", "warning");
            return;
        }
        
        // Lag en Google Maps veibeskrivelse-URL
        const url = `https://www.google.com/maps/dir/?api=1&destination=${state.selectedLocation.lat},${state.selectedLocation.lng}`;
        window.open(url, '_blank');
    });

    // Tøm søk
    clearSearchBtn.addEventListener('click', function() {
        searchInput.value = '';
        searchMarkers.clearLayers();
    });

    // Kartstilknapper
    mapStyleButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Fjern aktiv klasse fra alle knapper
            mapStyleButtons.forEach(b => b.classList.remove('active'));
            
            // Legg til aktiv klasse på klikket knapp
            button.classList.add('active');
            
            // Endre kartstil ved å bruke funksjonen fra mapoverlay.js
            const style = button.getAttribute('data-style');
            window.changeMapStyle(style);
        });
    });

    // Omvisningskontroller
    tourNextBtn.addEventListener('click', function() {
        nextTourStep();
    });

    tourSkipBtn.addEventListener('click', function() {
        endTour();
    });

    // Funksjoner

    // Vis en varsling i høyre hjørne
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type} slide-in-right`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas ${getIconForType(type)}"></i>
                <span>${message}</span>
            </div>
        `;
        
        // Legg til i DOM og fjern etter en forsinkelse
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('slide-out-right');
            setTimeout(() => {
                notification.remove();
            }, 500);
        }, 4000);
        
        function getIconForType(type) {
            switch(type) {
                case 'success': return 'fa-check-circle';
                case 'warning': return 'fa-exclamation-triangle';
                case 'error': return 'fa-times-circle';
                case 'info':
                default: return 'fa-info-circle';
            }
        }
    }

    window.showNotification = showNotification;

    // Oppdater tilfluktsrom/stasjons-informasjonspanel
    function updateLocationInfo(location) {
        state.selectedLocation = location;
        
        // Lag detaljert HTML
        let detailsHTML = '';
        
        if (location.type === 'shelter') {
            detailsHTML = `
                <div class="location-details slide-in-right">
                    <h4>${location.name || 'Offentlig tilfluktsrom'}</h4>
                    <div class="detail-row">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>${location.address}</span>
                    </div>
                    <div class="detail-row">
                        <i class="fas fa-users"></i>
                        <span>Kapasitet: ${location.capacity || 'Ukjent'}</span>
                    </div>
                    <div class="detail-row">
                        <i class="fas fa-door-open"></i>
                        <span>Tilgang: ${location.access || 'Ikke spesifisert'}</span>
                    </div>
                    <div class="emergency-note">
                        <i class="fas fa-exclamation-circle"></i>
                        <span>I nødsituasjoner, følg offisielle evakueringsinstruksjoner.</span>
                    </div>
                    <div class="action-row">
                        <button class="small-btn" onclick="centerMapOn([${location.lat}, ${location.lng}])">
                            <i class="fas fa-crosshairs"></i> Sentrer
                        </button>
                    </div>
                </div>
            `;
        } else if (location.type === 'firestation') {
            detailsHTML = `
                <div class="location-details slide-in-right">
                    <h4>${location.name}</h4>
                    <div class="detail-row">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>${location.address}</span>
                    </div>
                    <div class="detail-row">
                        <i class="fas fa-building"></i>
                        <span>Type: ${location.stationType}</span>
                    </div>
                    <div class="detail-row">
                        <i class="fas fa-phone-alt"></i>
                        <span>Nødnummer: 110</span>
                    </div>
                    <div class="action-row">
                        <button class="small-btn" onclick="centerMapOn([${location.lat}, ${location.lng}])">
                            <i class="fas fa-crosshairs"></i> Sentrer
                        </button>
                    </div>
                </div>
            `;
        }
        
        selectedLocationDetails.innerHTML = detailsHTML;
    }

    // Eksporter updateLocationInfo til global bruk
    window.updateLocationInfo = updateLocationInfo;


    // Oppdater statistikk med animasjon
    function updateStatistics(stats, animate = false) {
        state.statistics = { ...state.statistics, ...stats };
        
        if (animate) {
            animateNumber(totalSheltersEl, 0, stats.totalShelters, 1500);
            animateNumber(totalCapacityEl, 0, stats.totalCapacity, 2000);
            animateNumber(fireStationsEl, 0, stats.fireStations, 1500);
        } else {
            totalSheltersEl.textContent = stats.totalShelters;
            totalCapacityEl.textContent = stats.totalCapacity;
            fireStationsEl.textContent = stats.fireStations;
        }
    }

    // Animer tall som telles opp
    function animateNumber(element, start, end, duration) {
        let startTime = null;
        
        function animation(currentTime) {
            if (!startTime) startTime = currentTime;
            const elapsedTime = currentTime - startTime;
            const progress = Math.min(elapsedTime / duration, 1);
            const value = Math.floor(progress * (end - start) + start);
            
            element.textContent = value.toLocaleString();
            
            if (progress < 1) {
                requestAnimationFrame(animation);
            }
        }
        
        requestAnimationFrame(animation);
    }

    // Omvisningsfunksjoner
    function startTour() {
        state.activeTourStep = 0;
        updateTourStep();
        tourOverlay.classList.remove('hidden');
    }

    function nextTourStep() {
        state.activeTourStep++;
        
        if (state.activeTourStep >= tourSteps.length) {
            endTour();
            return;
        }
        
        updateTourStep();
    }

    function updateTourStep() {
        const step = tourSteps[state.activeTourStep];
        
        // Oppdater innhold
        document.querySelector('.tour-content h3').textContent = step.title;
        tourStepText.textContent = step.text;
        
        // Oppdater knapper
        if (state.activeTourStep === tourSteps.length - 1) {
            tourNextBtn.textContent = 'Fullfør';
        } else {
            tourNextBtn.textContent = 'Neste';
        }
        
        // Fjern eksisterende fremheving
        removeHighlight();
        
        // Legg til fremheving hvis spesifisert
        if (step.highlight) {
            highlightElement(step.highlight);
        }
    }

    function highlightElement(selector) {
        const element = document.querySelector(selector);
        if (!element) return;
        
        element.classList.add('tour-highlight');
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function removeHighlight() {
        const highlighted = document.querySelectorAll('.tour-highlight');
        highlighted.forEach(el => el.classList.remove('tour-highlight'));
    }

    function endTour() {
        tourOverlay.classList.add('hidden');
        removeHighlight();
        localStorage.setItem('tourCompleted', 'true');
    }

    // Hjelpefunksjon for å sentrere kart på koordinater
    window.centerMapOn = function(coordinates) {
        map.flyTo(coordinates, map.getZoom(), {
            animate: true,
            duration: 1
        });
    };

    // Initialiser UI
    initUI();

    // Legg til CSS for nye komponenter dynamisk
    addDynamicStyles();

    function addDynamicStyles() {
        const styles = document.createElement('style');
        styles.innerHTML = `
            /* Varslingsstiler */
            .notification {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 12px 20px;
                background-color: white;
                border-radius: var(--radius-md);
                box-shadow: var(--shadow-lg);
                z-index: 3000;
                max-width: 300px;
                overflow: hidden;
            }
            
            .notification-content {
                display: flex;
                align-items: center;
                gap: 12px;
            }
            
            .notification-info { border-left: 4px solid var(--secondary); }
            .notification-success { border-left: 4px solid var(--success); }
            .notification-warning { border-left: 4px solid var(--warning); }
            .notification-error { border-left: 4px solid var(--danger); }
            
            .notification i {
                font-size: 1.2rem;
            }
            
            .notification-info i { color: var(--secondary); }
            .notification-success i { color: var(--success); }
            .notification-warning i { color: var(--warning); }
            .notification-error i { color: var(--danger); }
            
            /* Plassdetalj-stiler */
            .location-details {
                margin-top: var(--space-md);
            }
            
            .detail-row {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 8px;
            }
            
            .detail-row i {
                color: var(--gray-600);
                width: 16px;
            }
            
            .emergency-note {
                margin-top: 12px;
                padding: 8px;
                background-color: rgba(230, 57, 70, 0.1);
                border-radius: var(--radius-sm);
                font-size: 0.9rem;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .emergency-note i {
                color: var(--danger);
            }
            
            .action-row {
                margin-top: 12px;
                display: flex;
                gap: 8px;
            }
            
            .small-btn {
                padding: 6px 12px;
                border-radius: var(--radius-sm);
                border: none;
                background-color: var(--gray-200);
                display: flex;
                align-items: center;
                gap: 6px;
                cursor: pointer;
                transition: all var(--transition-fast);
            }
            
            .small-btn:hover {
                background-color: var(--gray-300);
            }
            
            /* Omvisningsfremheving */
            .tour-highlight {
                position: relative;
                z-index: 2001;
                box-shadow: 0 0 0 4px var(--accent), 0 0 0 8px rgba(255, 209, 102, 0.3);
                animation: pulse-highlight 1.5s infinite;
            }
            
            @keyframes pulse-highlight {
                0% { box-shadow: 0 0 0 4px var(--accent), 0 0 0 8px rgba(255, 209, 102, 0.3); }
                50% { box-shadow: 0 0 0 8px var(--accent), 0 0 0 12px rgba(255, 209, 102, 0.3); }
                100% { box-shadow: 0 0 0 4px var(--accent), 0 0 0 8px rgba(255, 209, 102, 0.3); }
            }
            
            /* Tilleggsanimasjoner */
            .slide-out-right {
                animation: slideOutRight 0.5s forwards;
            }
            
            @keyframes slideOutRight {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(30px); opacity: 0; }
            }
            
            .pulse-action {
                animation: pulseAction 1.5s;
            }
            
            @keyframes pulseAction {
                0% { transform: scale(1); }
                10% { transform: scale(1.05); box-shadow: 0 0 0 4px rgba(230, 57, 70, 0.3); }
                20% { transform: scale(1); }
                30% { transform: scale(1.05); box-shadow: 0 0 0 4px rgba(230, 57, 70, 0.3); }
                40% { transform: scale(1); }
                100% { transform: scale(1); }
            }
        `;
        
        document.head.appendChild(styles);
    }
});