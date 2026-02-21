import os
import secrets
from flask import Flask, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO
from flask_bcrypt import Bcrypt
from models import db
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Path to frontend directory
FRONTEND_DIR = os.path.join(os.path.abspath(os.path.dirname(__file__)), '..', 'frontend')

socketio = SocketIO()

def create_app():
    app = Flask(__name__, static_folder=None)
    
    # Configuration
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', secrets.token_hex(32))
    
    # Database config (SQLite default)
    db_path = os.path.join(os.path.abspath(os.path.dirname(__file__)), 'notes.db')
    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', f'sqlite:///{db_path}')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    # Session cookies — auto-detect production (RENDER env var set by Render)
    is_production = os.environ.get('RENDER', False)
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
    app.config['SESSION_COOKIE_SECURE'] = bool(is_production)
    app.config['SESSION_COOKIE_HTTPONLY'] = True

    # Initialize extensions
    CORS(app, supports_credentials=True)
    db.init_app(app)
    bcrypt = Bcrypt(app)
    socketio.init_app(app, cors_allowed_origins="*")
    
    # Register Blueprints
    from auth import auth_bp
    from routes import api_bp
    app.register_blueprint(auth_bp, url_prefix='/auth')
    app.register_blueprint(api_bp, url_prefix='/api')

    from sockets import register_socket_events
    register_socket_events(socketio)

    # ── Serve Frontend Files ──
    @app.route('/')
    def serve_index():
        return send_from_directory(FRONTEND_DIR, 'index.html')

    @app.route('/<path:filename>')
    def serve_frontend(filename):
        return send_from_directory(FRONTEND_DIR, filename)

    with app.app_context():
        # Create all tables
        db.create_all()
        
    return app

# Gunicorn entry: "app:create_app()"
# This works because gunicorn calls create_app() which returns the Flask app

if __name__ == '__main__':
    app = create_app()
    port = int(os.environ.get('PORT', 5000))
    print(f"\n  → Open http://127.0.0.1:{port} in your browser\n")
    socketio.run(app, debug=True, port=port)

