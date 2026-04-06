import React, { useState, useEffect } from 'react';
import type { Employee } from '../../../shared-types';
import { SUPPORTED_CURRENCIES, formatCurrency, JOB_ROLES } from '../../../shared-types';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

// Common IANA timezones offered in the per-employee timezone dropdown.
// Covers North America + Europe + APAC + Middle East — admins can leave it
// empty to inherit the organization's timezone.
const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Amsterdam',
  'Europe/Istanbul',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Riyadh',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Pacific/Auckland'
];

const WEEKDAY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' }
];

interface EmployeeFormData {
  name: string;
  email: string;
  role: string;
  department: string;
  hourlyRate: string;
  currency: string;
  timezone: string;            // '' = inherit org tz
  businessHoursEnabled: boolean;
  businessHoursStart: string;  // "HH:MM"
  businessHoursEnd: string;    // "HH:MM"
  businessHoursDays: number[]; // ISO weekdays: 1..7
  jobRoleType: string;         // 'auto' | 'developer' | ...
}

const emptyFormData = (defaultCurrency: string): EmployeeFormData => ({
  name: '',
  email: '',
  role: 'employee',
  department: '',
  hourlyRate: '',
  currency: defaultCurrency,
  timezone: '',
  businessHoursEnabled: false,
  businessHoursStart: '09:00',
  businessHoursEnd: '17:00',
  businessHoursDays: [1, 2, 3, 4, 5],
  jobRoleType: 'auto'
});

