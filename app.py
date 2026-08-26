from flask import Flask, render_template
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_talisman import Talisman
from config import Config
from backend.database.db import init_db
from backend.routes.mood_api import mood_bp
from backend.routes.route_api import route_bp
from backend.routes.rating_api import rating_bp


def create_app():
    app = Flask(
        __name__,
        template_folder='frontend/templates',
        static_folder='frontend/static'
    )
    app.config.from_object(Config)

    is_production = not Config.DEBUG
    Talisman(
        app,
        force_https=is_production,
        strict_transport_security=is_production,
        content_security_policy={
            'default-src': ["'self'"],
            'script-src':  ["'self'", "'unsafe-inline'", 'unpkg.com'],
            'style-src':   ["'self'", "'unsafe-inline'", 'fonts.googleapis.com', 'unpkg.com'],
            'font-src':    ["'self'", 'fonts.gstatic.com'],
            'img-src':     ["'self'", 'data:', '*.tile.openstreetmap.org',
                            'nominatim.openstreetmap.org'],
            'connect-src': ["'self'",
                            # Geocoding
                            'https://nominatim.openstreetmap.org',
                            # Walking route geometry
                            'https://router.project-osrm.org',
                            # Greenery and noise data
                            'https://overpass-api.de',
                            # Elevation data
                            'https://api.open-elevation.com',
                            # Weather data
                            'https://api.openweathermap.org',
                            # Crowd density
                            'https://api.foursquare.com'],
        },
        content_security_policy_nonce_in=['script-src'],
        referrer_policy='no-referrer',
    )

    CORS(app)

    Limiter(
        key_func=get_remote_address,
        app=app,
        default_limits=[Config.RATE_LIMIT]
    )

    init_db(app)

    app.register_blueprint(mood_bp, url_prefix='/api')
    app.register_blueprint(route_bp, url_prefix='/api')
    app.register_blueprint(rating_bp, url_prefix='/api')

    # Warm up the NLP model in a background thread immediately when the server starts.
    # This means the model check (and any network timeout) happens once during startup
    # rather than blocking the very first user request.
    import threading
    def warmup_nlp():
        from backend.services.nlp_service import MoodDetector
        detector = MoodDetector()
        detector._load_model()

    threading.Thread(target=warmup_nlp, daemon=True).start()

    @app.route('/')
    def index():
        return render_template('index.html')

    return app


if __name__ == '__main__':
    application = create_app()
    application.run(host='0.0.0.0', port=5000, debug=Config.DEBUG)
