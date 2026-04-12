import React, { useState, useEffect } from 'react';

const GITHUB_RELEASE_URL = 'https://github.com/maximizeGPT/Archtrack/releases/latest';

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

type DetectedOS = 'mac-arm' | 'mac-intel' | 'windows' | 'unknown';

function detectOS(): DetectedOS {
  const ua = navigator.userAgent.toLowerCase();
  const platform = (navigator as any).userAgentData?.platform?.toLowerCase() || navigator.platform?.toLowerCase() || '';

  if (ua.includes('win') || platform.includes('win')) return 'windows';
  if (ua.includes('mac') || platform.includes('mac')) {
    // Check for Apple Silicon — WebGL renderer is the most reliable signal
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') as WebGLRenderingContext | null;
      if (gl) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) {
          const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL).toLowerCase();
          if (renderer.includes('apple m') || renderer.includes('apple gpu')) return 'mac-arm';
        }
      }
    } catch {}
    return 'mac-intel';
  }
  return 'unknown';
}

function formatSize(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(0) + ' MB';
}

export const Download: React.FC = () => {
  const [os, setOS] = useState<DetectedOS>('unknown');
  const [assets, setAssets] = useState<ReleaseAsset[]>([]);
  const [version, setVersion] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setOS(detectOS());

    fetch('https://api.github.com/repos/maximizeGPT/Archtrack/releases/latest')
      .then(r => r.json())
      .then(data => {
        if (data.assets) {
          setAssets(data.assets);
          setVersion(data.tag_name || '');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const findAsset = (pattern: string): ReleaseAsset | undefined =>
    assets.find(a => a.name.toLowerCase().includes(pattern.toLowerCase()));

  const macArmDmg = findAsset('arm64.dmg');
  const macIntelDmg = findAsset('1.0.0.dmg') || assets.find(a => a.name.endsWith('.dmg') && !a.name.includes('arm64'));
  const windowsExe = findAsset('.exe');

  const primaryAsset = os === 'windows' ? windowsExe
    : os === 'mac-arm' ? macArmDmg
    : os === 'mac-intel' ? macIntelDmg
    : macArmDmg;

  const primaryLabel = os === 'windows' ? 'Download for Windows'
    : os === 'mac-arm' ? 'Download for Mac (Apple Silicon)'
    : os === 'mac-intel' ? 'Download for Mac (Intel)'
    : 'Download for Mac';

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        <div style={styles.logoSection}>
          <div style={styles.logoIcon}>📊</div>
          <h1 style={styles.title}>ArchTrack</h1>
          <p style={styles.subtitle}>Desktop Tracker {version}</p>
        </div>

        <p style={styles.description}>
          Install the ArchTrack desktop tracker on each employee's computer.
          It runs silently in the background and syncs activity data to your admin dashboard.
        </p>

        {loading ? (
          <div style={styles.loading}>Loading latest release...</div>
        ) : primaryAsset ? (
          <>
            <a href={primaryAsset.browser_download_url} style={styles.primaryButton}>
              {primaryLabel}
              <span style={styles.size}>{formatSize(primaryAsset.size)}</span>
            </a>

            <div style={styles.otherDownloads}>
              <p style={styles.otherLabel}>Other platforms:</p>
              <div style={styles.otherButtons}>
                {macArmDmg && os !== 'mac-arm' && (
                  <a href={macArmDmg.browser_download_url} style={styles.secondaryButton}>
                    Mac (Apple Silicon) <span style={styles.size}>{formatSize(macArmDmg.size)}</span>
                  </a>
                )}
                {macIntelDmg && os !== 'mac-intel' && (
                  <a href={macIntelDmg.browser_download_url} style={styles.secondaryButton}>
                    Mac (Intel) <span style={styles.size}>{formatSize(macIntelDmg.size)}</span>
                  </a>
                )}
                {windowsExe && os !== 'windows' && (
                  <a href={windowsExe.browser_download_url} style={styles.secondaryButton}>
                    Windows <span style={styles.size}>{formatSize(windowsExe.size)}</span>
                  </a>
                )}
              </div>
            </div>
          </>
        ) : (
          <a href={GITHUB_RELEASE_URL} style={styles.primaryButton} target="_blank" rel="noopener noreferrer">
            View Downloads on GitHub
          </a>
        )}

        <div style={styles.steps}>
          <h3 style={styles.stepsTitle}>Setup Instructions</h3>
          {os === 'windows' ? (
            <ol style={styles.stepsList}>
              <li>Run the installer and follow the wizard</li>
              <li>If Windows shows a SmartScreen warning, click <strong>More info</strong> then <strong>Run anyway</strong></li>
              <li>Enter the setup token from your admin (Employees page &rarr; Setup Token)</li>
              <li>ArchTrack runs silently — no further action needed</li>
            </ol>
          ) : (
            <ol style={styles.stepsList}>
              <li>Open the DMG and drag <strong>ArchTrack</strong> to Applications</li>
              <li>Right-click ArchTrack in Applications &rarr; <strong>Open</strong> &rarr; <strong>Open Anyway</strong></li>
              <li>Grant <strong>Screen Recording</strong> and <strong>Accessibility</strong> permissions when prompted</li>
              <li>Enter the setup token from your admin (Employees page &rarr; Setup Token)</li>
              <li>ArchTrack runs silently — no further action needed</li>
            </ol>
          )}
        </div>

        <div style={styles.footer}>
          <a href="/login" style={styles.footerLink}>Admin Login</a>
          <span style={styles.footerDot}>&middot;</span>
          <a href="https://github.com/maximizeGPT/Archtrack" target="_blank" rel="noopener noreferrer" style={styles.footerLink}>GitHub</a>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: '20px',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '16px',
    padding: '40px',
    maxWidth: '520px',
    width: '100%',
    boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
  },
  logoSection: {
    textAlign: 'center' as const,
    marginBottom: '24px',
  },
  logoIcon: {
    fontSize: '48px',
    marginBottom: '8px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    color: '#2c3e50',
    margin: '0 0 4px',
  },
  subtitle: {
    fontSize: '14px',
    color: '#7f8c8d',
    margin: 0,
  },
  description: {
    fontSize: '15px',
    color: '#555',
    lineHeight: '1.6',
    textAlign: 'center' as const,
    marginBottom: '28px',
  },
  loading: {
    textAlign: 'center' as const,
    color: '#7f8c8d',
    padding: '20px',
  },
  primaryButton: {
    display: 'block',
    textAlign: 'center' as const,
    padding: '16px 24px',
    backgroundColor: '#3498db',
    color: '#fff',
    borderRadius: '10px',
    textDecoration: 'none',
    fontSize: '16px',
    fontWeight: 600,
    marginBottom: '20px',
    transition: 'background-color 0.2s',
  },
  size: {
    display: 'block',
    fontSize: '12px',
    opacity: 0.8,
    marginTop: '4px',
  },
  otherDownloads: {
    marginBottom: '28px',
  },
  otherLabel: {
    fontSize: '13px',
    color: '#7f8c8d',
    marginBottom: '8px',
    textAlign: 'center' as const,
  },
  otherButtons: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'center',
    flexWrap: 'wrap' as const,
  },
  secondaryButton: {
    padding: '10px 16px',
    backgroundColor: '#f0f2f5',
    color: '#2c3e50',
    borderRadius: '8px',
    textDecoration: 'none',
    fontSize: '13px',
    fontWeight: 500,
  },
  steps: {
    backgroundColor: '#f8f9fa',
    borderRadius: '12px',
    padding: '20px 24px',
    marginBottom: '24px',
  },
  stepsTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#2c3e50',
    margin: '0 0 12px',
  },
  stepsList: {
    margin: 0,
    paddingLeft: '20px',
    fontSize: '14px',
    color: '#555',
    lineHeight: '1.8',
  },
  footer: {
    textAlign: 'center' as const,
    fontSize: '13px',
  },
  footerLink: {
    color: '#3498db',
    textDecoration: 'none',
  },
  footerDot: {
    margin: '0 8px',
    color: '#ccc',
  },
};
