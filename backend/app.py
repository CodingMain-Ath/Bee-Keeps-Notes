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

def create_app():
    app = Flask(__name__, static_folder=None)
    
    # Configuration
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', secrets.token_hex(32))
    
    # Database config (SQLite default)
    db_path = os.path.join(os.path.abspath(os.path.dirname(__file__)), 'notes.db')
    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', f'sqlite:///{db_path}')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    # Session config for local development
    # SameSite='Lax' works for same-origin requests (frontend served by Flask)
    # Secure=False is required for http:// (not HTTPS)
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
    app.config['SESSION_COOKIE_SECURE'] = False
    app.config['SESSION_COOKIE_HTTPONLY'] = True

    # Initialize extensions
    CORS(app, supports_credentials=True)
    db.init_app(app)
    bcrypt = Bcrypt(app)
    socketio = SocketIO(app, cors_allowed_origins="*")
    
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
        
    return app, socketio

if __name__ == '__main__':
    app, socketio = create_app()
    print(f"\n  → Open http://127.0.0.1:5000 in your browser\n")
    socketio.run(app, debug=True, port=5000)

