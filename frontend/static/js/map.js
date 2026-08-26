/**
 * MoodRoute — Map Management Module
 */

const MapManager = {
    map: null,
    routeLayer: null,
    markerLayer: null,
    userMarker: null,
    boundaryLayer: null,

    UOW_CENTER: [-34.4054, 150.8784],
    UOW_RADIUS: 5000,
    UOW_CAMPUS_RADIUS: 500,

    init() {
        this.map = L.map('map', {
            center: this.UOW_CENTER,
            zoom: 14,
            zoomControl: false,
            attributionControl: true
        });

        L.control.zoom({ position: 'topright' }).addTo(this.map);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 19
        }).addTo(this.map);

        this.boundaryLayer = L.layerGroup().addTo(this.map);
        this.routeLayer = L.layerGroup().addTo(this.map);
        this.markerLayer = L.layerGroup().addTo(this.map);

        this.drawUOWBoundary();
        return this;
    },

    drawUOWBoundary() {
        // Outer 5km service area circle (dashed) — shows the walking radius
        L.circle(this.UOW_CENTER, {
            radius: this.UOW_RADIUS,
            color: '#1abc9c',
            weight: 2,
            opacity: 0.45,
            fillColor: '#1abc9c',
            fillOpacity: 0.03,
            dashArray: '12, 10',
            interactive: false
        }).addTo(this.boundaryLayer);

        // Pulsing animation at campus center (the single visible campus ring)
        const pulsingIcon = L.divIcon({
            className: '',
            html: `<div class="uow-pulse-ring"></div>`,
            iconSize: [80, 80],
            iconAnchor: [40, 40]
        });
        L.marker(this.UOW_CENTER, { icon: pulsingIcon, interactive: false })
          .addTo(this.boundaryLayer);

        // UOW campus centre marker
        L.marker(this.UOW_CENTER, {
            icon: L.divIcon({
                className: 'uow-marker-container',
                html: `<div class="uow-marker"><span class="uow-marker__icon">🎓</span></div>`,
                iconSize: [44, 44],
                iconAnchor: [22, 22]
            }),
            interactive: true,
            zIndexOffset: 500
        }).bindPopup(`
            <div style="font-family:Inter,sans-serif;text-align:center;padding:6px 10px;">
                <strong style="font-size:14px;">University of Wollongong</strong><br>
                <span style="font-size:11px;color:#6b7280;">Walk start point · 5km service area</span>
            </div>
        `).addTo(this.boundaryLayer);

        // Service area label
        L.marker(
            [this.UOW_CENTER[0] + 0.044, this.UOW_CENTER[1]],
            {
                icon: L.divIcon({
                    className: 'boundary-label-container',
                    html: '<div class="boundary-label">5 km service area</div>',
                    iconSize: [110, 22],
                    iconAnchor: [55, 11]
                }),
                interactive: false
            }
        ).addTo(this.boundaryLayer);
    },

    setView(latitude, longitude, zoomLevel = 15) {
        if (this.map) this.map.setView([latitude, longitude], zoomLevel, { animate: true });
    },

    addUserMarker(latitude, longitude) {
        if (this.userMarker) this.map.removeLayer(this.userMarker);
        this.userMarker = L.marker([latitude, longitude], {
            icon: L.divIcon({
                className: 'user-marker-container',
                html: '<div class="user-marker"></div>',
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            })
        }).addTo(this.map).bindPopup('📍 You are here');
    },

    drawRoute(coordinates, routeColor = '#1a3a6b', startName = 'Start', endName = 'End') {
        if (!coordinates || coordinates.length < 2) return;

        const routeLine = L.polyline(coordinates, {
            color: routeColor,
            weight: 6,
            opacity: 0.88,
            smoothFactor: 1,
            lineCap: 'round',
            lineJoin: 'round'
        });
        this.routeLayer.addLayer(routeLine);

        const routeShadow = L.polyline(coordinates, {
            color: '#ffffff',
            weight: 9,
            opacity: 0.35,
            smoothFactor: 1,
            lineCap: 'round',
            lineJoin: 'round',
            interactive: false
        });
        this.routeLayer.addLayer(routeShadow);
        routeShadow.bringToBack();

        this._addDirectionArrows(coordinates, routeColor);

        // Start marker
        L.marker(coordinates[0], {
            icon: L.divIcon({
                className: 'route-marker-container',
                html: `<div class="route-marker route-marker--start">▶</div>
                       <div class="route-marker__label route-marker__label--start">${startName}</div>`,
                iconSize: [28, 52],
                iconAnchor: [14, 14]
            })
        }).bindPopup(`<b style="color:#10b981;">🟢 START</b><br>${startName}`)
          .addTo(this.markerLayer);

        // End marker
        L.marker(coordinates[coordinates.length - 1], {
            icon: L.divIcon({
                className: 'route-marker-container',
                html: `<div class="route-marker route-marker--end">⚑</div>
                       <div class="route-marker__label route-marker__label--end">${endName}</div>`,
                iconSize: [28, 52],
                iconAnchor: [14, 14]
            })
        }).bindPopup(`<b style="color:#ef4444;">🔴 END</b><br>${endName}`)
          .addTo(this.markerLayer);
    },

    _addDirectionArrows(coordinates, arrowColor) {
        const arrowPositions = [0.25, 0.5, 0.75];
        arrowPositions.forEach(fraction => {
            const pointIndex = Math.floor(fraction * (coordinates.length - 1));
            if (pointIndex < 1) return;
            const previousPoint = coordinates[pointIndex - 1];
            const currentPoint = coordinates[pointIndex];
            const angle = Math.atan2(currentPoint[1] - previousPoint[1], currentPoint[0] - previousPoint[0]) * (180 / Math.PI);
            L.marker(currentPoint, {
                icon: L.divIcon({
                    className: 'route-arrow-container',
                    html: `<div class="route-arrow" style="transform:rotate(${-angle + 90}deg);color:${arrowColor};">›</div>`,
                    iconSize: [14, 14],
                    iconAnchor: [7, 7]
                }),
                interactive: false
            }).addTo(this.routeLayer);
        });
    },

    clearRoutes() {
        if (this.routeLayer) this.routeLayer.clearLayers();
        if (this.markerLayer) this.markerLayer.clearLayers();
    },

    fitToRoute(coordinates) {
        if (!coordinates || coordinates.length < 2) return;
        this.map.fitBounds(L.latLngBounds(coordinates), {
            padding: [80, 50],
            maxZoom: 16,
            animate: true
        });
    },

    resetToUOW() {
        this.map.setView(this.UOW_CENTER, 14, { animate: true });
    },

    addClickHandler(callback) {
        if (this.map) {
            this.map.on('click', event => callback({ lat: event.latlng.lat, lng: event.latlng.lng }));
        }
    },

    invalidateSize() {
        if (this.map) setTimeout(() => this.map.invalidateSize(), 100);
    }
};
