import React, { useState, useEffect } from 'react';
import type { Project } from '../../../shared-types';

export const Projects: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    clientName: '',
    budget: ''
  });

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setError(null);
      const res = await fetch('/api/projects');
      if (!res.ok) {
        throw new Error(`Failed to load projects: ${res.status}`);
      }
      const data = await res.json();
      if (data.success) {
        setProjects(data.data);
      } else {
        throw new Error(data.error || 'Failed to load projects');
      }
    } catch (err) {
      console.error('Error loading projects:', err);
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validation
    if (!formData.name.trim()) {
      setFormError('Project name is required');
      return;
    }

    const url = editingProject
      ? `/api/projects/${editingProject.id}`
      : '/api/projects';

    const method = editingProject ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          budget: parseFloat(formData.budget) || 0
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to save project: ${res.status}`);
      }

      const data = await res.json();
      if (data.success) {
        setShowForm(false);
        setEditingProject(null);
        setFormData({ name: '', description: '', clientName: '', budget: '' });
        loadProjects();
      } else {
        throw new Error(data.error || 'Failed to save project');
      }
    } catch (err) {
      console.error('Error saving project:', err);
      setFormError(err instanceof Error ? err.message : 'Failed to save project');
    }
  };

  const handleEdit = (project: Project) => {
    setEditingProject(project);
    setFormData({
      name: project.name,
      description: project.description || '',
      clientName: project.clientName || '',
      budget: project.budget?.toString() || ''
    });
    setShowForm(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '#27ae60';
      case 'completed': return '#3498db';
      case 'archived': return '#95a5a6';
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
          <h2 style={errorStyles.title}>Error Loading Projects</h2>
          <p style={errorStyles.message}>{error}</p>
          <button onClick={loadProjects} style={errorStyles.retryButton}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Projects</h1>
        <button
          style={styles.addButton}
          onClick={() => {
            setEditingProject(null);
            setFormData({ name: '', description: '', clientName: '', budget: '' });
            setShowForm(true);
          }}
        >
          + Add Project
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
              {editingProject ? 'Edit Project' : 'Add Project'}
            </h2>
            <form onSubmit={handleSubmit} style={styles.form}>
              {formError && (
                <div style={styles.errorBanner}>
                  ⚠️ {formError}
                </div>
              )}
              <div style={styles.inputGroup}>
                <label style={styles.label}>Project Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Smith Residence"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  style={styles.input}
                  required
                />
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Description</label>
                <textarea
                  placeholder="Project details..."
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  style={{...styles.input, minHeight: '80px'}}
                />
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Client Name</label>
                <input
                  type="text"
                  placeholder="e.g. John Smith"
                  value={formData.clientName}
                  onChange={e => setFormData({...formData, clientName: e.target.value})}
                  style={styles.input}
                />
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Budget ($)</label>
                <input
                  type="number"
                  placeholder="e.g. 50000"
                  value={formData.budget}
                  onChange={e => setFormData({...formData, budget: e.target.value})}
                  style={styles.input}
                  min="0"
                  step="1000"
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
                  {editingProject ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div style={styles.grid}>
        {projects.map(project => (
          <div key={project.id} style={styles.card}>
            <div style={styles.cardHeader}>
              <h3 style={styles.projectName}>{project.name}</h3>
              <span style={styles.statusBadge(getStatusColor(project.status))}>
                {project.status}
              </span>
            </div>
            <div style={styles.cardBody}>
              {project.description && (
                <p style={styles.description}>{project.description}</p>
              )}
              {project.clientName && (
                <p style={styles.info}>👤 {project.clientName}</p>
              )}
              {project.budget && (
                <p style={styles.info}>💰 Budget: ${project.budget.toLocaleString()}</p>
              )}
              <p style={styles.info}>
                📅 Started: {new Date(project.startDate).toLocaleDateString()}
              </p>
            </div>
            <div style={styles.cardActions}>
              <button onClick={() => handleEdit(project)} style={styles.editButton}>
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
    padding: '32px'
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
    fontSize: '14px',
    fontFamily: 'inherit'
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
  projectName: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#2c3e50',
    margin: 0,
    flex: 1
  },
  statusBadge: (color: string) => ({
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '11px',
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
