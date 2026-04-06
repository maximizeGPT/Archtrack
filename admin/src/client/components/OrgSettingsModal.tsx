import React, { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { SUPPORTED_CURRENCIES } from '../../../shared-types';

// Small IANA timezone picker — mirrors the list in Employees.tsx.
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

interface Props {
  onClose: () => void;
}

const MAX_LOGO_BYTES = 1_000_000;
const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

export const OrgSettingsModal: React.FC<Props> = ({ onClose }) => {
  const { org, updateOrg } = useAuth();
  const [name, setName] = useState(org?.name || '');
  const [timezone, setTimezone] = useState(org?.timezone || 'UTC');
  const [defaultCurrency, setDefaultCurrency] = useState(org?.defaultCurrency || 'USD');
  const [logoUrl, setLogoUrl] = useState<string | null>(org?.logoUrl || null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset the error whenever the user changes anything meaningful.
  useEffect(() => { setError(null); }, [name, timezone, defaultCurrency, logoUrl]);

  // Auto-clear the success flash after 1.5s so it doesn't linger.
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1500);
    return () => clearTimeout(t);
  }, [flash]);

  // Close the modal when the user clicks backdrop or Cancel. Reusable so
  // the Save path can also trigger it.
  const closeModal = useCallback(() => onClose(), [onClose]);

  const handleSaveSettings = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await api.put('/api/organization', {
        name,
        timezone,
        defaultCurrency
      });
      if (!res.success) throw new Error(res.error || 'Save failed');
      updateOrg({ name: res.data.name, timezone: res.data.timezone, defaultCurrency: res.data.defaultCurrency });
      // Close the modal on success so the user gets clear feedback that
      // the save completed. The sidebar already reflects the new values.
      closeModal();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleLogoPick = () => fileInputRef.current?.click();

  const handleLogoUpload = async (file: File) => {
    setError(null);
    if (!ALLOWED_MIME.includes(file.type)) {
      setError('Logo must be PNG, JPEG, WebP, or SVG.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError(`Logo must be under ${MAX_LOGO_BYTES / 1000} KB.`);
      return;
    }
    setUploading(true);
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1] || '');
        reader.onerror = () => reject(new Error('Could not read file'));
        reader.readAsDataURL(file);
      });
      const res = await api.post('/api/organization/logo', { mimeType: file.type, dataBase64 });
      if (!res.success) throw new Error(res.error || 'Logo upload failed');
      setLogoUrl(res.data.logoUrl);
      updateOrg({ logoUrl: res.data.logoUrl });
      setFlash('Logo uploaded');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const handleLogoRemove = async () => {
    setError(null);
    setUploading(true);
    try {
      const res = await api.delete('/api/organization/logo');
      if (!res.success) throw new Error(res.error || 'Logo removal failed');
      setLogoUrl(null);
      updateOrg({ logoUrl: null });
      setFlash('Logo removed');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000
      }}
      onClick={closeModal}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          backgroundColor: '#fff',
          borderRadius: '12px',
          padding: 'clamp(16px, 4vw, 32px)',
          width: '100%',
          maxWidth: '520px',
          maxHeight: '90vh',
          overflowY: 'auto',
          margin: '0 12px',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, color: '#2c3e50' }}>Organization Settings</h2>
          <button
            onClick={closeModal}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              color: '#95a5a6',
              cursor: 'pointer'
            }}
          >
            ✕
          </button>
        </div>

        {error && (
          <div style={{
            backgroundColor: '#fdf2f2',
            border: '1px solid #fee2e2',
            color: '#e74c3c',
            padding: '10px 12px',
            borderRadius: '6px',
            marginBottom: '12px',
            fontSize: '13px'
          }}>
            ⚠️ {error}
          </div>
        )}

        {flash && !error && (
          <div style={{
            backgroundColor: '#f0f9f0',
            border: '1px solid #c6e6c6',
            color: '#27ae60',
            padding: '10px 12px',
            borderRadius: '6px',
            marginBottom: '12px',
            fontSize: '13px',
            fontWeight: 500
          }}>
            ✅ {flash}
          </div>
        )}

        {/* Logo section */}
        <section style={{ marginBottom: '24px' }}>
          <div style={labelStyle}>Company Logo</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '12px',
              backgroundColor: '#f8f9fa',
              border: '1px dashed #d0d5dd',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden'
            }}>
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Logo preview"
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                />
              ) : (
                <span style={{ fontSize: '11px', color: '#95a5a6', textAlign: 'center' as const }}>
                  No logo
                </span>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_MIME.join(',')}
                style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handleLogoUpload(file);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={handleLogoPick}
                disabled={uploading}
                style={primaryBtn}
              >
                {uploading ? 'Uploading…' : (logoUrl ? 'Replace Logo' : 'Upload Logo')}
              </button>
              {logoUrl && (
                <button
                  type="button"
                  onClick={handleLogoRemove}
                  disabled={uploading}
                  style={{ ...ghostBtn, marginLeft: '8px' }}
                >
                  Remove
                </button>
              )}
              <div style={{ fontSize: '11px', color: '#95a5a6', marginTop: '6px' }}>
                PNG, JPEG, WebP or SVG. Max {MAX_LOGO_BYTES / 1000} KB.
              </div>
            </div>
          </div>
        </section>

        {/* Name */}
        <section style={{ marginBottom: '16px' }}>
          <div style={labelStyle}>Organization Name</div>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            style={inputStyle}
          />
        </section>

        {/* Timezone */}
        <section style={{ marginBottom: '16px' }}>
          <div style={labelStyle}>Default Timezone</div>
          <select
            value={timezone}
            onChange={e => setTimezone(e.target.value)}
            style={inputStyle}
          >
            {COMMON_TIMEZONES.map(tz => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
          <div style={{ fontSize: '11px', color: '#95a5a6', marginTop: '4px' }}>
            Used for the "today" boundary on the Dashboard and Reports. Employees can override their own.
          </div>
        </section>

        {/* Default currency */}
        <section style={{ marginBottom: '20px' }}>
          <div style={labelStyle}>Default Currency</div>
          <select
            value={defaultCurrency}
            onChange={e => setDefaultCurrency(e.target.value)}
            style={inputStyle}
          >
            {SUPPORTED_CURRENCIES.map(c => (
              <option key={c.code} value={c.code}>{c.symbol} — {c.label} ({c.code})</option>
            ))}
          </select>
          <div style={{ fontSize: '11px', color: '#95a5a6', marginTop: '4px' }}>
            New employees inherit this. Each employee can still use a different one.
          </div>
        </section>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button type="button" onClick={closeModal} style={ghostBtn}>Cancel</button>
          <button
            type="button"
            onClick={handleSaveSettings}
            disabled={saving}
            style={primaryBtn}
          >
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};

const labelStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: '#555',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom: '6px'
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #ddd',
  borderRadius: '6px',
  fontSize: '14px',
  boxSizing: 'border-box'
};

const primaryBtn: React.CSSProperties = {
  padding: '10px 16px',
  backgroundColor: '#3498db',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 500
};

const ghostBtn: React.CSSProperties = {
  padding: '10px 16px',
  backgroundColor: '#ecf0f1',
  color: '#333',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '13px'
};