export const Employees: React.FC = () => {
  const { org } = useAuth();
  const defaultCurrency = org?.defaultCurrency || 'USD';
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [setupToken, setSetupToken] = useState<{ token: string; employeeName: string } | null>(null);
  const [formData, setFormData] = useState<EmployeeFormData>(emptyFormData(defaultCurrency));

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
    if (formData.businessHoursEnabled) {
      if (!/^\d{2}:\d{2}$/.test(formData.businessHoursStart) || !/^\d{2}:\d{2}$/.test(formData.businessHoursEnd)) {
        setFormError('Business hours must be in HH:MM format');
        return;
      }
      if (formData.businessHoursDays.length === 0) {
        setFormError('Pick at least one business day');
        return;
      }
    }

    const url = editingEmployee
      ? `/api/employees/${editingEmployee.id}`
      : '/api/employees';

    try {
      const payload: any = {
        name: formData.name,
        email: formData.email,
        role: formData.role,
        department: formData.department,
        hourlyRate: parseFloat(formData.hourlyRate) || 0,
        currency: formData.currency || defaultCurrency,
        timezone: formData.timezone || null,
        businessHoursStart: formData.businessHoursEnabled ? formData.businessHoursStart : null,
        businessHoursEnd:   formData.businessHoursEnabled ? formData.businessHoursEnd : null,
        businessHoursDays:  formData.businessHoursEnabled ? formData.businessHoursDays.join(',') : null
      };

      const data = editingEmployee
        ? await api.put(url, payload)
        : await api.post(url, payload);

      if (!data.success) {
        throw new Error(data.error || 'Failed to save employee');
      }

      const savedEmployeeId = editingEmployee?.id || data.data?.id;

      // If admin picked a non-auto job role, push it via the role override endpoint.
      if (savedEmployeeId && formData.jobRoleType && formData.jobRoleType !== 'auto') {
        try {
          await api.put(`/api/roles/${savedEmployeeId}`, { roleType: formData.jobRoleType });
        } catch (roleErr) {
          console.warn('Role override failed (employee saved OK):', roleErr);
        }
      }

      setShowForm(false);
      setEditingEmployee(null);
      setFormData(emptyFormData(defaultCurrency));
      loadEmployees();
    } catch (err) {
      console.error('Error saving employee:', err);
      setFormError(err instanceof Error ? err.message : 'Failed to save employee');
    }
  };

  const handleEdit = async (employee: Employee) => {
    setEditingEmployee(employee);

    // Parse business hours days "1,2,3,4,5" → [1,2,3,4,5]
    const daysArr = (employee.businessHoursDays || '')
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => n >= 1 && n <= 7);

    // Fetch the currently detected/overridden job role so we can pre-fill the
    // dropdown. Failures here fall back silently to "auto" so editing still works
    // even if the role endpoint is flaky.
    let currentJobRole = 'auto';
    try {
      const roleRes = await api.get(`/api/roles/${employee.id}`);
      if (roleRes?.success && roleRes.data?.status === 'admin_override') {
        currentJobRole = roleRes.data.roleType || 'auto';
      }
    } catch {
      /* silent */
    }

    setFormData({
      name: employee.name,
      email: employee.email,
      role: employee.role,
      department: employee.department || '',
      hourlyRate: employee.hourlyRate?.toString() || '',
      currency: employee.currency || defaultCurrency,
      timezone: employee.timezone || '',
      businessHoursEnabled: !!(employee.businessHoursStart && employee.businessHoursEnd && daysArr.length),
      businessHoursStart: employee.businessHoursStart || '09:00',
      businessHoursEnd:   employee.businessHoursEnd   || '17:00',
      businessHoursDays:  daysArr.length > 0 ? daysArr : [1, 2, 3, 4, 5],
      jobRoleType: currentJobRole
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
            setFormData(emptyFormData(defaultCurrency));
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
                <label style={styles.label}>Hourly Rate</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select
                    value={formData.currency}
                    onChange={e => setFormData({ ...formData, currency: e.target.value })}
                    style={{ ...styles.input, flex: '0 0 110px' }}
                    aria-label="Currency"
                  >
                    {SUPPORTED_CURRENCIES.map(c => (
                      <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    placeholder="e.g. 50"
                    value={formData.hourlyRate}
                    onChange={e => setFormData({ ...formData, hourlyRate: e.target.value })}
                    style={{ ...styles.input, flex: 1 }}
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Job Type (for productivity scoring)</label>
                <select
                  value={formData.jobRoleType}
                  onChange={e => setFormData({ ...formData, jobRoleType: e.target.value })}
                  style={styles.input}
                >
                  {JOB_ROLES.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.icon}  {r.label}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: '11px', color: '#95a5a6', marginTop: '4px' }}>
                  "Auto-detect" lets ArchTrack pick based on app usage. Override here if it's wrong.
                </div>
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Timezone</label>
                <select
                  value={formData.timezone}
                  onChange={e => setFormData({ ...formData, timezone: e.target.value })}
                  style={styles.input}
                >
                  <option value="">Inherit organization ({org?.timezone || 'UTC'})</option>
                  {COMMON_TIMEZONES.map(tz => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>

              <div style={styles.inputGroup}>
                <label style={{ ...styles.label, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={formData.businessHoursEnabled}
                    onChange={e => setFormData({ ...formData, businessHoursEnabled: e.target.checked })}
                  />
                  Restrict tracking to business hours
                </label>
                {formData.businessHoursEnabled && (
                  <div style={{
                    marginTop: '8px',
                    padding: '12px',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', color: '#555', minWidth: '40px' }}>Start</span>
                      <input
                        type="time"
                        value={formData.businessHoursStart}
                        onChange={e => setFormData({ ...formData, businessHoursStart: e.target.value })}
                        style={{ ...styles.input, flex: 1 }}
                      />
                      <span style={{ fontSize: '12px', color: '#555', minWidth: '30px', textAlign: 'right' as const }}>End</span>
                      <input
                        type="time"
                        value={formData.businessHoursEnd}
                        onChange={e => setFormData({ ...formData, businessHoursEnd: e.target.value })}
                        style={{ ...styles.input, flex: 1 }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' as const }}>
                      {WEEKDAY_OPTIONS.map(day => {
                        const selected = formData.businessHoursDays.includes(day.value);
                        return (
                          <button
                            type="button"
                            key={day.value}
                            onClick={() => {
                              setFormData(prev => ({
                                ...prev,
                                businessHoursDays: selected
                                  ? prev.businessHoursDays.filter(d => d !== day.value)
                                  : [...prev.businessHoursDays, day.value].sort()
                              }));
                            }}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '6px',
                              border: '1px solid #ddd',
                              cursor: 'pointer',
                              backgroundColor: selected ? '#3498db' : '#fff',
                              color: selected ? '#fff' : '#555',
                              fontSize: '12px',
                              fontWeight: 500
                            }}
                          >
                            {day.label}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: '11px', color: '#95a5a6' }}>
                      Activity tracked outside these hours is stored but shown separately in Reports.
                    </div>
                  </div>
                )}
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
            <h2 style={styles.modalTitle}>Setup Token for {setupToken.employeeName}</h2>
            <div style={{
              backgroundColor: '#f8f9fa',
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
              padding: '16px',
              fontFamily: 'monospace',
              fontSize: '13px',
              wordBreak: 'break-all' as const,
              color: '#2c3e50',
              marginBottom: '12px',
            }}>
              {setupToken.token}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
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
            <div style={{
              backgroundColor: '#f0f7ff',
              border: '1px solid #d0e3f7',
              borderRadius: '8px',
              padding: '14px 16px',
              marginBottom: '12px',
            }}>
              <p style={{ fontSize: '13px', color: '#2c3e50', margin: '0 0 8px', lineHeight: '1.5' }}>
                Share this token with <strong>{setupToken.employeeName}</strong>. They will need it to connect their desktop app.
              </p>
              <p style={{ fontSize: '12px', color: '#7f8c8d', margin: 0, lineHeight: '1.5' }}>
                The token expires in 7 days and can only be used once.
              </p>
            </div>
            <a
              href="https://github.com/maximizeGPT/Archtrack#3-install-the-desktop-tracker"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                fontSize: '13px',
                color: '#3498db',
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              View setup instructions on GitHub &rarr;
            </a>
          </div>
        </div>
      )}

      {employees.length === 0 && (
        <div style={{
          textAlign: 'center' as const,
          padding: '60px 20px',
          backgroundColor: '#fff',
          borderRadius: '12px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>👥</div>
          <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#2c3e50', margin: '0 0 8px' }}>
            No employees yet
          </h2>
          <p style={{ fontSize: '14px', color: '#7f8c8d', margin: '0 0 24px' }}>
            Add your first team member to start tracking.
          </p>
          <button
            onClick={() => {
              setEditingEmployee(null);
              setFormData(emptyFormData(defaultCurrency));
              setShowForm(true);
            }}
            style={{
              padding: '12px 32px',
              backgroundColor: '#27ae60',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '15px',
              fontWeight: 600,
            }}
          >
            + Add Employee
          </button>
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
              {employee.hourlyRate ? (
                <p style={styles.info}>
                  💰 {formatCurrency(employee.hourlyRate, employee.currency || defaultCurrency)}/hr
                </p>
              ) : null}
              {employee.businessHoursStart && employee.businessHoursEnd && employee.businessHoursDays ? (
                <p style={styles.info}>
                  🕘 {employee.businessHoursStart}–{employee.businessHoursEnd}
                  {' '}({employee.businessHoursDays})
                </p>
              ) : null}
              {employee.timezone ? (
                <p style={{ ...styles.info, fontSize: '12px', color: '#95a5a6' }}>
                  🌐 {employee.timezone}
                </p>
              ) : null}
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
