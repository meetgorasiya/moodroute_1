/**
 * MoodRoute — Main Application Logic
 */

const MoodRouteApp = {
    currentLocation: { lat: -34.4054, lng: 150.8784 },
    selectedMood: null,
    currentWeather: null,
    currentRoute: null,
    isLoading: false,

    pageElements: {},

    start() {
        this.findPageElements();
        MapManager.init();
        this.setupEventListeners();
        this.setupDraggablePanel();
        this.loadWeather(this.currentLocation.lat, this.currentLocation.lng);
        MapManager.addUserMarker(this.currentLocation.lat, this.currentLocation.lng);

        MapManager.addClickHandler((clickedCoords) => {
            this.currentLocation.lat = clickedCoords.lat;
            this.currentLocation.lng = clickedCoords.lng;
            MapManager.addUserMarker(clickedCoords.lat, clickedCoords.lng);
            this.pageElements.locationInput.value = `${clickedCoords.lat.toFixed(4)}, ${clickedCoords.lng.toFixed(4)}`;
            this.loadWeather(clickedCoords.lat, clickedCoords.lng);
        });
    },

    findPageElements() {
        this.pageElements = {
            panel:           document.getElementById('panel'),
            panelTitlebar:   document.getElementById('panelTitlebar'),
            panelBody:       document.getElementById('panelBody'),
            panelToggleBtn:  document.getElementById('panelToggleBtn'),
            moodInput:       document.getElementById('moodInput'),
            moodPills:       document.getElementById('moodPills'),
            locationInput:   document.getElementById('locationInput'),
            gpsBtn:          document.getElementById('gpsBtn'),
            findBtn:         document.getElementById('findBtn'),
            resultSection:   document.getElementById('resultSection'),
            indoorSection:   document.getElementById('indoorSection'),
            moodSection:     document.getElementById('moodSection'),
            loadingOverlay:  document.getElementById('loadingOverlay'),
            loadingText:     document.getElementById('loadingText'),
            toast:           document.getElementById('toast'),
            toastMessage:    document.getElementById('toastMessage'),
            weatherPill:     document.getElementById('weatherPill'),
            weatherIcon:     document.getElementById('weatherIcon'),
            weatherTemp:     document.getElementById('weatherTemp'),
            moodBadge:       document.getElementById('moodBadge'),
            confidenceBadge: document.getElementById('confidenceBadge'),
            routeName:       document.getElementById('routeName'),
            routeDistance:   document.getElementById('routeDistance'),
            routeTime:       document.getElementById('routeTime'),
            routeExplanation:document.getElementById('routeExplanation'),
            scoreBars:       document.getElementById('scoreBars'),
            starRating:      document.getElementById('starRating'),
            indoorReason:    document.getElementById('indoorReason'),
            indoorList:      document.getElementById('indoorList'),
            newRouteBtn:     document.getElementById('newRouteBtn'),
            indoorBackBtn:   document.getElementById('indoorBackBtn')
        };
    },

    setupEventListeners() {
        this.pageElements.moodPills.addEventListener('click', (event) => {
            const clickedPill = event.target.closest('.mood-pill');
            if (clickedPill) {
                this.selectMoodPill(clickedPill.dataset.mood, clickedPill);
            }
        });

        this.pageElements.gpsBtn.addEventListener('click', () => this.requestGPSLocation());
        this.pageElements.findBtn.addEventListener('click', () => this.findRoute());

        this.pageElements.starRating.addEventListener('click', (event) => {
            const clickedStar = event.target.closest('.star');
            if (clickedStar) {
                this.submitRating(parseInt(clickedStar.dataset.star, 10));
            }
        });

        this.pageElements.newRouteBtn.addEventListener('click', () => this.resetToMoodInput());
        this.pageElements.indoorBackBtn.addEventListener('click', () => this.resetToMoodInput());

        this.pageElements.locationInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                this.geocodeAddress(this.pageElements.locationInput.value);
            }
        });

        this.pageElements.moodInput.addEventListener('focus', () => {
            this.pageElements.panel.classList.remove('minimised');
        });
    },

    setupDraggablePanel() {
        const panel = this.pageElements.panel;
        const titlebar = this.pageElements.panelTitlebar;
        const toggleButton = this.pageElements.panelToggleBtn;

        let isDragging = false;
        let dragStartX = 0, dragStartY = 0;
        let panelStartLeft = 0, panelStartTop = 0;

        toggleButton.addEventListener('click', (event) => {
            event.stopPropagation();
            panel.classList.toggle('minimised');
            MapManager.invalidateSize();
        });

        const onDragStart = (event) => {
            if (event.target === toggleButton || toggleButton.contains(event.target)) return;

            isDragging = true;
            const clientX = event.touches ? event.touches[0].clientX : event.clientX;
            const clientY = event.touches ? event.touches[0].clientY : event.clientY;

            const panelRect = panel.getBoundingClientRect();
            dragStartX = clientX;
            dragStartY = clientY;
            panelStartLeft = panelRect.left;
            panelStartTop = panelRect.top;

            panel.style.transition = 'none';
            panel.style.bottom = 'auto';
            panel.style.right = 'auto';
            panel.style.left = `${panelRect.left}px`;
            panel.style.top = `${panelRect.top}px`;

            titlebar.style.cursor = 'grabbing';
            event.preventDefault();
        };

        const onDragMove = (event) => {
            if (!isDragging) return;
            const clientX = event.touches ? event.touches[0].clientX : event.clientX;
            const clientY = event.touches ? event.touches[0].clientY : event.clientY;

            const deltaX = clientX - dragStartX;
            const deltaY = clientY - dragStartY;

            const newLeft = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, panelStartLeft + deltaX));
            const newTop = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, panelStartTop + deltaY));

            panel.style.left = `${newLeft}px`;
            panel.style.top = `${newTop}px`;
        };

        const onDragEnd = () => {
            if (!isDragging) return;
            isDragging = false;
            titlebar.style.cursor = 'grab';

            const panelRect = panel.getBoundingClientRect();
            const panelCenterX = panelRect.left + panelRect.width / 2;
            const panelCenterY = panelRect.top + panelRect.height / 2;
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const margin = 24;
            const panelWidth = panel.offsetWidth;
            const panelHeight = panel.offsetHeight;

            const snapToLeft = panelCenterX < viewportWidth / 2;
            const snapToTop = panelCenterY < viewportHeight / 2;

            panel.style.transition = 'left 0.25s ease, top 0.25s ease, right 0.25s ease, bottom 0.25s ease';

            if (snapToLeft && !snapToTop) {
                panel.style.left = `${margin}px`;
                panel.style.top = `${viewportHeight - panelHeight - margin}px`;
            } else if (!snapToLeft && !snapToTop) {
                panel.style.left = `${viewportWidth - panelWidth - margin}px`;
                panel.style.top = `${viewportHeight - panelHeight - margin}px`;
            } else if (snapToLeft && snapToTop) {
                panel.style.left = `${margin}px`;
                panel.style.top = `${margin + 56}px`;
            } else {
                panel.style.left = `${viewportWidth - panelWidth - margin}px`;
                panel.style.top = `${margin + 56}px`;
            }

            MapManager.invalidateSize();
        };

        titlebar.addEventListener('touchstart', onDragStart, { passive: false });
        document.addEventListener('touchmove', onDragMove, { passive: true });
        document.addEventListener('touchend', onDragEnd);

        titlebar.addEventListener('mousedown', onDragStart);
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
    },

    setSheetState(state) {
        const panel = this.pageElements.panel;
        if (state === 'full' || state === 'half') {
            panel.classList.remove('minimised');
        }
        MapManager.invalidateSize();
    },

    selectMoodPill(mood, pillElement) {
        document.querySelectorAll('.mood-pill').forEach((pill) => {
            pill.classList.remove('active');
        });
        pillElement.classList.add('active');
        this.selectedMood = mood;
    },

    requestGPSLocation() {
        if (!navigator.geolocation) {
            this.showToast('Geolocation is not supported by your browser', 'error');
            return;
        }

        this.pageElements.gpsBtn.classList.add('locating');

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const userLatitude = position.coords.latitude;
                const userLongitude = position.coords.longitude;
                this.currentLocation.lat = userLatitude;
                this.currentLocation.lng = userLongitude;
                this.pageElements.locationInput.value = `${userLatitude.toFixed(4)}, ${userLongitude.toFixed(4)}`;

                MapManager.setView(userLatitude, userLongitude);
                MapManager.addUserMarker(userLatitude, userLongitude);
                this.loadWeather(userLatitude, userLongitude);
                this.pageElements.gpsBtn.classList.remove('locating');
                this.showToast('Location updated ✓');
            },
            (locationError) => {
                this.pageElements.gpsBtn.classList.remove('locating');
                let errorMessage = 'Unable to get location';
                if (locationError.code === 1) errorMessage = 'Location access denied';
                if (locationError.code === 2) errorMessage = 'Location unavailable';
                if (locationError.code === 3) errorMessage = 'Location request timed out';
                this.showToast(errorMessage, 'error');
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
        );
    },

    async loadWeather(latitude, longitude) {
        try {
            const response = await fetch(`/api/weather?lat=${latitude}&lng=${longitude}`);
            if (!response.ok) throw new Error('Weather fetch failed');
            const responseData = await response.json();

            const weatherData = responseData.weather || responseData;
            this.currentWeather = weatherData;

            const weatherIcon = weatherData.icon || '🌤️';
            const temperature = weatherData.temp || 0;

            this.pageElements.weatherIcon.textContent = weatherIcon;
            this.pageElements.weatherTemp.textContent = `${Math.round(temperature)}°C`;
        } catch (fetchError) {
            console.warn('Weather load failed:', fetchError);
        }
    },

    async findRoute() {
        const moodText = this.sanitizeInput(this.pageElements.moodInput.value.trim());
        const chosenMood = this.selectedMood;

        if (!moodText && !chosenMood) {
            this.showToast('Please describe your mood or select one', 'error');
            return;
        }

        if (!this.currentLocation.lat || !this.currentLocation.lng) {
            this.showToast('Please set your location', 'error');
            return;
        }

        this.showLoading('Analysing mood...');
        this.pageElements.findBtn.disabled = true;

        try {
            await this.animateLoadingSteps();

            const requestPayload = {
                lat: this.currentLocation.lat,
                lng: this.currentLocation.lng
            };

            if (moodText) requestPayload.text = moodText;
            if (chosenMood) requestPayload.mood = chosenMood;

            const response = await fetch('/api/find-route', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestPayload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Route search failed');
            }

            const routeData = await response.json();

            if (routeData.indoor_alternatives === true && routeData.alternatives) {
                this.displayIndoorAlternatives(routeData);
            } else if (routeData.routes && routeData.routes.length > 0) {
                this.displayRouteResult(routeData);
            } else {
                this.showToast('No routes found near your location', 'error');
            }
        } catch (routeError) {
            console.error('Find route error:', routeError);
            this.showToast(routeError.message || 'Something went wrong', 'error');
        } finally {
            this.hideLoading();
            this.pageElements.findBtn.disabled = false;
        }
    },

    async animateLoadingSteps() {
        const steps = document.querySelectorAll('.loading-step');
        const messages = [
            'Analysing mood...',
            'Checking weather...',
            'Scoring routes...',
            'Finding best match...'
        ];

        for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
            steps[stepIndex].classList.add('active');
            this.pageElements.loadingText.textContent = messages[stepIndex];
            if (stepIndex > 0) steps[stepIndex - 1].classList.remove('active');
            if (stepIndex > 0) steps[stepIndex - 1].classList.add('done');
            await this.delay(600);
        }
        steps[steps.length - 1].classList.remove('active');
        steps[steps.length - 1].classList.add('done');
    },

    displayRouteResult(responseData) {
        const bestRoute = (responseData.routes && responseData.routes.length > 0) ? responseData.routes[0] : null;

        if (!bestRoute) {
            this.showToast('No suitable routes found nearby', 'error');
            return;
        }

        this.currentRoute = bestRoute;

        const moodInfo = responseData.mood || {};
        const moodLabel = moodInfo.category || moodInfo.label || this.selectedMood || 'unknown';
        const moodEmoji = moodInfo.emoji || '🧠';
        this.pageElements.moodBadge.textContent = `${moodEmoji} ${moodLabel.charAt(0).toUpperCase() + moodLabel.slice(1)}`;

        const confidenceText = moodInfo.confidence
            ? `${Math.round(moodInfo.confidence * 100)}%`
            : '--';
        this.pageElements.confidenceBadge.textContent = confidenceText;

        this.pageElements.routeName.textContent = bestRoute.name || 'Recommended Route';

        const distanceKm = bestRoute.distance_km || '--';
        this.pageElements.routeDistance.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
            ${distanceKm} km`;

        const estimatedMinutes = Math.round((parseFloat(distanceKm) || 0) * 12);
        this.pageElements.routeTime.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v6l4 2"/>
            </svg>
            ${estimatedMinutes} min`;

        const startPointName = bestRoute.start_point || 'Start';
        const endPointName = bestRoute.end_point || 'End';

        const routePointsElement = document.getElementById('routePoints');
        if (routePointsElement) {
            routePointsElement.innerHTML = `
                <div class="route-point">
                    <span class="route-point__marker route-point__marker--start">●</span>
                    <span class="route-point__text">${startPointName}</span>
                </div>
                <div class="route-point__line"></div>
                <div class="route-point">
                    <span class="route-point__marker route-point__marker--end">●</span>
                    <span class="route-point__text">${endPointName}</span>
                </div>
            `;
        }

        this.pageElements.routeExplanation.textContent = bestRoute.explanation ||
            moodInfo.description ||
            'This route was selected based on your mood and environmental factors.';

        const routeScores = bestRoute.scores || {};
        this.drawScoreBars(routeScores);

        if (bestRoute.coordinates && bestRoute.coordinates.length > 1) {
            MapManager.clearRoutes();
            MapManager.drawRoute(bestRoute.coordinates, '#1a3a6b', startPointName, endPointName);
            MapManager.fitToRoute(bestRoute.coordinates);
        }

        this.pageElements.moodSection.classList.add('hidden');
        this.pageElements.indoorSection.classList.add('hidden');
        this.pageElements.resultSection.classList.remove('hidden');
        this.setSheetState('full');

        document.querySelectorAll('.star').forEach(star => star.classList.remove('active'));
    },

    drawScoreBars(scores) {
        const keyMapping = {
            greenery: 'greenery',
            quiet: 'quiet',
            quietness: 'quiet',
            noise: 'quiet',
            flat: 'flat',
            flatness: 'flat',
            elevation: 'flat',
            uncrowded: 'uncrowded',
            crowd: 'uncrowded'
        };

        document.querySelectorAll('.score-bar__fill').forEach(bar => {
            bar.style.width = '0%';
        });
        document.querySelectorAll('.score-bar__value').forEach(valueLabel => {
            valueLabel.textContent = '0%';
        });

        setTimeout(() => {
            Object.entries(scores).forEach(([scoreKey, scoreValue]) => {
                const barIdentifier = keyMapping[scoreKey] || scoreKey;
                const barFill = document.querySelector(`[data-bar="${barIdentifier}"]`);
                const barLabel = document.querySelector(`[data-score="${barIdentifier}"]`);

                if (barFill) {
                    const percentage = Math.round(((scoreValue || 0) / 10) * 100);
                    barFill.style.width = `${percentage}%`;
                    if (barLabel) barLabel.textContent = `${percentage}%`;
                }
            });
        }, 300);
    },

    displayIndoorAlternatives(responseData) {
        const weatherInfo = responseData.weather || {};
        this.pageElements.indoorReason.textContent = responseData.message ||
            `${weatherInfo.icon || '⛈️'} ${weatherInfo.description || "Weather conditions aren't ideal for walking right now."}`;

        const alternativesList = this.pageElements.indoorList;
        alternativesList.innerHTML = '';

        const alternatives = responseData.alternatives || [];
        alternatives.forEach(alternative => {
            const listItem = document.createElement('li');
            listItem.className = 'indoor-item';
            if (typeof alternative === 'string') {
                listItem.textContent = alternative;
            } else {
                listItem.innerHTML = `<span class="indoor-item__icon">${alternative.icon || '🏠'}</span>
                    <div class="indoor-item__content">
                        <strong>${alternative.name || 'Indoor activity'}</strong>
                        <span>${alternative.description || ''}</span>
                    </div>`;
            }
            alternativesList.appendChild(listItem);
        });

        this.pageElements.moodSection.classList.add('hidden');
        this.pageElements.resultSection.classList.add('hidden');
        this.pageElements.indoorSection.classList.remove('hidden');
        this.setSheetState('full');
    },

    async submitRating(starCount) {
        document.querySelectorAll('.star').forEach((starElement, index) => {
            starElement.classList.toggle('active', index < starCount);
        });

        if (!this.currentRoute) return;

        try {
            const ratingPayload = {
                route_id: this.currentRoute.id,
                rating: starCount,
                mood: this.selectedMood || 'unknown',
                weather_condition: this.currentWeather ? this.currentWeather.condition : ''
            };

            const response = await fetch('/api/rate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(ratingPayload)
            });

            if (!response.ok) throw new Error('Rating failed');

            this.showToast(`Rated ${starCount} star${starCount > 1 ? 's' : ''} — Thank you! ⭐`);
        } catch (ratingError) {
            console.error('Rate error:', ratingError);
            this.showToast('Rating could not be saved', 'error');
        }
    },

    resetToMoodInput() {
        this.pageElements.resultSection.classList.add('hidden');
        this.pageElements.indoorSection.classList.add('hidden');
        this.pageElements.moodSection.classList.remove('hidden');
        this.setSheetState('half');
        MapManager.clearRoutes();
        MapManager.resetToUOW();

        this.pageElements.moodInput.value = '';
        this.selectedMood = null;
        document.querySelectorAll('.mood-pill').forEach(pill => pill.classList.remove('active'));
    },

    showLoading(message) {
        this.isLoading = true;
        this.pageElements.loadingText.textContent = message || 'Loading...';

        document.querySelectorAll('.loading-step').forEach(step => {
            step.classList.remove('active', 'done');
        });
        document.querySelector('.loading-step[data-step="1"]').classList.add('active');

        this.pageElements.loadingOverlay.classList.remove('hidden');
    },

    hideLoading() {
        this.isLoading = false;
        this.pageElements.loadingOverlay.classList.add('hidden');
    },

    showToast(message, type = 'success') {
        const toastElement = this.pageElements.toast;
        this.pageElements.toastMessage.textContent = message;

        toastElement.classList.remove('hidden', 'toast--success', 'toast--error');
        toastElement.classList.add(`toast--${type}`, 'show');

        clearTimeout(this._toastTimeout);
        this._toastTimeout = setTimeout(() => {
            toastElement.classList.remove('show');
            setTimeout(() => toastElement.classList.add('hidden'), 300);
        }, 3000);
    },

    async geocodeAddress(address) {
        if (!address || address.length < 3) return;

        const coordinateMatch = address.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
        if (coordinateMatch) {
            const parsedLat = parseFloat(coordinateMatch[1]);
            const parsedLng = parseFloat(coordinateMatch[2]);
            this.currentLocation.lat = parsedLat;
            this.currentLocation.lng = parsedLng;
            MapManager.setView(parsedLat, parsedLng);
            MapManager.addUserMarker(parsedLat, parsedLng);
            this.loadWeather(parsedLat, parsedLng);
            return;
        }

        try {
            const encodedAddress = encodeURIComponent(address);
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1`,
                { headers: { 'Accept': 'application/json' } }
            );

            if (!response.ok) throw new Error('Geocoding failed');

            const searchResults = await response.json();
            if (searchResults.length === 0) {
                this.showToast('Location not found', 'error');
                return;
            }

            const foundLatitude = parseFloat(searchResults[0].lat);
            const foundLongitude = parseFloat(searchResults[0].lon);

            this.currentLocation.lat = foundLatitude;
            this.currentLocation.lng = foundLongitude;
            this.pageElements.locationInput.value = searchResults[0].display_name.split(',').slice(0, 2).join(',');

            MapManager.setView(foundLatitude, foundLongitude);
            MapManager.addUserMarker(foundLatitude, foundLongitude);
            this.loadWeather(foundLatitude, foundLongitude);
            this.showToast('Location set ✓');
        } catch (geocodeError) {
            console.error('Geocode error:', geocodeError);
            this.showToast('Could not find that location', 'error');
        }
    },

    sanitizeInput(input) {
        if (!input) return '';
        const withoutHtml = input.replace(/<[^>]*>/g, '');
        return withoutHtml.substring(0, 300).trim();
    },

    delay(milliseconds) {
        return new Promise(resolve => setTimeout(resolve, milliseconds));
    }
};

document.addEventListener('DOMContentLoaded', () => MoodRouteApp.start());
