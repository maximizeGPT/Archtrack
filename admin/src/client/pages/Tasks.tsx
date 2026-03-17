import React, { useState, useEffect } from 'react';
import type { Task, Project, Employee } from '../../../shared-types';

export const Tasks: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    projectId: '',
    assignedTo: '',
    priority: 'medium',
    estimatedHours: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [tasksRes, projectsRes, employeesRes] = await Promise.all([
        fetch('/api/tasks'),
        fetch('/api/projects'),
        fetch('/api/employees')
      ]);

      const [tasksData, projectsData, employeesData] = await Promise.all([
        tasksRes.json(),
        projectsRes.json(),
        employeesRes.json()
      ]);

      if (tasksData.success) setTasks(tasksData.data);
      if (projectsData.success) setProjects(projectsData.data);
      if (employeesData.success) setEmployees(employeesData.data);
    } catch (error) {
      console.error('Error loading tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const url = editingTask 
      ? `/api/tasks/${editingTask.id}`
      : '/api/tasks';
    
    const method = editingTask ? 'PUT' : 'POST';
    
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          estimatedHours: parseFloat(formData.estimatedHours) || 0
        })
      });
      
      if (res.ok) {
        setShowForm(false);
        setEditingTask(null);
        setFormData({ name: '', description: '', projectId: '', assignedTo: '', priority: 'medium', estimatedHours: '' });
        loadData();
      }
    } catch (error) {
      console.error('Error saving task:', error);
    }
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setFormData({
      name: task.name,
      description: task.description || '',
      projectId: task.projectId,
      assignedTo: task.assignedTo || '',
      priority: task.priority,
      estimatedHours: task.estimatedHours?.toString() || ''
    });
    setShowForm(true);
  };

  const getProjectName = (projectId: string) => {
    return projects.find(p => p.id === projectId)?.name || 'Unknown Project';
  };

  const getEmployeeName = (employeeId?: string) => {
    if (!employeeId) return 'Unassigned';
    return employees.find(e => e.id === employeeId)?.name || 'Unknown';
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return '#e74c3c';
      case 'medium': return '#f39c12';
      case 'low': return '#27ae60';
      default: return '#7f8c8d';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#27ae60';
      case 'in_progress': return '#3498db';
      case 'todo': return '#95a5a6';
      default: return '#7f8c8d';
    }
  };

  if (loading) {
    return <div style={styles.loading}>Loading...</div>;
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Tasks</h1>
        <button 
          style={styles.addButton}
          onClick={() => {
            setEditingTask(null);
            setFormData({ name: '', description: '', projectId: '', assignedTo: '', priority: 'medium', estimatedHours: '' });
            setShowForm(true);
          }}
        >
          + Add Task
        </button>
      </header>

      {showForm && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h2 style={styles.modalTitle}>
              {editingTask ? 'Edit Task' : 'Add Task'}
            </h2>
            <form onSubmit={handleSubmit} style={styles.form}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Task Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Design floor plans"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  style={styles.input}
                  required
                />
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Description</label>
                <textarea
                  placeholder="Task details..."
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  style={{...styles.input, minHeight: '60px'}}
                />
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Project *</label>
                <select
                  value={formData.projectId}
                  onChange={e => setFormData({...formData, projectId: e.target.value})}
                  style={styles.input}
                  required
                >
                  <option value="">Select a project</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Assigned To</label>
                <select
                  value={formData.assignedTo}
                  onChange={e => setFormData({...formData, assignedTo: e.target.value})}
                  style={styles.input}
                >
                  <option value="">Unassigned</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Priority</label>
                <select
                  value={formData.priority}
                  onChange={e => setFormData({...formData, priority: e.target.value})}
                  style={styles.input}
                >
                  <option value="low">Low Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="high">High Priority</option>
                </select>
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Estimated Hours</label>
                <input
                  type="number"
                  placeholder="e.g. 8"
                  value={formData.estimatedHours}
                  onChange={e => setFormData({...formData, estimatedHours: e.target.value})}
                  style={styles.input}
                  min="0"
                  step="0.5"
                />
              </div>
              <div style={styles.formButtons}>
                <button 
                  type="button" 
                  onClick={() => setShowForm(false)}
                  style={styles.cancelButton}
                >
                  Cancel
                </button>
                <button type="submit" style={styles.saveButton}>
                  {editingTask ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div style={styles.grid}>
        {tasks.map(task => (
          <div key={task.id} style={styles.card}>
            <div style={styles.cardHeader}>
              <h3 style={styles.taskName}>{task.name}</h3>
              <div style={styles.badges}>
                <span style={styles.priorityBadge(getPriorityColor(task.priority))}>
                  {task.priority}
                </span>
                <span style={styles.statusBadge(getStatusColor(task.status))}>
                  {task.status}
                </span>
              </div>
            </div>
            <div style={styles.cardBody}>
              {task.description && (
                <p style={styles.description}>{task.description}</p>
              )}
              <p style={styles.info}>📁 {getProjectName(task.projectId)}</p>
              <p style={styles.info}>👤 {getEmployeeName(task.assignedTo)}</p>
              {task.estimatedHours && (
                <p style={styles.info}>⏱️ Est: {task.estimatedHours}h</p>
              )}
            </div>
            <div style={styles.cardActions}>
              <button onClick={() => handleEdit(task)} style={styles.editButton}>
                Edit
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties | any } = {
  container: {
    padding: '32px'
  },
  loading: {
    padding: '40px',
    textAlign: 'center'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px'
  },
  title: {
    fontSize: '28px',
    fontWeight: 600,
    color: '#2c3e50'
  },
  addButton: {
    padding: '12px 24px',
    backgroundColor: '#27ae60',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500
  },
  modal: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: '32px',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '450px'
  },
  modalTitle: {
    marginBottom: '20px',
    color: '#2c3e50'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  label: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#555'
  },
  input: {
    padding: '12px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px'
  },
  formButtons: {
    display: 'flex',
    gap: '12px',
    marginTop: '8px'
  },
  cancelButton: {
    flex: 1,
    padding: '12px',
    backgroundColor: '#ecf0f1',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer'
  },
  saveButton: {
    flex: 1,
    padding: '12px',
    backgroundColor: '#27ae60',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 500
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
    gap: '16px'
  },
  card: {
    backgroundColor: '#fff',
    padding: '20px',
    borderRadius: '12px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '12px'
  },
  taskName: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#2c3e50',
    margin: 0,
    flex: 1
  },
  badges: {
    display: 'flex',
    gap: '6px'
  },
  priorityBadge: (color: string) => ({
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 600,
    textTransform: 'uppercase',
    backgroundColor: `${color}20`,
    color: color
  }),
  statusBadge: (color: string) => ({
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 600,
    textTransform: 'uppercase',
    backgroundColor: `${color}20`,
    color: color
  }),
  cardBody: {
    marginBottom: '16px'
  },
  description: {
    fontSize: '14px',
    color: '#666',
    marginBottom: '12px',
    lineHeight: 1.5
  },
  info: {
    fontSize: '13px',
    color: '#7f8c8d',
    margin: '4px 0'
  },
  cardActions: {
    display: 'flex',
    gap: '8px'
  },
  editButton: {
    flex: 1,
    padding: '8px',
    backgroundColor: '#3498db',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px'
  }
};