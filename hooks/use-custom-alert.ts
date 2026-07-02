import { useEffect, useState } from 'react';

export interface AlertConfig {
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
}

// Global state
let alertListeners: Set<(alert: AlertConfig | null) => void> = new Set();

// Export for component to subscribe
export const subscribeToAlerts = (callback: (alert: AlertConfig | null) => void) => {
  alertListeners.add(callback);
  return () => alertListeners.delete(callback);
};

export const useCustomAlert = () => {
  const [currentAlert, setCurrentAlert] = useState<AlertConfig | null>(null);

  // Subscribe to global alert changes
  useEffect(() => {
    const unsubscribe = subscribeToAlerts((alert) => {
      setCurrentAlert(alert);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const showAlert = (type: 'success' | 'error' | 'info', title: string, message: string) => {
    const alert: AlertConfig = { type, title, message };
    alertListeners.forEach(listener => listener(alert));

    // Auto dismiss after 3 seconds
    setTimeout(() => {
      alertListeners.forEach(listener => listener(null));
    }, 3000);
  };

  return {
    currentAlert,
    showSuccess: (title: string, message: string) => showAlert('success', title, message),
    showError: (title: string, message: string) => showAlert('error', title, message),
    showInfo: (title: string, message: string) => showAlert('info', title, message),
  };
};
