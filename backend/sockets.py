from flask_socketio import emit, join_room, leave_room
from models import db, Note

def register_socket_events(socketio):
    @socketio.on('join_document')
    def handle_join_document(data):
        room = data.get('document_id')
        user_id = data.get('user_id')
        if not room:
            return
            
        join_room(room)
        # Notify others in room
        emit('user_joined', {'user_id': user_id}, room=room, include_self=False)

    @socketio.on('leave_document')
    def handle_leave_document(data):
        room = data.get('document_id')
        user_id = data.get('user_id')
        if not room:
            return
            
        leave_room(room)
        # Notify others
        emit('user_left', {'user_id': user_id}, room=room, include_self=False)

    @socketio.on('edit_document')
    def handle_edit_document(data):
        room = data.get('document_id')
        content = data.get('content')
        user_id = data.get('user_id')
        
        if not room or content is None:
            return
            
        # Broadcast changes to others in the room
        emit('document_updated', {
            'document_id': room,
            'content': content,
            'user_id': user_id
        }, room=room, include_self=False)
        
        # We can also periodically save to the database here if needed.
        # However, for simplicity and performance, the frontend usually sends a final PUT request or a debounced SAVE.
        
    @socketio.on('save_document')
    def handle_save_document(data):
        # Optional event for explicitly saving via websockets
        room = data.get('document_id')
        content = data.get('content')
        
        if room and content is not None:
            note = Note.query.get(room)
            if note:
                note.content = content
                db.session.commit()
                emit('document_saved', {'document_id': room}, room=room)
