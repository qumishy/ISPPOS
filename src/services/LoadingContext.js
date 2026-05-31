import React, { createContext, useContext, useState, useCallback } from 'react';

const LoadingContext = createContext({
  loading: false,
  message: '',
  progress: null,
  showLoading: (msg) => {},
  setLoadingProgress: (msg, progress) => {},
  hideLoading: () => {},
});

export function LoadingProvider({ children }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState(null);

  const showLoading = useCallback((msg = 'يرجى الانتظار...') => {
    setMessage(msg);
    setProgress(null);
    setLoading(true);
  }, []);

  const setLoadingProgress = useCallback((msg = 'يرجى الانتظار...', pct = null) => {
    setMessage(msg);
    setProgress(typeof pct === 'number' ? Math.max(0, Math.min(100, Math.round(pct))) : null);
    setLoading(true);
  }, []);

  const hideLoading = useCallback(() => {
    setLoading(false);
    setMessage('');
    setProgress(null);
  }, []);

  return (
    <LoadingContext.Provider value={{ loading, message, progress, showLoading, setLoadingProgress, hideLoading }}>
      {children}
    </LoadingContext.Provider>
  );
}

export const useLoading = () => useContext(LoadingContext);
