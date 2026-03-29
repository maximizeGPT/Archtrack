import React, { useState, useEffect } from 'react';
import type { Task, Project, Employee } from '../../../shared-types';

export const Tasks: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    projectId: '',
    assignedTo: '',
    priority: 'medium',
    estimatedHours: '',
    status: 'todo'
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setError(null);
      const [tasksRes, projectsRes, employeesRes] = await Promise.all([
        fetch('/api/tasks'),
        fetch('/api/projects'),
        fetch('/api/employees')
      ]);

      if (!tasksRes.ok || !projectsRes.ok || !employeesRes.ok) {
        throw new Error('Failed to load data');
      }

      const [tasksData, projectsData, employeesData] = await Promise.all([
        tasksRes.json(),
        projectsRes.json(),
        employeesRes.json()
      ]);

      if (tasksData.success) setTasks(tasksData.data);
      if (projectsData.success) setProjects(projectsData.data);
      if (employeesData.success) setEmployees(employeesData.data);
    } catch (err) {
      console.error('Error loading tasks:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validation
    if (!formData.name.trim()) {
      setFormError('Task name is required');
      return;
    }
    if (!formData.projectId) {
      setFormError('Please select a project');
      return;
    }

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

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to save task: ${res.status}`);
      }

      const data = await res.json();
      if (data.success) {
        setShowForm(false);
        setEditingTask(null);
        setFormData({ name: '', description: '', projectId: '', assignedTo: '', priority: 'medium', estimatedHours: '', status: 'todo' });
        loadData();
      } else {
        throw new Error(data.error || 'Failed to save task');
      }
    } catch (err) {
      console.error('Error saving task:', err);
      setFormError(err instanceof Error ? err.message : 'Failed to save task');
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
      estimatedHours: task.estimatedHours?.toString() || '',
      status: task.status
    });
    setShowForm(true);
  };

  const handleStatusChange = async (task: Task, newStatus: string) => {
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });

      if (!res.ok) {
        throw new Error('Failed to update status');
      }

      const data = await res.json();
      if (data.success) {
        setTasks(tasks.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
      }
    } catch (err) {
      console.error('Error updating status:', err);
      alert('Failed to update status');
    }
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

  if (error) {
    return (
      <div style={styles.container}>
        <div style={errorStyles.container}>
          <div style={errorStyles.icon}>⚠️</div>
          <h2 style={errorStyles.title}>Error Loading Tasks</h2>
          <p style={errorStyles.message}>{error}</p>
          <button onClick={loadData} style={errorStyles.retryButton}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Tasks</h1>
        <button
          style={styles.addButton}
          onClick={() => {
            setEditingTask(null);
            setFormData({ name: '', description: '', projectId: '', assignedTo: '', priority: 'medium', estimatedHours: '', status: 'todo' });
            setShowForm(true);
          }}
        >
          + Add Task
        </button>
      </header>

      {showForm && (
        <div
          style={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div style={styles.modalContent}>
            <h2 id="modal-title" style={styles.modalTitle}>
              {editingTask ? 'Edit Task' : 'Add Task'}
            </h2>
            <form onSubmit={handleSubmit} style={styles.form}>
              {formError && (
                <div style={styles.errorBanner}>
                  ⚠️ {formError}
                </div>
              )}
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
              {editingTask && (
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Status</label>
                  <select
                    value={formData.status}
                    onChange={e => setFormData({...formData, status: e.target.value})}
                    style={styles.input}
                  >
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              )}
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
              <select
                value={task.status}
                onChange={e => handleStatusChange(task, e.target.value)}
                style={styles.statusDropdown}
              >
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
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

const errorStyles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px',
    textAlign: 'center'
  },
  icon: {
    fontSize: '48px',
    marginBottom: '16px'
  },
  title: {
    fontSize: '24px',
    fontWeight: 600,
    color: '#e74c3c',
    marginBottom: '8px'
  },
  message: {
    fontSize: '16px',
    color: '#7f8c8d',
    marginBottom: '24px'
  },
  retryButton: {
    padding: '12px 24px',
    backgroundColor: '#3498db',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 500,
    cursor: 'pointer'
  }
};

const styles: { [key: string]: React.CSSProperties | any } = {
  container: {
    padding: '32px',
    '@media (max-width: 768px)': {
      padding: '16px'
    }
  },
  loading: {
    padding: '40px',
    textAlign: 'center'
  },
  errorBanner: {
    backgroundColor: '#fdf2f2',
    border: '1px solid #fee2e2',
    color: '#e74c3c',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '16px',
    fontWeight: 500
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    '@media (max-width: 768px)': {
      flexDirection: 'column',
      gap: '12px',
      alignItems: 'flex-start'
    }
  },
  title: {
    fontSize: '28px',
    fontWeight: 600,
    color: '#2c3e50',
    '@media (max-width: 768px)': {
      fontSize: '22px'
    }
  },
  addButton: {
    padding: '12px 24px',
    backgroundColor: '#27ae60',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
    '@media (max-width: 768px)': {
      width: '100%',
      padding: '14px 24px'
    }
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
    maxWidth: '450px',
    '@media (max-width: 768px)': {
      margin: '16px',
      padding: '20px',
      maxHeight: '90vh',
      overflowY: 'auto'
    }
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
    fontSize: '14px',
    '@media (max-width: 768px)': {
      fontSize: '16px', // Prevent zoom on iOS
      padding: '14px'
    }
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
    gap: '16px',
    '@media (max-width: 768px)': {
      gridTemplateColumns: '1fr',
      gap: '12px'
    }
  },
  card: {
    backgroundColor: '#fff',
    padding: '20px',
    borderRadius: '12px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    '@media (max-width: 768px)': {
      padding: '16px'
    }
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
    gap: '8px',
    '@media (max-width: 768px)': {
      flexDirection: 'column'
    }
  },
  statusDropdown: {
    flex: 1,
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px',
    backgroundColor: '#fff',
    cursor: 'pointer',
    '@media (max-width: 768px)': {
      fontSize: '16px', // Prevent zoom on iOS
      padding: '12px'
    }
  },
  editButton: {
    flex: 1,
    padding: '8px',
    backgroundColor: '#3498db',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    '@media (max-width: 768px)': {
      padding: '12px',
      fontSize: '14px'
    }
  }
};
