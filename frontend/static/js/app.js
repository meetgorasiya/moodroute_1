/**
 * MoodRoute — Main Application Logic
 * Sidebar + map layout matching original MoodRoute.html design.
 * All route recommendations use real backend API calls.
 */

const MoodRouteApp = {

    // ── State ────────────────────────────────────────────────────────────
    currentLocation: { lat: -34.4054, lng: 150.8784 },  // UOW campus default
    selectedMood: null,
    currentWeather: null,
    currentRoute: null,
    isLoading: false,

    // ── Init ─────────────────────────────────────────────────────────────
    start() {
        MapManager.init();
        this.setupEventListeners();
        this.loadWeather(this.currentLocation.lat, this.currentLocation.lng);
        MapManager.addUserMarker(this.currentLocation.lat, this.currentLocation.lng);
    },

    // ── Event listeners ──────────────────────────────────────────────────
    setupEventListeners() {
        // Mood pills
        document.getElementById('moodPills').addEventListener('click', (e) => {
            const pill = e.target.closest('.mood-pill');
            if (pill) this.selectMoodPill(pill.dataset.mood, pill);
        });

        // GPS button
        document.getElementById('gpsBtn').addEventListener('click', () => this.requestGPSLocation());

        // Find route button
        document.getElementById('findBtn').addEventListener('click', () => this.findRoute());

        // Star rating
        document.getElementById('stars').addEventListener('click', (e) => {
            const star = e.target.closest('.star');
            if (star) this.submitRating(parseInt(star.dataset.star, 10));
        });

        // Location input — geocode on Enter
        document.getElementById('locationInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.geocodeAddress(document.getElementById('locationInput').value);
            }
        });
    },

    // ── Mood pill selection ──────────────────────────────────────────────
    selectMoodPill(mood, element) {
        document.querySelectorAll('.mood-pill').forEach(p => p.classList.remove('active'));
        element.classList.add('active');
        this.selectedMood = mood;
    },

    // ── GPS location ─────────────────────────────────────────────────────
    requestGPSLocation() {
        if (!navigator.geolocation) {
            this.showToast('Geolocation is not supported by your browser');
            return;
        }

        document.getElementById('gpsBtn').textContent = '📡 Locating...';

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                this.currentLocation = { lat, lng };
                document.getElementById('locationInput').value = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                MapManager.setView(lat, lng);
                MapManager.addUserMarker(lat, lng);
                this.loadWeather(lat, lng);
                document.getElementById('gpsBtn').textContent = '📡 Use GPS';
                this.showToast('✅ Location updated!');
            },
            (error) => {
                document.getElementById('gpsBtn').textContent = '📡 Use GPS';
                const messages = {
                    1: 'Location access denied',
                    2: 'Location unavailable',
                    3: 'Location request timed out'
                };
                this.showToast(messages[error.code] || 'Unable to get location');
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
        );
    },

    // ── Weather ──────────────────────────────────────────────────────────
    async loadWeather(lat, lng) {
        try {
            const response = await fetch(`/api/weather?lat=${lat}&lng=${lng}`);
            if (!response.ok) throw new Error('Weather fetch failed');
            const data = await response.json();

            // API returns { success: true, weather: { condition, temp, icon, walkable ... } }
            const weather = data.weather || data;
            this.currentWeather = weather;

            const card = document.getElementById('weatherCard');
            document.getElementById('weatherIcon').textContent = weather.icon || '🌤️';
            document.getElementById('weatherMain').textContent =
                `${weather.description || weather.condition} · ${Math.round(weather.temp || 0)}°C`;
            document.getElementById('weatherSub').textContent =
                weather.walkable === 'good'      ? `Wind: ${weather.wind || 0}km/h · ✅ Great for walking` :
                weather.walkable === 'moderate'  ? `Wind: ${weather.wind || 0}km/h · ⚠️ Take an umbrella` :
                weather.walkable === 'poor'      ? `Wind: ${weather.wind || 0}km/h · 🌧️ Consider indoors` :
                                                   `Wind: ${weather.wind || 0}km/h · ⛈️ Stay indoors`;

            card.className = 'weather-card';
            if (weather.walkable === 'moderate') card.classList.add('weather-alert');
            if (weather.walkable === 'poor' || weather.walkable === 'dangerous') card.classList.add('weather-danger');

        } catch (err) {
            // Silently fail — weather not critical
        }
    },

    // ── Main: find route ─────────────────────────────────────────────────
    async findRoute() {
        const moodText   = this.sanitizeInput(document.getElementById('moodInput').value.trim());
        const selectedMood = this.selectedMood;

        if (!moodText && !selectedMood) {
            this.showToast('💬 Please type how you feel or select a mood');
            return;
        }

        this.showLoading('Analysing your mood...');
        document.getElementById('findBtn').disabled = true;

        try {
            await this.animateLoadingSteps();

            const payload = {
                lat: this.currentLocation.lat,
                lng: this.currentLocation.lng
            };
            if (moodText)      payload.text = moodText;
            if (selectedMood)  payload.mood = selectedMood;

            const response = await fetch('/api/find-route', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Route search failed');
            }

            const data = await response.json();

            if (data.indoor_alternatives === true && data.alternatives) {
                this.displayIndoorAlternatives(data);
            } else if (data.routes && data.routes.length > 0) {
                this.displayRouteResult(data);
            } else {
                this.showToast('No routes found near your location');
            }

        } catch (routeError) {
            this.showToast(routeError.message || 'Something went wrong');
        } finally {
            this.hideLoading();
            document.getElementById('findBtn').disabled = false;
        }
    },

    // ── Loading animation ────────────────────────────────────────────────
    async animateLoadingSteps() {
        const steps = [
            '🧠 Detecting your mood with NLP...',
            '🌿 Scanning nearby green spaces...',
            '☁️ Checking weather conditions...',
            '⛰️ Analysing terrain data...',
            '🏆 Scoring and ranking routes...'
        ];
        for (const step of steps) {
            document.getElementById('loadingStep').textContent = step;
            await this.delay(500);
        }
    },

    // ── Display route result ─────────────────────────────────────────────
    displayRouteResult(data) {
        const bestRoute = (data.routes && data.routes.length > 0) ? data.routes[0] : null;
        if (!bestRoute) {
            this.showToast('No suitable routes found nearby');
            return;
        }

        this.currentRoute = bestRoute;

        // Hide indoor, show result
        document.getElementById('indoorCard').classList.add('hidden');
        document.getElementById('resultCard').classList.remove('hidden');

        // Mood badge
        const moodData = data.mood || {};
        const emoji    = moodData.emoji || '🧠';
        const label    = moodData.label || moodData.category || 'Unknown';
        document.getElementById('resultMood').textContent = `${emoji} ${label}`;

        // Confidence bar
        const confidence = moodData.confidence ? Math.round(moodData.confidence * 100) : 0;
        document.getElementById('confidenceText').textContent = `${confidence}%`;
        setTimeout(() => {
            document.getElementById('confidenceFill').style.width = `${confidence}%`;
        }, 100);

        // Route name
        document.getElementById('routeName').textContent = bestRoute.name || 'Recommended Route';

        // Meta tags: distance + time
        const distKm  = bestRoute.distance_km || '--';
        const timeMin = Math.round((parseFloat(distKm) || 0) * 12);
        document.getElementById('routeMeta').innerHTML = `
            <div class="route-tag">🚶 ${distKm} km</div>
            <div class="route-tag">⏱️ ${timeMin} min</div>
            <div class="route-tag">⭐ Score: ${bestRoute.total_score || '--'}/10</div>
        `;

        // Start / End points
        const startName = bestRoute.start_point || 'University of Wollongong';
        const endName   = bestRoute.end_point   || 'Destination';
        document.getElementById('routePoints').innerHTML = `
            <div class="route-point">
                <span class="route-point__marker route-point__marker--start">●</span>
                <span>${startName}</span>
            </div>
            <div class="route-point__line"></div>
            <div class="route-point">
                <span class="route-point__marker route-point__marker--end">●</span>
                <span>${endName}</span>
            </div>
        `;

        // Score bars
        const scores = bestRoute.scores || {};
        this.renderScoreBars(scores);

        // Explanation
        document.getElementById('routeExplanation').textContent =
            bestRoute.explanation || moodData.description || '';

        // Reset stars
        document.querySelectorAll('.star').forEach(s => s.classList.remove('lit'));

        // Draw route on map
        if (bestRoute.coordinates && bestRoute.coordinates.length > 1) {
            MapManager.clearRoutes();
            MapManager.drawRoute(bestRoute.coordinates, '#1a3c2e', startName, endName);
            MapManager.fitToRoute(bestRoute.coordinates);
        }

        this.showToast(`${emoji} ${label} mood detected — route found!`);
    },

    // ── Render score bars ────────────────────────────────────────────────
    renderScoreBars(scores) {
        const keyMap = {
            greenery: 'greenery', quiet: 'quiet', quietness: 'quiet',
            flat: 'flat', flatness: 'flat', uncrowded: 'uncrowded'
        };
        const metrics = [
            { label: 'Greenery',  key: 'greenery',  color: '#4a7c59' },
            { label: 'Quietness', key: 'quiet',      color: '#5b8db8' },
            { label: 'Flatness',  key: 'flat',       color: '#8e44ad' },
            { label: 'Seclusion', key: 'uncrowded',  color: '#c17f3e' },
        ];

        const container = document.getElementById('scoreBars');
        container.innerHTML = metrics.map(m => `
            <div class="score-row">
                <div class="score-label">${m.label}</div>
                <div class="score-track">
                    <div class="score-fill" style="width:0%;background:${m.color}"
                         data-target="${Math.round(((scores[m.key] || scores[keyMap[m.key]] || 0) / 10) * 100)}"></div>
                </div>
                <div class="score-val">${scores[m.key] || scores[keyMap[m.key]] || 0}</div>
            </div>
        `).join('');

        // Animate bars after a short delay
        setTimeout(() => {
            container.querySelectorAll('.score-fill').forEach(bar => {
                bar.style.width = bar.dataset.target + '%';
            });
        }, 300);
    },

    // ── Display indoor alternatives ──────────────────────────────────────
    displayIndoorAlternatives(data) {
        document.getElementById('resultCard').classList.add('hidden');
        document.getElementById('indoorCard').classList.remove('hidden');

        const weather = data.weather || {};
        document.getElementById('indoorSubtitle').textContent =
            `${weather.icon || '⛈️'} ${weather.description || 'Dangerous weather'} — outdoor walking not recommended`;

        const alternatives = data.alternatives || [];
        document.getElementById('indoorOptions').innerHTML = alternatives.map(item => `
            <div class="indoor-option">
                <span style="font-size:1.3rem">${item.icon || '🏠'}</span>
                <div>
                    <div style="font-weight:600;font-size:0.85rem">${item.name || ''}</div>
                    <div style="font-size:0.75rem;color:rgba(245,240,232,0.6);margin-top:2px">${item.description || ''}</div>
                </div>
            </div>
        `).join('');

        this.showToast('⛈️ Dangerous weather — showing indoor alternatives');
    },

    // ── Star rating ──────────────────────────────────────────────────────
    async submitRating(stars) {
        document.querySelectorAll('.star').forEach((s, i) => {
            s.classList.toggle('lit', i < stars);
        });

        if (!this.currentRoute) return;

        try {
            const response = await fetch('/api/rate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    route_id: this.currentRoute.id,
                    rating: stars,
                    mood: this.selectedMood || 'unknown',
                    weather_condition: this.currentWeather ? this.currentWeather.condition : ''
                })
            });
            if (!response.ok) throw new Error('Rating failed');
            this.showToast(`⭐ Thank you! ${stars}/5 stars recorded.`);
        } catch {
            this.showToast('Rating could not be saved');
        }
    },

    // ── Geocode address ──────────────────────────────────────────────────
    async geocodeAddress(address) {
        if (!address || address.length < 3) return;

        // Check if it's already coordinates
        const coordMatch = address.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
        if (coordMatch) {
            const lat = parseFloat(coordMatch[1]);
            const lng = parseFloat(coordMatch[2]);
            this.currentLocation = { lat, lng };
            MapManager.setView(lat, lng);
            MapManager.addUserMarker(lat, lng);
            this.loadWeather(lat, lng);
            return;
        }

        try {
            const encoded = encodeURIComponent(address);
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&limit=1`,
                { headers: { 'Accept': 'application/json' } }
            );
            if (!response.ok) throw new Error('Geocoding failed');
            const results = await response.json();
            if (results.length === 0) { this.showToast('Location not found'); return; }

            const lat = parseFloat(results[0].lat);
            const lng = parseFloat(results[0].lon);
            this.currentLocation = { lat, lng };
            document.getElementById('locationInput').value =
                results[0].display_name.split(',').slice(0, 2).join(',');
            MapManager.setView(lat, lng);
            MapManager.addUserMarker(lat, lng);
            this.loadWeather(lat, lng);
            this.showToast('Location set ✓');
        } catch {
            this.showToast('Could not find that location');
        }
    },

    // ── Loading overlay ──────────────────────────────────────────────────
    showLoading(text) {
        this.isLoading = true;
        document.getElementById('loadingText').textContent = text || 'Loading...';
        document.getElementById('loadingOverlay').classList.remove('hidden');
    },

    hideLoading() {
        this.isLoading = false;
        document.getElementById('loadingOverlay').classList.add('hidden');
    },

    // ── Toast ────────────────────────────────────────────────────────────
    showToast(message) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
    },

    // ── Input sanitization ───────────────────────────────────────────────
    sanitizeInput(input) {
        if (!input) return '';
        return input.replace(/<[^>]*>/g, '').substring(0, 300).trim();
    },

    // ── Utility ──────────────────────────────────────────────────────────
    delay(ms) { return new Promise(r => setTimeout(r, ms)); }
};

document.addEventListener('DOMContentLoaded', () => MoodRouteApp.start());
