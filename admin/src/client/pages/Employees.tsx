import React, { useState, useEffect } from 'react';
import type { Employee } from '../../../shared-types';
import { api } from '../lib/api';

export const Employees: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [setupToken, setSetupToken] = useState<{ token: string; employeeName: string } | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'employee',
    department: '',
    hourlyRate: ''
  });

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    try {
      setError(null);
      const data = await api.get('/api/employees');
      if (data.success) {
        setEmployees(data.data);
      } else {
        throw new Error(data.error || 'Failed to load employees');
      }
    } catch (err) {
      console.error('Error loading employees:', err);
      setError(err instanceof Error ? err.message : 'Failed to load employees');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validation
    if (!formData.name.trim()) {
      setFormError('Name is required');
      return;
    }
    if (!formData.email.trim()) {
      setFormError('Email is required');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setFormError('Please enter a valid email address');
      return;
    }

    const url = editingEmployee
      ? `/api/employees/${editingEmployee.id}`
      : '/api/employees';

    try {
      const payload = {
        ...formData,
        hourlyRate: parseFloat(formData.hourlyRate) || 0
      };

      const data = editingEmployee
        ? await api.put(url, payload)
        : await api.post(url, payload);

      if (data.success) {
        setShowForm(false);
        setEditingEmployee(null);
        setFormData({ name: '', email: '', role: 'employee', department: '', hourlyRate: '' });
        loadEmployees();
      } else {
        throw new Error(data.error || 'Failed to save employee');
      }
    } catch (err) {
      console.error('Error saving employee:', err);
      setFormError(err instanceof Error ? err.message : 'Failed to save employee');
    }
  };

  const handleEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    setFormData({
      name: employee.name,
      email: employee.email,
      role: employee.role,
      department: employee.department || '',
      hourlyRate: employee.hourlyRate?.toString() || ''
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this employee?')) return;

    try {
      const data = await api.delete(`/api/employees/${id}`);
      if (data.success) {
        loadEmployees();
      } else {
        throw new Error(data.error || 'Failed to delete employee');
      }
    } catch (err) {
      console.error('Error deleting employee:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete employee');
    }
  };

  const handleGenerateSetupToken = async (employee: Employee) => {
    try {
      const data = await api.post('/api/auth/setup-token', { employeeId: employee.id });
      setSetupToken({ token: data.token || data.setupToken, employeeName: employee.name });
    } catch (err) {
      console.error('Error generating setup token:', err);
      alert(err instanceof Error ? err.message : 'Failed to generate setup token');
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
          <h2 style={errorStyles.title}>Error Loading Employees</h2>
          <p style={errorStyles.message}>{error}</p>
          <button onClick={loadEmployees} style={errorStyles.retryButton}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Employees</h1>
        <button
          style={styles.addButton}
          onClick={() => {
            setEditingEmployee(null);
            setFormData({ name: '', email: '', role: 'employee', department: '', hourlyRate: '' });
            setShowForm(true);
          }}
        >
          + Add Employee
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
              {editingEmployee ? 'Edit Employee' : 'Add Employee'}
            </h2>
            <form onSubmit={handleSubmit} style={styles.form}>
              {formError && (
                <div style={styles.errorBanner}>
                  ⚠️ {formError}
                </div>
              )}
              <div style={styles.inputGroup}>
                <label style={styles.label}>Name *</label>
                <input
                  type="text"
                  placeholder="e.g. John Smith"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  style={styles.input}
                  required
                />
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Email *</label>
                <input
                  type="email"
                  placeholder="e.g. john@company.com"
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                  style={styles.input}
                  required
                />
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Role</label>
                <select
                  value={formData.role}
                  onChange={e => setFormData({...formData, role: e.target.value})}
                  style={styles.input}
                >
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Department</label>
                <input
                  type="text"
                  placeholder="e.g. Engineering"
                  value={formData.department}
                  onChange={e => setFormData({...formData, department: e.target.value})}
                  style={styles.input}
                />
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Hourly Rate ($)</label>
                <input
                  type="number"
                  placeholder="e.g. 50"
                  value={formData.hourlyRate}
                  onChange={e => setFormData({...formData, hourlyRate: e.target.value})}
                  style={styles.input}
                  min="0"
                  step="0.01"
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
                  {editingEmployee ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Setup Token Modal */}
      {setupToken && (
        <div
          style={styles.modal}
          role="dialog"
          aria-modal="true"
          onClick={() => setSetupToken(null)}
        >
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Setup Token</h2>
            <p style={{ color: '#555', fontSize: '14px', marginBottom: '12px' }}>
              Setup token for <strong>{setupToken.employeeName}</strong>:
            </p>
            <div style={{
              backgroundColor: '#f8f9fa',
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
              padding: '16px',
              fontFamily: 'monospace',
              fontSize: '13px',
              wordBreak: 'break-all',
              color: '#2c3e50',
              marginBottom: '16px',
            }}>
              {setupToken.token}
            </div>
            <p style={{ color: '#999', fontSize: '12px', marginBottom: '16px' }}>
              Share this token with the employee so they can set up their account.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(setupToken.token);
                }}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#3498db',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                }}
              >
                Copy Token
              </button>
              <button
                onClick={() => setSetupToken(null)}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#ecf0f1',
                  color: '#333',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={styles.grid}>
        {employees.map(employee => (
          <div key={employee.id} style={styles.card}>
            <div style={styles.cardHeader}>
              <h3 style={styles.employeeName}>{employee.name}</h3>
              <span style={styles.roleBadge(employee.role)}>{employee.role}</span>
            </div>
            <div style={styles.cardBody}>
              <p style={styles.info}>📧 {employee.email}</p>
              {employee.department && <p style={styles.info}>🏢 {employee.department}</p>}
              {employee.hourlyRate && <p style={styles.info}>💰 ${employee.hourlyRate}/hr</p>}
            </div>
            <div style={styles.cardActions}>
              <button onClick={() => handleEdit(employee)} style={styles.editButton}>
                Edit
              </button>
              <button onClick={() => handleGenerateSetupToken(employee)} style={styles.setupButton}>
                Setup Token
              </button>
              <button onClick={() => handleDelete(employee.id)} style={styles.deleteButton}>
                Delete
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
    maxWidth: '400px'
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
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
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
    alignItems: 'center',
    marginBottom: '12px'
  },
  employeeName: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#2c3e50'
  },
  roleBadge: (role: string) => ({
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    backgroundColor: role === 'admin' ? '#e74c3c' : role === 'manager' ? '#f39c12' : '#3498db',
    color: '#fff'
  }),
  cardBody: {
    marginBottom: '16px'
  },
  info: {
    fontSize: '14px',
    color: '#666',
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
  },
  setupButton: {
    flex: 1,
    padding: '8px',
    backgroundColor: '#8e44ad',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px'
  },
  deleteButton: {
    flex: 1,
    padding: '8px',
    backgroundColor: '#e74c3c',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px'
  }
};
