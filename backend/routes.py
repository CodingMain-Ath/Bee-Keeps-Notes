from flask import Blueprint, request, jsonify, session
from models import db, Folder, Note, Task, Label, FileAttachment, User, Collaborator
from datetime import datetime

api_bp = Blueprint('api', __name__)

def require_auth(f):
    def wrap(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    wrap.__name__ = f.__name__
    return wrap

# --- FOLDERS ---
@api_bp.route('/folders', methods=['GET'])
@require_auth
def get_folders():
    folders = Folder.query.filter_by(user_id=session['user_id']).all()
    result = [{'id': f.id, 'name': f.name, 'parent_id': f.parent_id} for f in folders]
    return jsonify(result), 200

@api_bp.route('/folders', methods=['POST'])
@require_auth
def create_folder():
    data = request.get_json()
    name = data.get('name')
    parent_id = data.get('parent_id')
    
    folder = Folder(name=name, user_id=session['user_id'], parent_id=parent_id)
    db.session.add(folder)
    db.session.commit()
    return jsonify({'id': folder.id, 'name': folder.name, 'parent_id': folder.parent_id}), 201

@api_bp.route('/folders/<int:folder_id>', methods=['DELETE'])
@require_auth
def delete_folder(folder_id):
    folder = Folder.query.filter_by(id=folder_id, user_id=session['user_id']).first()
    if not folder:
        return jsonify({'error': 'Folder not found'}), 404
    db.session.delete(folder)
    db.session.commit()
    return jsonify({'message': 'Deleted'}), 200

# --- NOTES ---
@api_bp.route('/notes', methods=['GET'])
@require_auth
def get_notes():
    user_id = session['user_id']
    owned_notes = Note.query.filter_by(user_id=user_id).all()
    
    collaborations = Collaborator.query.filter_by(user_id=user_id).all()
    shared_note_ids = [c.note_id for c in collaborations]
    shared_notes = Note.query.filter(Note.id.in_(shared_note_ids)).all() if shared_note_ids else []
    
    all_notes = list({n.id: n for n in (owned_notes + shared_notes)}.values())
    
    result = []
    for n in all_notes:
        note_data = {'id': n.id, 'title': n.title, 'folder_id': n.folder_id, 'is_shared': n.is_shared, 'user_id': n.user_id, 'is_owner': n.user_id == user_id, 'note_type': n.note_type, 'link_url': n.link_url}
        if n.is_shared:
            collabs = Collaborator.query.filter_by(note_id=n.id).all()
            note_data['collaborators'] = []
            for c in collabs:
                u = User.query.get(c.user_id)
                if u:
                    note_data['collaborators'].append({'email': u.email, 'username': u.username, 'permission': c.permission})
        result.append(note_data)
    return jsonify(result), 200

@api_bp.route('/notes', methods=['POST'])
@require_auth
def create_note():
    data = request.get_json()
    note = Note(
        title=data.get('title', 'Untitled'),
        content=data.get('content', ''),
        note_type=data.get('note_type', 'text'),
        link_url=data.get('link_url'),
        folder_id=data.get('folder_id'),
        user_id=session['user_id']
    )
    db.session.add(note)
    db.session.commit()
    return jsonify({'id': note.id, 'title': note.title, 'note_type': note.note_type}), 201

@api_bp.route('/notes/<int:note_id>', methods=['GET'])
@require_auth
def get_note(note_id):
    note = Note.query.get(note_id)
    if not note:
        return jsonify({'error': 'Not found'}), 404
        
    is_owner = (note.user_id == session['user_id'])
    has_access = is_owner
    if not is_owner:
        collab = Collaborator.query.filter_by(note_id=note.id, user_id=session['user_id']).first()
        if collab:
            has_access = True
            
    if not has_access:
        return jsonify({'error': 'Unauthorized'}), 403
        
    return jsonify({
        'id': note.id, 'title': note.title, 'content': note.content,
        'note_type': note.note_type, 'link_url': note.link_url,
        'folder_id': note.folder_id, 'is_shared': note.is_shared,
        'is_owner': is_owner,
        'attachments': [{'id': a.id, 'url': a.url, 'name': a.name} for a in note.attachments]
    }), 200

@api_bp.route('/notes/<int:note_id>', methods=['PUT'])
@require_auth
def update_note(note_id):
    note = Note.query.get(note_id)
    if not note:
        return jsonify({'error': 'Not found'}), 404
        
    is_owner = (note.user_id == session['user_id'])
    has_write_access = is_owner
    if not is_owner:
        collab = Collaborator.query.filter_by(note_id=note.id, user_id=session['user_id']).first()
        if collab and collab.permission == 'write':
            has_write_access = True
            
    if not has_write_access:
        return jsonify({'error': 'Unauthorized to edit'}), 403
    
    data = request.get_json()
    if 'title' in data: note.title = data['title']
    if 'content' in data: note.content = data['content']
    if 'note_type' in data: note.note_type = data['note_type']
    if 'link_url' in data: note.link_url = data['link_url']
    if 'folder_id' in data and is_owner: note.folder_id = data['folder_id']
    if 'is_shared' in data and is_owner: note.is_shared = data['is_shared']
    
    db.session.commit()
    return jsonify({'message': 'Updated'}), 200

@api_bp.route('/notes/<int:note_id>', methods=['DELETE'])
@require_auth
def delete_note(note_id):
    note = Note.query.filter_by(id=note_id, user_id=session['user_id']).first()
    if not note:
        return jsonify({'error': 'Not found'}), 404
    db.session.delete(note)
    db.session.commit()
    return jsonify({'message': 'Deleted'}), 200

@api_bp.route('/notes/<int:note_id>/share', methods=['GET', 'POST', 'DELETE'])
@require_auth
def manage_share(note_id):
    note = Note.query.filter_by(id=note_id, user_id=session['user_id']).first()
    if not note:
        return jsonify({'error': 'Note not found or unauthorized'}), 404

    if request.method == 'GET':
        collabs = Collaborator.query.filter_by(note_id=note.id).all()
        result = []
        for c in collabs:
            u = User.query.get(c.user_id)
            if u:
                result.append({'id': c.id, 'email': u.email, 'permission': c.permission})
        return jsonify(result), 200
        
    if request.method == 'DELETE':
        data = request.get_json()
        collab_id = data.get('collab_id')
        collab = Collaborator.query.filter_by(id=collab_id, note_id=note.id).first()
        if not collab:
            return jsonify({'error': 'Collaborator not found'}), 404
        db.session.delete(collab)
        
        # Check if we should unshare
        remaining = Collaborator.query.filter_by(note_id=note.id).count()
        if remaining == 0:
            note.is_shared = False
            
        db.session.commit()
        return jsonify({'message': 'Removed collaborator'}), 200

    # POST (Add or Update)
    data = request.get_json()
    email = data.get('email')
    permission = data.get('permission', 'read')
    
    target_user = User.query.filter_by(email=email).first()
    if not target_user:
        return jsonify({'error': 'User with this email not found'}), 404
        
    if target_user.id == session['user_id']:
        return jsonify({'error': 'Cannot share with yourself'}), 400
        
    existing = Collaborator.query.filter_by(note_id=note.id, user_id=target_user.id).first()
    if existing:
        existing.permission = permission
    else:
        collab = Collaborator(user_id=target_user.id, note_id=note.id, permission=permission)
        db.session.add(collab)
        
    note.is_shared = True
    db.session.commit()
    return jsonify({'message': 'Shared successfully'}), 200

# --- TASKS ---
@api_bp.route('/tasks', methods=['GET'])
@require_auth
def get_tasks():
    tasks = Task.query.filter_by(user_id=session['user_id']).all()
    result = [{
        'id': t.id, 'title': t.title, 'category': t.category,
        'due_date': str(t.due_date) if t.due_date else None,
        'due_time': str(t.due_time) if t.due_time else None,
        'status': t.status or ('completed' if t.is_completed else 'pending'),
        'is_completed': t.is_completed
    } for t in tasks]
    return jsonify(result), 200

@api_bp.route('/tasks', methods=['POST'])
@require_auth
def create_task():
    data = request.get_json()
    due_date = datetime.strptime(data['due_date'], '%Y-%m-%d').date() if data.get('due_date') else None
    due_time = datetime.strptime(data['due_time'], '%H:%M').time() if data.get('due_time') else None
    
    task = Task(
        title=data.get('title'),
        category=data.get('category', 'General'),
        status=data.get('status', 'pending'),
        due_date=due_date,
        due_time=due_time,
        user_id=session['user_id']
    )
    db.session.add(task)
    db.session.commit()
    return jsonify({'id': task.id, 'title': task.title, 'category': task.category}), 201

@api_bp.route('/tasks/<int:task_id>', methods=['PUT', 'DELETE'])
@require_auth
def manage_task(task_id):
    task = Task.query.filter_by(id=task_id, user_id=session['user_id']).first()
    if not task:
        return jsonify({'error': 'Not found'}), 404
        
    if request.method == 'DELETE':
        db.session.delete(task)
        db.session.commit()
        return jsonify({'message': 'Deleted'}), 200
        
    data = request.get_json()
    if 'is_completed' in data: task.is_completed = data['is_completed']
    if 'title' in data: task.title = data['title']
    if 'status' in data:
        task.status = data['status']
        task.is_completed = (data['status'] == 'completed')
    
    db.session.commit()
    return jsonify({'message': 'Updated'}), 200

# --- ATTACHMENTS (Google Docs/Sheets/Uploads context) ---
@api_bp.route('/notes/<int:note_id>/attachments', methods=['POST'])
@require_auth
def add_attachment(note_id):
    note = Note.query.filter_by(id=note_id, user_id=session['user_id']).first()
    if not note:
        return jsonify({'error': 'Note not found'}), 404
        
    data = request.get_json()
    att = FileAttachment(
        name=data.get('name', 'Link'),
        url=data.get('url'),
        type=data.get('type', 'link'),
        note_id=note.id
    )
    db.session.add(att)
    db.session.commit()
    return jsonify({'id': att.id, 'name': att.name, 'url': att.url}), 201
