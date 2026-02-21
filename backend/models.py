from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()

# Association tables for tags
note_label = db.Table('note_label',
    db.Column('note_id', db.Integer, db.ForeignKey('note.id'), primary_key=True),
    db.Column('label_id', db.Integer, db.ForeignKey('label.id'), primary_key=True)
)

task_label = db.Table('task_label',
    db.Column('task_id', db.Integer, db.ForeignKey('task.id'), primary_key=True),
    db.Column('label_id', db.Integer, db.ForeignKey('label.id'), primary_key=True)
)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=True) # Null if OAuth only
    oauth_id = db.Column(db.String(256), unique=True, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    folders = db.relationship('Folder', backref='owner', lazy=True)
    notes = db.relationship('Note', backref='owner', lazy=True)
    tasks = db.relationship('Task', backref='owner', lazy=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        if not self.password_hash:
            return False
        return check_password_hash(self.password_hash, password)

class Folder(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    parent_id = db.Column(db.Integer, db.ForeignKey('folder.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Self-referential relationship for sub-folders
    subfolders = db.relationship('Folder', backref=db.backref('parent', remote_side=[id]), lazy=True)
    notes = db.relationship('Note', backref='folder', lazy=True)

class Note(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False, default="Untitled Note")
    content = db.Column(db.Text, nullable=True)
    note_type = db.Column(db.String(50), default='text') # 'text' or 'link'
    link_url = db.Column(db.String(1024), nullable=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    folder_id = db.Column(db.Integer, db.ForeignKey('folder.id'), nullable=True)
    is_shared = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    labels = db.relationship('Label', secondary=note_label, lazy='subquery', backref=db.backref('notes', lazy=True))
    attachments = db.relationship('FileAttachment', backref='note', lazy=True)
    collaborators = db.relationship('Collaborator', backref='note', lazy=True)

class Task(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)
    category = db.Column(db.String(100), default="General")
    due_date = db.Column(db.Date, nullable=True)
    due_time = db.Column(db.Time, nullable=True)
    status = db.Column(db.String(20), default='pending')  # 'pending', 'working', 'completed'
    is_completed = db.Column(db.Boolean, default=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    labels = db.relationship('Label', secondary=task_label, lazy='subquery', backref=db.backref('tasks', lazy=True))

class Label(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False)
    color = db.Column(db.String(20), nullable=True) # Hex code or class
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

class FileAttachment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    url = db.Column(db.String(1024), nullable=False) # Cloud URL, local path, or Google Doc link
    type = db.Column(db.String(50), nullable=True) # google_doc, image, etc.
    note_id = db.Column(db.Integer, db.ForeignKey('note.id'), nullable=False)
    is_shared = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Collaborator(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    note_id = db.Column(db.Integer, db.ForeignKey('note.id'), nullable=False)
    permission = db.Column(db.String(20), default='read') # 'read', 'write'
    
    user = db.relationship('User', backref='collaborations')
